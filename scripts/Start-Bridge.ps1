param([switch]$Full)
$ErrorActionPreference = 'Stop'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is not installed or not on PATH.' }
if (-not (Test-Path '.env')) { Copy-Item '.env.example' '.env' }
$backupRoot = Join-Path $PWD '.bridge-backups'
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item '.env' (Join-Path $backupRoot "env-$stamp.bak") -Force
$args = @('compose')
if ($Full) { $args += @('--profile','full') }
$args += @('up','--build','-d')
& docker @args
if ($LASTEXITCODE -ne 0) { throw "docker compose failed with exit code $LASTEXITCODE" }
& docker compose ps
