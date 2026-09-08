param(
  [Parameter(Mandatory = $true)][string]$BackupDir
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not (Test-Path $BackupDir)) { throw "BackupDir not found: $BackupDir" }
$pg = Join-Path $BackupDir 'postgres.sql'
$wp = Join-Path $BackupDir 'wordpress.sql'
if (-not (Test-Path $pg)) { throw 'postgres.sql missing' }

Write-Host "Restoring Postgres from $pg"
Get-Content $pg -Raw | docker compose exec -T postgres psql -U bridge -d bridge
if ($LASTEXITCODE -ne 0) { throw 'postgres restore failed' }

if (Test-Path $wp) {
  Write-Host "Restoring WordPress DB from $wp"
  Get-Content $wp -Raw | docker compose exec -T wordpress-db sh -c 'mariadb -uwordpress -p"$MARIADB_PASSWORD" wordpress'
  if ($LASTEXITCODE -ne 0) { throw 'wordpress restore failed' }
}

Write-Host 'Restore completed'
exit 0
