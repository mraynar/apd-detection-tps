#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Setup awal APD Detection di Windows — buat venv, install dependencies, restore DB.

.DESCRIPTION
    Script ini dijalankan SEKALI saat pertama kali clone repo ke laptop baru.
    Jalankan dari PowerShell (tidak perlu Administrator untuk setup ini).

    Langkah yang dilakukan:
      1. Cek Python 3.11+
      2. Buat virtual environment Python
      3. Install requirements.txt
      4. Cek PostgreSQL service
      5. Restore database dari file .sql
      6. Salin backend/.env.example ke backend/.env dan buka di Notepad

    Setelah script ini selesai, lanjutkan dengan:
      - Isi backend/.env (Notepad akan dibuka otomatis)
      - Jalankan install_service.ps1 sebagai Administrator

.EXAMPLE
    PowerShell -ExecutionPolicy Bypass -File setup.ps1
#>

param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ============================================================
# WARNA & HELPER
# ============================================================
function Write-Step   { param($msg) Write-Host "`n[STEP] $msg" -ForegroundColor Cyan }
function Write-OK     { param($msg) Write-Host "  [OK] $msg"   -ForegroundColor Green }
function Write-Warn   { param($msg) Write-Host "  [!]  $msg"   -ForegroundColor Yellow }
function Write-Fail   { param($msg) Write-Host "  [X]  $msg"   -ForegroundColor Red }
function Write-Info   { param($msg) Write-Host "       $msg"   -ForegroundColor Gray }

$RESULTS = @()
function Add-Result { param($step, $status, $detail="")
    $RESULTS += [PSCustomObject]@{ Step=$step; Status=$status; Detail=$detail }
}

$ROOT = $PSScriptRoot
$BACKEND_DIR  = Join-Path $ROOT "backend"
$VENV_DIR     = Join-Path $ROOT "venv"
$PYTHON_VENV  = Join-Path $VENV_DIR "Scripts\python.exe"
$PIP_VENV     = Join-Path $VENV_DIR "Scripts\pip.exe"
$REQUIREMENTS = Join-Path $BACKEND_DIR "requirements.txt"
$ENV_EXAMPLE  = Join-Path $BACKEND_DIR ".env.example"
$ENV_FILE     = Join-Path $BACKEND_DIR ".env"
$SQL_FILE     = Join-Path $ROOT "apd_detection_pg12_20260708.sql"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║    APD Detection — Setup Environment Windows         ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "  Repo root: $ROOT"
Write-Host ""

# ============================================================
# STEP 1: CEK PYTHON
# ============================================================
Write-Step "1/6 — Cek Python 3.11+"
try {
    $pyVersion = & python --version 2>&1
    if ($pyVersion -match "Python (\d+)\.(\d+)") {
        $major = [int]$Matches[1]; $minor = [int]$Matches[2]
        if ($major -lt 3 -or ($major -eq 3 -and $minor -lt 11)) {
            Write-Fail "Python $major.$minor terdeteksi, butuh minimal 3.11."
            Write-Info "Download: https://www.python.org/downloads/"
            Add-Result "Python 3.11+" "GAGAL" "Versi $major.$minor"
            exit 1
        }
        Write-OK "Python $major.$minor ditemukan."
        Add-Result "Python 3.11+" "OK" "v$major.$minor"
    }
} catch {
    Write-Fail "Python tidak ditemukan di PATH."
    Write-Info "Download: https://www.python.org/downloads/"
    Write-Info "Pastikan centang 'Add Python to PATH' saat install."
    Add-Result "Python 3.11+" "GAGAL" "Tidak ada di PATH"
    exit 1
}

# ============================================================
# STEP 2: BUAT VIRTUAL ENVIRONMENT
# ============================================================
Write-Step "2/6 — Membuat virtual environment Python"
try {
    if (Test-Path $VENV_DIR) {
        Write-Warn "venv sudah ada di: $VENV_DIR — skip pembuatan."
        Add-Result "Virtual Environment" "SKIP" "Sudah ada"
    } else {
        & python -m venv $VENV_DIR
        Write-OK "venv dibuat di: $VENV_DIR"
        Add-Result "Virtual Environment" "OK"
    }
} catch {
    Write-Fail "Gagal membuat venv: $_"
    Add-Result "Virtual Environment" "GAGAL" "$_"
    exit 1
}

