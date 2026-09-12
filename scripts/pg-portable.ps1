# ---------------------------------------------------------------------------
# Portable PostgreSQL control script (no Docker, no install, no admin rights).
#
# This is the stop-gap used while Docker Desktop's Linux engine is unavailable
# (it needs WSL2). The canonical setup is still `docker compose up -d` — see
# README.md. Both bind the same port (5433) and the same credentials, so
# DATABASE_URL does not change between them. Do not run both at once.
#
#   ./scripts/pg-portable.ps1 start
#   ./scripts/pg-portable.ps1 stop
#   ./scripts/pg-portable.ps1 status
#   ./scripts/pg-portable.ps1 install   # download + initdb, first run only
# ---------------------------------------------------------------------------
param(
  [ValidateSet('start', 'stop', 'status', 'install')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'

# Kept outside the repo so `git clean` and IDE indexers never touch the cluster.
$Root    = Join-Path $env:LOCALAPPDATA 'menuland-pg'
$Dist    = Join-Path $Root 'dist'
$DataDir = Join-Path $Root 'data'
$LogFile = Join-Path $Root 'server.log'
$PgCtl   = Join-Path $Dist 'bin\pg_ctl.exe'
$Port    = 5433
$PgUser  = 'menuland'
$PgPass  = 'menuland'
$PgDb    = 'menuland'
$Version = '16.4.0'

function Install-Postgres {
  if (Test-Path $PgCtl) { Write-Host "Binaries already present at $Dist"; return }

  New-Item -ItemType Directory -Force -Path $Root | Out-Null
  $jar = Join-Path $Root 'pg.jar'
  $url = "https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-windows-amd64/$Version/embedded-postgres-binaries-windows-amd64-$Version.jar"

  Write-Host "Downloading PostgreSQL $Version binaries (~22MB)…"
  Invoke-WebRequest -Uri $url -OutFile $jar -UseBasicParsing

  Write-Host 'Extracting…'
  $unpack = Join-Path $Root 'jar'
  New-Item -ItemType Directory -Force -Path $unpack | Out-Null
  Expand-Archive -Path $jar -DestinationPath $unpack -Force
  New-Item -ItemType Directory -Force -Path $Dist | Out-Null
  # tar.exe, not GNU tar: it handles Windows drive letters in paths correctly.
  tar.exe -xf (Join-Path $unpack 'postgres-windows-x86_64.txz') -C $Dist
  Remove-Item $jar, $unpack -Recurse -Force -ErrorAction SilentlyContinue

  Write-Host 'Initialising cluster…'
  $pwfile = Join-Path $Root 'pwfile'
  Set-Content -Path $pwfile -Value $PgPass -NoNewline -Encoding ascii
  & (Join-Path $Dist 'bin\initdb.exe') -D $DataDir -U $PgUser `
      --auth=scram-sha-256 --pwfile=$pwfile -E UTF8 --locale=C | Out-Null
  Remove-Item $pwfile -Force

  Start-Postgres
  Write-Host 'Creating database…'
  # `createdb` is absent from this minimal build, so use the app's own pg driver.
  node -e @"
const { Client } = require('pg');
(async () => {
  const c = new Client({ host:'127.0.0.1', port:$Port, user:'$PgUser', password:'$PgPass', database:'postgres' });
  await c.connect();
  const r = await c.query("SELECT 1 FROM pg_database WHERE datname='$PgDb'");
  if (!r.rowCount) await c.query('CREATE DATABASE $PgDb');
  await c.end();
})();
"@
  Write-Host "Ready. Now run: npx prisma migrate deploy; npx tsx prisma/seed.ts"
}

function Test-Listening {
  [bool](Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
         Where-Object { $_.LocalPort -eq $Port })
}

function Start-Postgres {
  if (-not (Test-Path $PgCtl)) { throw "Not installed. Run: ./scripts/pg-portable.ps1 install" }

  # Already up: say so and stop. `pg_ctl start` against a running cluster prints
  # "another server might be running; trying to start server anyway" and then
  # waits, which turned every redundant start into a stall.
  if (Test-Listening) { Get-Status; return }

  # Launched through Start-Process with its output redirected to files, NOT
  # called directly.
  #
  # pg_ctl exits but leaves postgres.exe running, and on Windows that child
  # inherits whatever stdout handle pg_ctl was given. Called directly from a
  # pipeline — `pg-portable.ps1 start | Out-Null`, or any caller that captures
  # output — the long-lived server keeps the pipe's write end open forever and
  # the reader never sees EOF, so the *caller* hangs even though Postgres
  # started correctly. Redirecting to a file hands the server a file handle
  # instead and the pipe closes when pg_ctl exits.
  # One pre-quoted string, not an array. Start-Process joins an array with
  # spaces and quotes nothing, so `-o "-p 5433"` arrived as two arguments and
  # pg_ctl read "5433" as its operation mode.
  $out = Join-Path $Root 'pg_ctl.out'
  $err = Join-Path $Root 'pg_ctl.err'
  $argLine = '-D "{0}" -l "{1}" -o "-p {2}" start' -f $DataDir, $LogFile, $Port
  Start-Process -FilePath $PgCtl -ArgumentList $argLine `
    -NoNewWindow -RedirectStandardOutput $out -RedirectStandardError $err | Out-Null

  <#
    Poll the port instead of waiting on the process.

    `-Wait` does not work here and neither does pg_ctl's own `-w`: postgres.exe
    outlives pg_ctl and inherits the redirected handles, so PowerShell keeps
    waiting for streams that the running server holds open for as long as it
    lives. The thing we actually care about is "is the port answering", so ask
    that directly and put a ceiling on it.
  #>
  $deadline = (Get-Date).AddSeconds(30)
  while (-not (Test-Listening) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 250
  }

  if (-not (Test-Listening)) {
    if (Test-Path $out) { Get-Content $out | ForEach-Object { Write-Host "  $_" } }
    if (Test-Path $err) { Get-Content $err | ForEach-Object { Write-Host "  $_" } }
    Write-Host "Server log: $LogFile"
    throw "PostgreSQL did not come up on port $Port within 30s"
  }

  Get-Status
}

function Stop-Postgres {
  if (-not (Test-Path $PgCtl)) { Write-Host 'Not installed.'; return }
  & $PgCtl -D $DataDir -m fast stop
}

function Get-Status {
  $listening = Test-Listening
  if ($listening) {
    Write-Host "PostgreSQL is UP on port $Port"
    Write-Host "DATABASE_URL=`"postgresql://$PgUser`:$PgPass@localhost:$Port/$PgDb`?schema=public`""
  } else {
    Write-Host "PostgreSQL is DOWN (nothing listening on $Port)"
  }
}

switch ($Action) {
  'install' { Install-Postgres }
  'start'   { Start-Postgres }
  'stop'    { Stop-Postgres }
  'status'  { Get-Status }
}
