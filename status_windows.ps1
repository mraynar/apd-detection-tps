<#
.SYNOPSIS
    Cek status gabungan APD Detection services (Windows).

.DESCRIPTION
    Menampilkan status Get-Service dan HTTP health check untuk
    backend dan frontend sekaligus dalam satu output.

.EXAMPLE
    .\status_windows.ps1
#>

param()

$BACKEND_SVC   = "APDDetectionBackend"
$FRONTEND_SVC  = "APDDetectionFrontend"
$BACKEND_PORT  = 5001
$FRONTEND_PORT = 3000
$ROOT          = $PSScriptRoot
$LOGS_DIR      = Join-Path $ROOT "logs"

function Write-ServiceStatus {
    param($svcName, $displayName, $port, $url)

    Write-Host ""
    Write-Host "── $displayName ($svcName) ──" -ForegroundColor Cyan

    $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
    if (-not $svc) {
        Write-Host "  Windows Service : " -NoNewline
        Write-Host "TIDAK TERDAFTAR" -ForegroundColor Red
        Write-Host "  Install dengan  : .\install_service.ps1 -$(if($port -eq 5001){'Backend'}else{'Frontend'})" -ForegroundColor Yellow
    } elseif ($svc.Status -eq "Running") {
        Write-Host "  Windows Service : " -NoNewline
        Write-Host "RUNNING" -ForegroundColor Green
        # Cari PID via Get-Process (match display name)
        try {
            $proc = Get-WmiObject Win32_Service | Where-Object { $_.Name -eq $svcName }
            if ($proc -and $proc.ProcessId -gt 0) {
                Write-Host "  PID             : $($proc.ProcessId)" -ForegroundColor Gray
            }
        } catch {}
    } else {
        Write-Host "  Windows Service : " -NoNewline
        Write-Host "$($svc.Status)" -ForegroundColor Yellow
        Write-Host "  Log             : $LOGS_DIR\$(if($port -eq 5001){'backend'}else{'frontend'})_stderr.log" -ForegroundColor Yellow
    }

    # HTTP check
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        Write-Host "  HTTP ($url) : " -NoNewline
        Write-Host "OK ($($resp.StatusCode))" -ForegroundColor Green
        if ($port -eq 5001) {
            # Tampilkan body JSON untuk /health
            Write-Host "  Response        : $($resp.Content.Substring(0, [Math]::Min(150, $resp.Content.Length)))" -ForegroundColor Gray
        }
    } catch {
        Write-Host "  HTTP ($url) : " -NoNewline
        Write-Host "TIDAK MERESPONS" -ForegroundColor Red
    }
}

# ============================================================
# OUTPUT
# ============================================================
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   APD Detection — Status Services (Windows)         ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "  Waktu : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "  Host  : $env:COMPUTERNAME"

Write-ServiceStatus $BACKEND_SVC  "Backend"  $BACKEND_PORT "http://localhost:$BACKEND_PORT/health"
Write-ServiceStatus $FRONTEND_SVC "Frontend" $FRONTEND_PORT "http://localhost:$FRONTEND_PORT"

# ============================================================
# LOG SUMMARY
# ============================================================
Write-Host ""
Write-Host "── Log Files ──" -ForegroundColor Cyan
$logFiles = @("backend_stdout","backend_stderr","backend","frontend_stdout","frontend_stderr")
foreach ($lf in $logFiles) {
    $path = Join-Path $LOGS_DIR "$lf.log"
    if (Test-Path $path) {
        $fi = Get-Item $path
        $size = "{0:N1} KB" -f ($fi.Length / 1KB)
        Write-Host "  $($fi.Name) ($size, terakhir: $($fi.LastWriteTime.ToString('yyyy-MM-dd HH:mm')))" -ForegroundColor Gray
    }
}

# ============================================================
# QUICK COMMANDS
# ============================================================
Write-Host ""
Write-Host "── Quick Commands ──" -ForegroundColor Cyan
Write-Host "  Restart backend  : Restart-Service $BACKEND_SVC" -ForegroundColor Gray
Write-Host "  Restart frontend : Restart-Service $FRONTEND_SVC" -ForegroundColor Gray
Write-Host "  Live log backend : Get-Content $LOGS_DIR\backend.log -Wait -Tail 20" -ForegroundColor Gray
Write-Host "  Live log frontend: Get-Content $LOGS_DIR\frontend_stdout.log -Wait -Tail 20" -ForegroundColor Gray
Write-Host ""
