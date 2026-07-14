#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Install APD Detection sebagai Windows Service menggunakan NSSM.

.DESCRIPTION
    Mendaftarkan backend dan/atau frontend sebagai Windows Service.

    SERVICE NAMES:
      Backend  : APDDetectionBackend  (menjalankan backend/run_production.py)
      Frontend : APDDetectionFrontend (menjalankan frontend/run_production.ps1)

    MIGRASI: Jika ada service lama "APDDetection" (nama sebelum refactor),
      script ini otomatis menghapusnya sebelum install ulang.

    PENTING: Jalankan PowerShell sebagai Administrator.

.PARAMETER Backend
    Install backend service saja (APDDetectionBackend).

.PARAMETER Frontend
    Install frontend service saja (APDDetectionFrontend).

.PARAMETER All
    Install backend dan frontend (DEFAULT jika tidak ada argumen).

.EXAMPLE
    PowerShell -ExecutionPolicy Bypass -File install_service.ps1 -Backend
    PowerShell -ExecutionPolicy Bypass -File install_service.ps1 -Frontend
    PowerShell -ExecutionPolicy Bypass -File install_service.ps1 -All
    PowerShell -ExecutionPolicy Bypass -File install_service.ps1

.NOTES
    NSSM diunduh otomatis jika belum ada. Sumber: https://nssm.cc
#>

