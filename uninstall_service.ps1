#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Uninstall APD Detection Windows Service(s).

.DESCRIPTION
    Menghentikan dan menghapus service backend dan/atau frontend.
    Log di folder logs/ TIDAK dihapus otomatis.
    Jalankan sebagai Administrator.

.PARAMETER Backend
    Uninstall backend saja (APDDetectionBackend).

.PARAMETER Frontend
    Uninstall frontend saja (APDDetectionFrontend).

.PARAMETER All
    Uninstall keduanya (DEFAULT jika tidak ada argumen).

.EXAMPLE
    PowerShell -ExecutionPolicy Bypass -File uninstall_service.ps1 -Backend
    PowerShell -ExecutionPolicy Bypass -File uninstall_service.ps1 -Frontend
    PowerShell -ExecutionPolicy Bypass -File uninstall_service.ps1 -All
#>

param(
    [switch]$Backend,
    [switch]$Frontend,
    [switch]$All
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $Backend -and -not $Frontend -and -not $All) { $All = $true }
if ($All) { $Backend = $true; $Frontend = $true }

$ROOT         = $PSScriptRoot
$NSSM_DIR     = Join-Path $ROOT "tools\nssm"
$NSSM_EXE     = Join-Path $NSSM_DIR "nssm.exe"

$BACKEND_SVC  = "APDDetectionBackend"
$FRONTEND_SVC = "APDDetectionFrontend"
$LEGACY_SVC   = "APDDetection"

function Write-Step { param($m) Write-Host "`n[STEP] $m" -ForegroundColor Cyan }
function Write-OK   { param($m) Write-Host "  [OK] $m"   -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "  [!]  $m"   -ForegroundColor Yellow }
function Write-Fail { param($m) Write-Host "  [X]  $m"   -ForegroundColor Red }
function Write-Info { param($m) Write-Host "       $m"   -ForegroundColor Gray }

# Cari NSSM
if (-not (Test-Path $NSSM_EXE)) {
    $n = Get-Command nssm -ErrorAction SilentlyContinue
    if ($n) { $NSSM_EXE = $n.Source } else {
        Write-Warn "NSSM tidak ditemukan. Hapus manual:"
        Write-Info "  sc.exe stop `"$BACKEND_SVC`"  ; sc.exe delete `"$BACKEND_SVC`""
        Write-Info "  sc.exe stop `"$FRONTEND_SVC`" ; sc.exe delete `"$FRONTEND_SVC`""
        exit 1
    }
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║   APD Detection — Uninstall Windows Service(s)      ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host ""

# ============================================================
# FUNGSI: HAPUS SATU SERVICE
# ============================================================
function Remove-Service {
    param($svcName, $fwRuleName)

    Write-Host "`n── $svcName ──" -ForegroundColor Cyan
    $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
    if (-not $svc) {
        Write-Warn "'$svcName' tidak ditemukan — sudah dihapus atau belum pernah diinstall."
        return
    }
    Write-Info "Status: $($svc.Status)"

    if ($svc.Status -eq "Running") {
        Write-Info "Menghentikan '$svcName'..."
        & $NSSM_EXE stop $svcName confirm 2>$null | Out-Null
        Start-Sleep -Seconds 4
    }

    & $NSSM_EXE remove $svcName confirm 2>$null | Out-Null
    Write-OK "'$svcName' berhasil dihapus."

    # Hapus firewall rule (opsional)
    if ($fwRuleName) {
        $removeFw = Read-Host "  Hapus firewall rule '$fwRuleName'? [y/N]"
        if ($removeFw.ToLower() -eq "y") {
            Remove-NetFirewallRule -DisplayName $fwRuleName -ErrorAction SilentlyContinue
            Write-OK "Firewall rule '$fwRuleName' dihapus."
        } else {
            Write-Info "Firewall rule dibiarkan."
        }
    }
}

# ============================================================
# MIGRASI: Hapus service lama jika ada
# ============================================================
$legacySvc = Get-Service -Name $LEGACY_SVC -ErrorAction SilentlyContinue
if ($legacySvc) {
    Write-Warn "Service lama '$LEGACY_SVC' ditemukan — hapus sekalian."
    if ($legacySvc.Status -eq "Running") {
        & $NSSM_EXE stop $LEGACY_SVC confirm 2>$null | Out-Null
        Start-Sleep -Seconds 3
    }
    & $NSSM_EXE remove $LEGACY_SVC confirm 2>$null | Out-Null
    Remove-NetFirewallRule -DisplayName "APDDetection-Backend-Port5001" -ErrorAction SilentlyContinue
    Write-OK "Service lama '$LEGACY_SVC' dihapus."
}

# ============================================================
# EKSEKUSI
# ============================================================
if ($Backend)  { Remove-Service $BACKEND_SVC  "APDDetection-Backend-Port5001" }
if ($Frontend) { Remove-Service $FRONTEND_SVC "APDDetection-Frontend-Port3000" }

# ============================================================
# SELESAI
# ============================================================
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║              UNINSTALL SELESAI                      ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  File log di 'logs\' tidak dihapus." -ForegroundColor Gray
Write-Host ""
Write-Host "  Untuk install ulang:" -ForegroundColor Cyan
Write-Host "    PowerShell -ExecutionPolicy Bypass -File install_service.ps1 -All" -ForegroundColor Gray
Write-Host ""
