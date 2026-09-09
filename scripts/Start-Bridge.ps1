#Requires -Version 5.1
param(
  [ValidateSet('Lab', 'Production')]
  [string]$Mode = 'Lab',
  [switch]$Full,
  [ValidateSet('databases', 'mongodb', 'mssql', '')]
  [string]$DbProfile = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Log([string]$Message, [string]$Level = 'INFO') {
  $ts = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
  Write-Host "[$ts][$Level] $Message"
}

function Invoke-DockerRetry([scriptblock]$Action, [int]$Retries = 5) {
  $attempt = 0
  while ($true) {
    $attempt++
    try {
      & $Action
      if ($LASTEXITCODE -ne 0) { throw "docker exit $LASTEXITCODE" }
      return
    } catch {
      if ($attempt -ge $Retries) { throw }
      Write-Log "retry $attempt/$Retries : $($_.Exception.Message)" 'WARN'
      Start-Sleep -Seconds ([Math]::Min(20, $attempt * 3))
    }
  }
}

try {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is not installed or not on PATH.'
  }

  $backupRoot = Join-Path $PWD '.bridge-backups'
  New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  if (Test-Path '.env') {
    Copy-Item '.env' (Join-Path $backupRoot "env-$stamp.bak") -Force
  } elseif (Test-Path '.env.example') {
    Copy-Item '.env.example' '.env'
    Copy-Item '.env' (Join-Path $backupRoot "env-$stamp.bak") -Force
    Write-Log 'Created .env from .env.example'
  }

  $composeFile = if ($Mode -eq 'Production') { 'docker-compose.prod.yml' } else { 'docker-compose.yml' }
  if (-not (Test-Path $composeFile)) { throw "Missing $composeFile" }

  if ($Mode -eq 'Production') {
    Write-Log 'Production preflight'
    $envMap = @{}
    Get-Content '.env' | ForEach-Object {
      if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
      $k, $v = $_.Split('=', 2)
      $envMap[$k.Trim()] = $v.Trim()
    }
    $required = @(
      'BRIDGE_DOMAIN', 'ACME_EMAIL', 'CLOUDFLARE_DNS_API_TOKEN',
      'BRIDGE_KMS_KEY_ID', 'BRIDGE_JWT_ISSUER', 'BRIDGE_JWT_AUDIENCE'
    )
    foreach ($k in $required) {
      if (-not $envMap[$k]) { throw "Production preflight missing $k" }
    }
    if (($envMap['BRIDGE_REQUIRE_JWT'] -ne '1') -and ($envMap['BRIDGE_REQUIRE_JWT'] -ne $null -and $envMap['BRIDGE_REQUIRE_JWT'] -ne '')) {
      if ($envMap['BRIDGE_REQUIRE_JWT'] -eq '0') { throw 'Production requires BRIDGE_REQUIRE_JWT=1' }
    }
    if ($envMap['BRIDGE_TRUST_HEADERS'] -eq '1') { throw 'Production requires BRIDGE_TRUST_HEADERS=0' }
    if ($envMap['BRIDGE_SECRETS_PROVIDER'] -and $envMap['BRIDGE_SECRETS_PROVIDER'] -ne 'aws-kms') {
      throw 'Production requires BRIDGE_SECRETS_PROVIDER=aws-kms'
    }
    Write-Log 'Production preflight PASS (secret values not printed)'
  }

  $args = @('compose', '-f', $composeFile)
  if ($Full) { $args += @('--profile', 'full') }
  if ($DbProfile) { $args += @('--profile', $DbProfile) }
  if ($Full -and -not $DbProfile) { $args += @('--profile', 'databases') }
  $args += @('up', '--build', '-d')

  Write-Log "Starting Bridge ($Mode) via $composeFile"
  Invoke-DockerRetry { & docker @args }
  & docker compose -f $composeFile ps
  Write-Log 'Start complete' 'PASS'
  exit 0
} catch {
  Write-Log $_.Exception.Message 'FAIL'
  exit 1
}
