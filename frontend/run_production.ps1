# frontend/run_production.ps1 — Jalankan Next.js frontend dalam mode production (Windows)
#
# Dipakai oleh NSSM Windows Service (APDDetectionFrontend) dan untuk testing manual.
# Berbeda dari `npm run dev` yang dipakai start.sh:
#   - npm run build  : compile TypeScript + optimasi aset (sekali, bisa di-skip)
#   - npm run start  : Next.js production server (stabil, tidak hot-reload)
#
# Penggunaan:
#   .\frontend\run_production.ps1             # build jika .next belum ada, lalu start
#   .\frontend\run_production.ps1 -Rebuild    # paksa rebuild walau .next sudah ada
#
# ENV:
#   NEXT_PUBLIC_BACKEND_URL dibaca dari frontend/.env.local otomatis oleh Next.js.

param(
    [switch]$Rebuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$SCRIPT_DIR    = Split-Path -Parent $MyInvocation.MyCommand.Definition
$FRONTEND_DIR  = $SCRIPT_DIR
$ROOT_DIR      = Split-Path -Parent $FRONTEND_DIR
$NEXT_BUILD    = Join-Path $FRONTEND_DIR ".next"
$BUILD_ID_FILE = Join-Path $NEXT_BUILD "BUILD_ID"
$LOGS_DIR      = Join-Path $ROOT_DIR "logs"

function Write-FE { param($msg) Write-Host "[frontend] $msg" -ForegroundColor Cyan }

Set-Location $FRONTEND_DIR

# Cek node_modules
if (-not (Test-Path (Join-Path $FRONTEND_DIR "node_modules"))) {
    Write-FE "node_modules tidak ada — menjalankan npm install..."
    & npm install
}

# Build jika diperlukan
if ($Rebuild -or -not (Test-Path $BUILD_ID_FILE)) {
    Write-FE "Menjalankan npm run build..."
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[frontend] Build gagal (exit $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
    Write-FE "Build selesai."
} else {
    Write-FE "Build sudah ada di .next\ — skip build (gunakan -Rebuild untuk paksa ulang)."
}

# Buat folder logs
New-Item -ItemType Directory -Path $LOGS_DIR -Force | Out-Null

Write-FE "Memulai Next.js production server di port 3000..."

# Jalankan production server — blocking, NSSM yang manage lifecycle-nya
& npm run start
exit $LASTEXITCODE
