param(
  [switch]$Full,
  [string]$BaseUrl = 'http://localhost:4000'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Log([string]$Message, [string]$Level = 'INFO') {
  $ts = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
  Write-Host "[$ts][$Level] $Message"
}

function Invoke-Json([string]$Method, [string]$Url, [hashtable]$Headers = @{}, $Body = $null) {
  $params = @{ Method = $Method; Uri = $Url; Headers = $Headers }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
  }
  return Invoke-RestMethod @params
}

function Assert-True([bool]$Condition, [string]$Name) {
  if (-not $Condition) { throw "ASSERT FAIL: $Name" }
  Write-Log "PASS $Name" 'PASS'
}

$failed = 0
try {
  Write-Log "Health check $BaseUrl/health"
  $health = Invoke-Json GET "$BaseUrl/health"
  Assert-True ($health.status -eq 'healthy') 'api.health'

  $headers = @{
    'x-actor-roles' = 'platform.admin'
    'x-bridge-envelope' = '1'
  }
  $tenants = Invoke-Json GET "$BaseUrl/api/tenants" $headers
  $tenantId = $tenants.data[0].id
  Assert-True ([bool]$tenantId) 'tenants.list'
  $headers['x-tenant-id'] = $tenantId

  $apps = Invoke-Json GET "$BaseUrl/api/apps" $headers
  Assert-True ($apps.data.Count -ge 3) 'apps.multi-app-demo'

  $metrics = Invoke-Json GET "$BaseUrl/api/command-center" $headers
  Assert-True ($metrics.data.tenants -ge 1) 'command-center.real-metrics'

  # Billing idempotency
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

  # Multi-site phone change preview
  $phone = '+1-555-0420'
  $preview = Invoke-Json POST "$BaseUrl/api/ai/website/phone-change" $headers @{
    phone = $phone
    publish = $false
  }
  Assert-True ($preview.data.requiresApproval -eq $true) 'ai.phone.preview-requires-approval'
  Assert-True ($preview.data.changesets.Count -ge 2) 'ai.phone.multi-app-changesets'

  foreach ($cs in $preview.data.changesets) {
    $pub = Invoke-Json POST "$BaseUrl/api/changesets/$($cs.id)/approve" $headers @{}
    Assert-True ($pub.data.changeset.status -eq 'published') "ai.phone.publish.$($cs.id)"
  }

  # Isolation
  if ($tenants.data.Count -ge 1) {
    $iso = Invoke-Json GET "$BaseUrl/api/isolation/check?foreignTenantId=$([guid]::NewGuid())" $headers
    Assert-True ($iso.data.isolated -eq $true) 'tenant.isolation'
  }

  # Provision saga
  $saga = Invoke-Json POST "$BaseUrl/api/provision" $headers @{
    name = "Saga App $([guid]::NewGuid())"
    appType = 'nextjs'
    launchUrl = 'http://localhost:5173'
    databaseEngine = 'postgresql'
  }
  Start-Sleep -Seconds 3
  $sagaStatus = Invoke-Json GET "$BaseUrl/api/sagas/$($saga.data.id)" $headers
  Assert-True ($sagaStatus.data.state -eq 'completed') 'provision.saga.completed'

  Write-Log 'All executable tests passed' 'PASS'
  exit 0
}
catch {
  Write-Log $_ 'FAIL'
  exit 1
}