# ============================================================
# STEP 3: INSTALL REQUIREMENTS
# ============================================================
Write-Step "3/6 — Install requirements.txt"
Write-Info "(Ini bisa makan waktu beberapa menit — torch/ultralytics besar)"
try {
    & $PIP_VENV install --upgrade pip --quiet
    & $PIP_VENV install -r $REQUIREMENTS
    Write-OK "Semua dependency berhasil diinstall."
    Add-Result "Install Requirements" "OK"
} catch {
    Write-Fail "pip install gagal: $_"
    Add-Result "Install Requirements" "GAGAL" "$_"
    exit 1
}

# ============================================================
# STEP 4: CEK POSTGRESQL SERVICE
# ============================================================
Write-Step "4/6 — Cek PostgreSQL service"
$pgServices = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue

if (-not $pgServices) {
    Write-Fail "PostgreSQL service tidak ditemukan di sistem ini."
    Write-Host ""
    Write-Host "  Download dan install PostgreSQL dari:" -ForegroundColor Yellow
    Write-Host "  https://www.enterprisedb.com/downloads/postgres-postgresql-downloads" -ForegroundColor White
    Write-Host ""
    Write-Host "  Versi yang disarankan: PostgreSQL 16 atau 17 (Windows x86-64)" -ForegroundColor Yellow
    Write-Host "  Setelah install, jalankan ulang setup.ps1 ini." -ForegroundColor Yellow
    Add-Result "PostgreSQL Service" "GAGAL" "Tidak terinstall"
    exit 1
}

$runningPg = $pgServices | Where-Object { $_.Status -eq "Running" }
if (-not $runningPg) {
    Write-Warn "PostgreSQL terinstall tapi tidak berjalan. Mencoba start..."
    try {
        $pgServices[0] | Start-Service
        Start-Sleep -Seconds 3
        Write-OK "PostgreSQL berhasil distart: $($pgServices[0].Name)"
        Add-Result "PostgreSQL Service" "OK" "Distart manual"
    } catch {
        Write-Fail "Gagal start PostgreSQL service: $_"
        Write-Info "Coba jalankan: Start-Service '$($pgServices[0].Name)' sebagai Administrator"
        Add-Result "PostgreSQL Service" "GAGAL" "Tidak bisa distart"
        exit 1
    }
} else {
    Write-OK "PostgreSQL berjalan: $($runningPg[0].Name)"
    Add-Result "PostgreSQL Service" "OK" "$($runningPg[0].Name)"
}

# Cek psql tersedia
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Warn "psql tidak ditemukan di PATH."
    Write-Info "Tambahkan folder bin PostgreSQL ke PATH, contoh:"
    Write-Info "  C:\Program Files\PostgreSQL\16\bin"
    Write-Info "Kemudian restart PowerShell dan jalankan ulang setup.ps1."
    Add-Result "psql di PATH" "GAGAL" "Tidak ada di PATH"
    exit 1
}
Write-OK "psql ditemukan di: $($psqlPath.Source)"

# ============================================================
# STEP 5: RESTORE DATABASE
# ============================================================
Write-Step "5/6 — Restore database PostgreSQL"