param(
    [switch]$Backend,
    [switch]$Frontend,
    [switch]$All
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Default: --All jika tidak ada argumen
if (-not $Backend -and -not $Frontend -and -not $All) { $All = $true }
if ($All) { $Backend = $true; $Frontend = $true }

# ============================================================
# KONSTANTA
# ============================================================
$RESTART_DELAY = 8000   # ms

$ROOT           = $PSScriptRoot
$BACKEND_DIR    = Join-Path $ROOT "backend"
$FRONTEND_DIR   = Join-Path $ROOT "frontend"
$VENV_PYTHON    = Join-Path $ROOT "venv\Scripts\python.exe"
$NODE_EXE       = (Get-Command node -ErrorAction SilentlyContinue)?.Source
$NPM_CMD        = (Get-Command npm  -ErrorAction SilentlyContinue)?.Source
$PRODUCTION_PY  = Join-Path $BACKEND_DIR "run_production.py"
$FRONTEND_PS1   = Join-Path $FRONTEND_DIR "run_production.ps1"
$ENV_FILE       = Join-Path $BACKEND_DIR ".env"
$LOGS_DIR       = Join-Path $ROOT "logs"
$NSSM_DIR       = Join-Path $ROOT "tools\nssm"
$NSSM_EXE       = Join-Path $NSSM_DIR "nssm.exe"

# Service names
$BACKEND_SVC    = "APDDetectionBackend"
$FRONTEND_SVC   = "APDDetectionFrontend"
$LEGACY_SVC     = "APDDetection"           # nama lama sebelum refactor

$BACKEND_DISPLAY  = "APD Detection — Backend (TPS)"
$FRONTEND_DISPLAY = "APD Detection — Frontend (TPS)"
$BACKEND_DESC     = "Real-time PPE detection backend Flask/Waitress — PT TPS Pelindo"
$FRONTEND_DESC    = "APD Detection Next.js production frontend — PT TPS Pelindo"

$BACKEND_PORT  = 5001
$FRONTEND_PORT = 3000

function Write-Step   { param($m) Write-Host "`n[STEP] $m" -ForegroundColor Cyan }
function Write-OK     { param($m) Write-Host "  [OK] $m"   -ForegroundColor Green }
function Write-Warn   { param($m) Write-Host "  [!]  $m"   -ForegroundColor Yellow }
function Write-Fail   { param($m) Write-Host "  [X]  $m"   -ForegroundColor Red }
function Write-Info   { param($m) Write-Host "       $m"   -ForegroundColor Gray }
function Write-Section{ param($m) Write-Host "`n══ $m ══"  -ForegroundColor Cyan }

# ============================================================
# HEADER
# ============================================================
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   APD Detection — Install Windows Service(s) (NSSM) ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "  Repo root  : $ROOT"
$installing = @()
if ($Backend)  { $installing += "Backend ($BACKEND_SVC)" }
if ($Frontend) { $installing += "Frontend ($FRONTEND_SVC)" }
Write-Host "  Installing : $($installing -join ' + ')"
Write-Host ""

# ============================================================
# STEP 1: MIGRASI — HAPUS SERVICE LAMA "APDDetection"
# ============================================================
Write-Step "Cek dan migrasi service lama '$LEGACY_SVC'"
$legacySvc = Get-Service -Name $LEGACY_SVC -ErrorAction SilentlyContinue
if ($legacySvc) {
    Write-Warn "Service lama '$LEGACY_SVC' ditemukan — hapus untuk migrasi ke nama baru."
    if ($legacySvc.Status -eq "Running") {
        & $NSSM_EXE stop $LEGACY_SVC confirm 2>$null | Out-Null
        Start-Sleep -Seconds 3
    }
    & $NSSM_EXE remove $LEGACY_SVC confirm 2>$null | Out-Null
    Write-OK "Service lama '$LEGACY_SVC' dihapus."
} else {
    Write-OK "Tidak ada service lama '$LEGACY_SVC' — tidak perlu migrasi."
}

# ============================================================
# STEP 2: CARI / UNDUH NSSM
# ============================================================
Write-Step "Mencari / mengunduh NSSM"
New-Item -ItemType Directory -Path $LOGS_DIR -Force | Out-Null

if (Test-Path $NSSM_EXE) {
    Write-OK "NSSM ditemukan: $NSSM_EXE"
} else {
    $nssmInPath = Get-Command nssm -ErrorAction SilentlyContinue
    if ($nssmInPath) {
        $NSSM_EXE = $nssmInPath.Source
        Write-OK "NSSM di PATH: $NSSM_EXE"
    } else {
        Write-Warn "NSSM tidak ditemukan. Pilih metode instalasi:"
        Write-Host ""
        Write-Host "  [1] Download otomatis dari nssm.cc" -ForegroundColor White
        Write-Host "  [2] Install via Chocolatey (choco install nssm)" -ForegroundColor White
        Write-Host "  [3] Tunjukkan path nssm.exe yang sudah ada" -ForegroundColor White
        Write-Host "  [Q] Batal" -ForegroundColor White
        Write-Host ""
        $choice = Read-Host "  Pilih [1/2/3/Q]"
        switch ($choice.ToUpper()) {
            "1" {
                $zipPath = Join-Path $env:TEMP "nssm.zip"
                $extractPath = Join-Path $env:TEMP "nssm-extract"
                Write-Info "Mengunduh dari https://nssm.cc/release/nssm-2.24.zip ..."
                Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile $zipPath -UseBasicParsing
                Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
                $nssmBin = Get-ChildItem -Path $extractPath -Filter "nssm.exe" -Recurse |
                           Where-Object { $_.FullName -like "*win64*" } | Select-Object -First 1
                if (-not $nssmBin) { $nssmBin = Get-ChildItem $extractPath -Filter "nssm.exe" -Recurse | Select-Object -First 1 }
                New-Item -ItemType Directory -Path $NSSM_DIR -Force | Out-Null
                Copy-Item $nssmBin.FullName $NSSM_EXE -Force
                Write-OK "NSSM diunduh ke: $NSSM_EXE"
            }
            "2" {
                & choco install nssm -y
                $NSSM_EXE = (Get-Command nssm).Source
                Write-OK "NSSM via Chocolatey: $NSSM_EXE"
            }
            "3" {
                $manual = Read-Host "  Path lengkap nssm.exe"
                if (-not (Test-Path $manual)) { Write-Fail "File tidak ditemukan."; exit 1 }
                $NSSM_EXE = $manual
                Write-OK "NSSM: $NSSM_EXE"
            }
            default { Write-Warn "Dibatalkan."; exit 0 }
        }
    }
}

# ============================================================
# FUNGSI: INSTALL SATU SERVICE
# ============================================================
function Remove-IfExists {
    param($svcName)
    $s = Get-Service -Name $svcName -ErrorAction SilentlyContinue
    if ($s) {
        Write-Warn "Service '$svcName' sudah ada — reinstall bersih."
        if ($s.Status -eq "Running") {
            & $NSSM_EXE stop $svcName confirm | Out-Null; Start-Sleep -Seconds 3
        }
        & $NSSM_EXE remove $svcName confirm | Out-Null
        Write-OK "Service '$svcName' lama dihapus."
    }
}

function Add-FirewallRule {
    param($displayName, $port)
    $existing = Get-NetFirewallRule -DisplayName $displayName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Warn "Firewall rule '$displayName' sudah ada."
    } else {
        New-NetFirewallRule `
            -DisplayName $displayName -Direction Inbound -Protocol TCP `
            -LocalPort $port -Action Allow -Profile Domain,Private `
            -Description "APD Detection port $port" | Out-Null
        Write-OK "Firewall rule ditambahkan: TCP $port inbound."
    }
}

# ============================================================
# INSTALL BACKEND
# ============================================================
if ($Backend) {
    Write-Section "Backend Service ($BACKEND_SVC)"

    # Validasi
    if (-not (Test-Path $VENV_PYTHON)) {
        Write-Fail "venv Python tidak ditemukan: $VENV_PYTHON"
        Write-Info "Jalankan setup.ps1 terlebih dahulu."
        exit 1
    }
    Write-OK "Python venv: $VENV_PYTHON"

    if (-not (Test-Path $PRODUCTION_PY)) {
        Write-Fail "backend\run_production.py tidak ditemukan."
        exit 1
    }

    if (-not (Test-Path $ENV_FILE)) {
        Write-Fail "backend\.env tidak ditemukan."
        Write-Info "Salin backend\.env.example ke backend\.env dan isi DATABASE_URL."
        exit 1
    }
    $dbCheck = Get-Content $ENV_FILE | Where-Object { $_ -match "^DATABASE_URL\s*=\s*\S+" }
    if (-not $dbCheck) { Write-Fail "DATABASE_URL belum diisi di backend\.env"; exit 1 }
    Write-OK "backend\.env berisi DATABASE_URL"

    Remove-IfExists $BACKEND_SVC

    & $NSSM_EXE install  $BACKEND_SVC $VENV_PYTHON $PRODUCTION_PY
    & $NSSM_EXE set      $BACKEND_SVC DisplayName   $BACKEND_DISPLAY
    & $NSSM_EXE set      $BACKEND_SVC Description   $BACKEND_DESC
    & $NSSM_EXE set      $BACKEND_SVC AppDirectory  $BACKEND_DIR
    & $NSSM_EXE set      $BACKEND_SVC Start         SERVICE_AUTO_START
    & $NSSM_EXE set      $BACKEND_SVC AppExit       Default Restart
    & $NSSM_EXE set      $BACKEND_SVC AppRestartDelay $RESTART_DELAY
    & $NSSM_EXE set      $BACKEND_SVC AppStdout     (Join-Path $LOGS_DIR "backend_stdout.log")
    & $NSSM_EXE set      $BACKEND_SVC AppStderr     (Join-Path $LOGS_DIR "backend_stderr.log")
    & $NSSM_EXE set      $BACKEND_SVC AppStdoutCreationDisposition 4
    & $NSSM_EXE set      $BACKEND_SVC AppStderrCreationDisposition 4
    Write-OK "Service '$BACKEND_SVC' dikonfigurasi."

    Add-FirewallRule "APDDetection-Backend-Port$BACKEND_PORT" $BACKEND_PORT

    Write-Info "Memulai service '$BACKEND_SVC'..."
    & $NSSM_EXE start $BACKEND_SVC | Out-Null
    Start-Sleep -Seconds 5
    $s = Get-Service $BACKEND_SVC -ErrorAction SilentlyContinue
    if ($s -and $s.Status -eq "Running") { Write-OK "Backend service Running." }
    else { Write-Warn "Backend service belum Running — cek: $LOGS_DIR\backend_stderr.log" }
}

# ============================================================
# INSTALL FRONTEND
# ============================================================
if ($Frontend) {
    Write-Section "Frontend Service ($FRONTEND_SVC)"

    if (-not $NODE_EXE) {
        Write-Fail "node.exe tidak ditemukan di PATH."
        Write-Info "Download: https://nodejs.org/"
        exit 1
    }
    Write-OK "Node.js: $NODE_EXE"

    if (-not (Test-Path $FRONTEND_PS1)) {
        Write-Fail "frontend\run_production.ps1 tidak ditemukan."
        exit 1
    }

    if (-not (Test-Path (Join-Path $FRONTEND_DIR "node_modules"))) {
        Write-Warn "node_modules belum ada — npm install..."
        Push-Location $FRONTEND_DIR
        & npm install
        Pop-Location
        Write-OK "npm install selesai."
    }

    # Build frontend jika belum ada
    $buildId = Join-Path $FRONTEND_DIR ".next\BUILD_ID"
    if (-not (Test-Path $buildId)) {
        Write-Info "Belum ada .next\BUILD_ID — menjalankan npm run build..."
        Push-Location $FRONTEND_DIR
        & npm run build
        Pop-Location
        Write-OK "Build frontend selesai."
    } else {
        Write-OK "Build .next\ sudah ada — skip build."
    }

    Remove-IfExists $FRONTEND_SVC

    # NSSM menjalankan PowerShell → run_production.ps1
    $pwshExe = (Get-Command pwsh -ErrorAction SilentlyContinue)?.Source
    if (-not $pwshExe) { $pwshExe = (Get-Command powershell).Source }

    & $NSSM_EXE install  $FRONTEND_SVC $pwshExe "-ExecutionPolicy Bypass -File `"$FRONTEND_PS1`""
    & $NSSM_EXE set      $FRONTEND_SVC DisplayName   $FRONTEND_DISPLAY
    & $NSSM_EXE set      $FRONTEND_SVC Description   $FRONTEND_DESC
    & $NSSM_EXE set      $FRONTEND_SVC AppDirectory  $FRONTEND_DIR
    & $NSSM_EXE set      $FRONTEND_SVC Start         SERVICE_AUTO_START
    & $NSSM_EXE set      $FRONTEND_SVC AppExit       Default Restart
    & $NSSM_EXE set      $FRONTEND_SVC AppRestartDelay $RESTART_DELAY
    & $NSSM_EXE set      $FRONTEND_SVC AppStdout     (Join-Path $LOGS_DIR "frontend_stdout.log")
    & $NSSM_EXE set      $FRONTEND_SVC AppStderr     (Join-Path $LOGS_DIR "frontend_stderr.log")
    & $NSSM_EXE set      $FRONTEND_SVC AppStdoutCreationDisposition 4
    & $NSSM_EXE set      $FRONTEND_SVC AppStderrCreationDisposition 4
    Write-OK "Service '$FRONTEND_SVC' dikonfigurasi."

    Add-FirewallRule "APDDetection-Frontend-Port$FRONTEND_PORT" $FRONTEND_PORT

    Write-Info "Memulai service '$FRONTEND_SVC'..."
    & $NSSM_EXE start $FRONTEND_SVC | Out-Null
    Start-Sleep -Seconds 8
    $s = Get-Service $FRONTEND_SVC -ErrorAction SilentlyContinue
    if ($s -and $s.Status -eq "Running") { Write-OK "Frontend service Running." }
    else { Write-Warn "Frontend service belum Running — cek: $LOGS_DIR\frontend_stderr.log" }
}

# ============================================================
# RINGKASAN AKHIR
# ============================================================
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║            INSTALL SELESAI                          ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

if ($Backend) {
    Write-Host "  Backend  : http://localhost:$BACKEND_PORT" -ForegroundColor White
    Write-Host "  Health   : http://localhost:$BACKEND_PORT/health" -ForegroundColor Gray
    Write-Host "  Log      : $LOGS_DIR\backend_stdout.log" -ForegroundColor Gray
}
if ($Frontend) {
    Write-Host "  Frontend : http://localhost:$FRONTEND_PORT" -ForegroundColor White
    Write-Host "  Log      : $LOGS_DIR\frontend_stdout.log" -ForegroundColor Gray
}
Write-Host ""
Write-Host "  Manajemen service:" -ForegroundColor Cyan
if ($Backend)  { Write-Host "    Get-Service $BACKEND_SVC  / Start|Stop|Restart-Service $BACKEND_SVC" -ForegroundColor Gray }
if ($Frontend) { Write-Host "    Get-Service $FRONTEND_SVC / Start|Stop|Restart-Service $FRONTEND_SVC" -ForegroundColor Gray }
Write-Host ""
Write-Host "  Status gabungan: .\status_windows.ps1" -ForegroundColor Yellow
Write-Host "  Uninstall      : .\uninstall_service.ps1 -All" -ForegroundColor Yellow
Write-Host ""
