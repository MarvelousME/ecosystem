param(
  [string]$OutputDir = '.\.bridge-backups\data'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is required' }
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dest = Join-Path $OutputDir "bridge-backup-$stamp"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Write-Host "Backing up Postgres..."
docker compose exec -T postgres pg_dump -U bridge bridge > (Join-Path $dest 'postgres.sql')
if ($LASTEXITCODE -ne 0) { throw 'postgres dump failed' }

Write-Host "Backing up WordPress DB..."
docker compose exec -T wordpress-db mariadb-dump -uwordpress -p"$env:WP_DB_PASSWORD" wordpress > (Join-Path $dest 'wordpress.sql') 2>$null
if ($LASTEXITCODE -ne 0) {
  # fallback using compose env
  docker compose exec -T wordpress-db sh -c 'mariadb-dump -uwordpress -p"$MARIADB_PASSWORD" wordpress' > (Join-Path $dest 'wordpress.sql')
  if ($LASTEXITCODE -ne 0) { throw 'wordpress dump failed' }
}

Copy-Item .env (Join-Path $dest 'env.bak') -ErrorAction SilentlyContinue
@(
  "created=$stamp"
  "includes=postgres,wordpress,env"
) | Set-Content (Join-Path $dest 'MANIFEST.txt')

Write-Host "Backup complete: $dest"
Write-Output $dest
exit 0