if (-not (Test-Path $SQL_FILE)) {
    Write-Warn "File SQL tidak ditemukan: $SQL_FILE"
    Write-Info "Skip restore database. Buat database secara manual jika diperlukan."
    Add-Result "Restore Database" "SKIP" "File SQL tidak ada"
} else {
    Write-Info "File SQL: $SQL_FILE"
    Write-Host ""

    # Input nama database (default: apd_detection)
    $defaultDb = "apd_detection"
    $dbInput = Read-Host "  Nama database (tekan Enter untuk default '$defaultDb')"
    $DB_NAME = if ([string]::IsNullOrWhiteSpace($dbInput)) { $defaultDb } else { $dbInput.Trim() }

    $pgUser = Read-Host "  Username PostgreSQL (tekan Enter untuk 'postgres')"
    $PG_USER = if ([string]::IsNullOrWhiteSpace($pgUser)) { "postgres" } else { $pgUser.Trim() }

    Write-Info "Database target: $DB_NAME (user: $PG_USER)"

    # Buat database jika belum ada
    Write-Info "Memastikan database '$DB_NAME' ada..."
    try {
        & psql -U $PG_USER -c "CREATE DATABASE `"$DB_NAME`";" 2>&1 | Out-Null
        Write-OK "Database '$DB_NAME' dibuat (atau sudah ada)."
    } catch {
        Write-Warn "CREATE DATABASE mungkin gagal kalau DB sudah ada — lanjut restore."
    }

    # Restore
    Write-Info "Menjalankan restore dari $SQL_FILE ..."
    try {
        & psql -U $PG_USER -d $DB_NAME -f $SQL_FILE
        if ($LASTEXITCODE -eq 0) {
            Write-OK "Database berhasil di-restore ke '$DB_NAME'."
            Add-Result "Restore Database" "OK" "DB: $DB_NAME"
        } else {
            Write-Warn "psql keluar dengan kode $LASTEXITCODE — ada error tapi mungkin sebagian sukses."
            Write-Info "Cek output di atas untuk detail error."
            Add-Result "Restore Database" "PERINGATAN" "Exit code $LASTEXITCODE"
        }
    } catch {
        Write-Fail "Restore gagal: $_"
        Add-Result "Restore Database" "GAGAL" "$_"
    }
}

# ============================================================
# STEP 6: KONFIGURASI .env
# ============================================================
Write-Step "6/6 — Konfigurasi backend/.env"

if (Test-Path $ENV_FILE) {
    Write-Warn "backend/.env sudah ada — tidak ditimpa."
    Write-Info "Edit manual jika perlu mengubah kredensial: $ENV_FILE"
    Add-Result "Setup .env" "SKIP" "Sudah ada"
} else {
    if (-not (Test-Path $ENV_EXAMPLE)) {
        Write-Fail "backend/.env.example tidak ditemukan! Repo mungkin rusak."
        Add-Result "Setup .env" "GAGAL" ".env.example tidak ada"
        exit 1
    }
    Copy-Item -Path $ENV_EXAMPLE -Destination $ENV_FILE
    Write-OK "backend/.env disalin dari .env.example."
    Write-Warn "Buka Notepad untuk mengisi DATABASE_URL..."
    Start-Process notepad.exe -ArgumentList $ENV_FILE
    Add-Result "Setup .env" "OK" "Buka Notepad untuk isi kredensial"
}

# ============================================================
# RINGKASAN HASIL
# ============================================================
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    RINGKASAN SETUP                  ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
foreach ($r in $RESULTS) {
    $color = switch ($r.Status) {
        "OK"         { "Green"  }
        "SKIP"       { "Yellow" }
        "PERINGATAN" { "Yellow" }
        default      { "Red"    }
    }
    $detail = if ($r.Detail) { " ($($r.Detail))" } else { "" }
    Write-Host ("  [{0,-12}] {1}{2}" -f $r.Status, $r.Step, $detail) -ForegroundColor $color
}
Write-Host ""

$hasFailure = $RESULTS | Where-Object { $_.Status -eq "GAGAL" }
if ($hasFailure) {
    Write-Host "Setup belum selesai. Perbaiki item GAGAL di atas, lalu jalankan ulang." -ForegroundColor Red
} else {
    Write-Host "Setup selesai!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Langkah selanjutnya:" -ForegroundColor Cyan
    Write-Host "  1. Pastikan backend\.env sudah diisi (DATABASE_URL)" -ForegroundColor White
    Write-Host "  2. Jalankan install_service.ps1 sebagai Administrator:" -ForegroundColor White
    Write-Host "     PowerShell -ExecutionPolicy Bypass -File install_service.ps1" -ForegroundColor Gray
    Write-Host ""
}
