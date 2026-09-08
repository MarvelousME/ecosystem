$ErrorActionPreference='Stop'
& docker compose --profile full down
if ($LASTEXITCODE -ne 0) { throw "docker compose down failed with exit code $LASTEXITCODE" }
