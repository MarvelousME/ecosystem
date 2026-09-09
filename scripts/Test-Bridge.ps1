#Requires -Version 5.1
param(
  [ValidateSet('Lab', 'Production')]
  [string]$Mode = 'Lab',
  [switch]$Full,
  [string]$BaseUrl = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Log([string]$Message, [string]$Level = 'INFO') {
  $ts = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
  Write-Host "[$ts][$Level] $Message"
}

function Assert-True([bool]$Condition, [string]$Name) {
  if (-not $Condition) { throw "ASSERT FAIL: $Name" }
  Write-Log "PASS $Name" 'PASS'
}

function Invoke-Json([string]$Method, [string]$Url, [hashtable]$Headers = @{}, $Body = $null) {
  $params = @{ Method = $Method; Uri = $Url; Headers = $Headers }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
  }
  return Invoke-RestMethod @params
}

$failed = 0
try {
  if (-not $BaseUrl) {
    $BaseUrl = if ($Mode -eq 'Production') { "https://api.$($env:BRIDGE_DOMAIN)" } else { 'http://localhost:4000' }
  }

  Write-Log "Unit tests platform-api"
  Push-Location 'services/platform-api'
  npm run test:unit
  if ($LASTEXITCODE -ne 0) { throw 'platform-api unit tests failed' }
  Pop-Location

  Write-Log "Unit tests outbox-relay"
  Push-Location 'services/outbox-relay'
  if (-not (Test-Path 'node_modules')) { npm install --omit=dev }
  npm run test:unit
  if ($LASTEXITCODE -ne 0) { throw 'outbox-relay unit tests failed' }
  Pop-Location

  Write-Log "Worker invariants"
  Push-Location 'services/provision-worker'
  npm run test:unit
  if ($LASTEXITCODE -ne 0) { throw 'provision-worker tests failed' }
  Pop-Location

  php -l 'wordpress/plugins/bridge-connector/bridge-connector.php' | Out-Null
  Assert-True ($LASTEXITCODE -eq 0) 'php.syntax'

  $composeFile = if ($Mode -eq 'Production') { 'docker-compose.prod.yml' } else { 'docker-compose.yml' }
  docker compose -f $composeFile config -q
  Assert-True ($LASTEXITCODE -eq 0) 'compose.config'

  if ($Mode -eq 'Production') {
    Write-Log 'Production config checks (no secret values)'
    $envMap = @{}
    if (Test-Path '.env') {
      Get-Content '.env' | ForEach-Object {
        if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
        $k, $v = $_.Split('=', 2)
        $envMap[$k.Trim()] = $v.Trim()
      }
    }
    Assert-True (($envMap['BRIDGE_REQUIRE_JWT'] -eq '1') -or -not $envMap.ContainsKey('BRIDGE_REQUIRE_JWT')) 'prod.jwt.required'
    Assert-True ($envMap['BRIDGE_TRUST_HEADERS'] -ne '1') 'prod.headers.untrusted'
    Assert-True (($envMap['BRIDGE_SECRETS_PROVIDER'] -eq 'aws-kms') -or -not $envMap['BRIDGE_SECRETS_PROVIDER']) 'prod.kms.provider'
    if (-not $envMap['BRIDGE_DOMAIN']) { Write-Log 'BRIDGE_DOMAIN unset — UNVERIFIED ACME' 'WARN' }
    if (-not $envMap['BRIDGE_KMS_KEY_ID']) { Write-Log 'BRIDGE_KMS_KEY_ID unset — UNVERIFIED KMS' 'WARN' }
    if (-not $envMap['CLOUDFLARE_DNS_API_TOKEN']) { Write-Log 'CLOUDFLARE_DNS_API_TOKEN unset — UNVERIFIED ACME DNS-01' 'WARN' }
  }

  if ($Full) {
    Write-Log "Health check $BaseUrl/health"
    $health = Invoke-Json GET "$BaseUrl/health"
    Assert-True ($health.status -eq 'healthy') 'api.health'
    Assert-True ($health.outboxOnly -eq $true -or $health.natsPublish -eq $false) 'api.outbox-only'

    $headers = @{
      'x-actor-roles' = 'platform.admin'
      'x-actor-id' = 'bridgeadmin'
      'x-bridge-envelope' = '1'
    }
    if ($Mode -eq 'Production') {
      Write-Log 'Production mode expects Bearer JWT — skipping header-auth integration path (UNVERIFIED without token)' 'WARN'
    } else {
      $tenants = Invoke-Json GET "$BaseUrl/api/tenants" $headers
      $tenantId = $tenants.data[0].id
      Assert-True ([bool]$tenantId) 'tenants.list'
      $headers['x-tenant-id'] = $tenantId

      $apps = Invoke-Json GET "$BaseUrl/api/apps" $headers
      Assert-True ($apps.data.Count -ge 3) 'apps.multi-app-demo'

      $metrics = Invoke-Json GET "$BaseUrl/api/command-center" $headers
      Assert-True ($metrics.data.tenants -ge 1) 'command-center.real-metrics'

      $products = Invoke-Json GET "$BaseUrl/api/products" $headers
      $clients = Invoke-Json GET "$BaseUrl/api/clients" $headers
      if (-not $clients.data -or $clients.data.Count -eq 0) {
        $clients = Invoke-Json POST "$BaseUrl/api/clients" $headers @{ name = 'Test Client'; email = "test-$([guid]::NewGuid())@bridge.local" }
        $clientId = $clients.data.id
      } else {
        $clientId = $clients.data[0].id
      }
      $order = Invoke-Json POST "$BaseUrl/api/orders" $headers @{
        clientId = $clientId
        tenantId = $tenantId
        productId = $products.data[0].id
      }
      $eventKey = "test-$([guid]::NewGuid())"
      $pay1 = Invoke-Json POST "$BaseUrl/api/payments/webhook" $headers @{
        provider = 'manual'
        externalEventKey = $eventKey
        orderId = $order.data.id
      }
      $pay2 = Invoke-Json POST "$BaseUrl/api/payments/webhook" $headers @{
        provider = 'manual'
        externalEventKey = $eventKey
        orderId = $order.data.id
      }
      Assert-True ($pay1.data.duplicate -eq $false) 'billing.first-payment'
      Assert-True ($pay2.data.duplicate -eq $true) 'billing.idempotent-replay'

      $phone = '+1-555-0420'
      $preview = Invoke-Json POST "$BaseUrl/api/ai/website/phone-change" $headers @{
        phone = $phone
        publish = $false
      }
      Assert-True ($preview.data.requiresApproval -eq $true) 'ai.phone.preview-requires-approval'
      Assert-True ($preview.data.changesets.Count -ge 2) 'ai.phone.multi-app-changesets'

      foreach ($cs in $preview.data.changesets) {
        $pub = Invoke-Json POST "$BaseUrl/api/changesets/$($cs.id)/approve" $headers @{}
        Assert-True ($null -ne $pub.data) "ai.phone.publish.$($cs.id)"
      }

      $prov = Invoke-Json POST "$BaseUrl/api/provision" $headers @{
        name = "Prov-$([guid]::NewGuid().ToString().Substring(0,8))"
        appType = 'react'
        launchUrl = 'http://localhost:5173'
        databaseEngine = 'none'
      }
      $sagaId = $prov.data.id
      $deadline = (Get-Date).AddSeconds(45)
      $completed = $false
      while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
        $saga = Invoke-Json GET "$BaseUrl/api/sagas/$sagaId" $headers
        if ($saga.data.state -eq 'completed') { $completed = $true; break }
        if ($saga.data.state -eq 'failed') { throw "saga failed: $($saga.data.error)" }
      }
      Assert-True $completed 'provision.saga.completed'
    }
  }

  Write-Log "Test-Bridge $Mode complete" 'PASS'
  exit 0
} catch {
  Write-Log $_.Exception.Message 'FAIL'
  exit 1
}
