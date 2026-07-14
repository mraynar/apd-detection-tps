#!/usr/bin/env bash
# =============================================================================
# install_service_mac.sh — Install APD Detection sebagai macOS LaunchAgent
#
# PENGGUNAAN:
#   ./install_service_mac.sh --backend    # install backend saja
#   ./install_service_mac.sh --frontend   # install frontend saja
#   ./install_service_mac.sh --all        # install keduanya (DEFAULT)
#   ./install_service_mac.sh              # sama dengan --all
#
# SERVICE LABELS:
#   Backend  : com.tps.apddetection.backend
#   Frontend : com.tps.apddetection.frontend
#
# MIGRASI: Jika Anda punya service lama "com.tps.apddetection" (tanpa suffix),
#   script ini otomatis mendeteksi dan meng-unload-nya sebelum install ulang.
#
# LaunchAgent (bukan LaunchDaemon) dipilih karena:
#   - Berjalan dalam konteks user session → bisa akses kamera (webcam/CCTV)
#   - LaunchDaemon berjalan sebagai root sebelum login → tidak bisa akses
#     kamera dan AVFoundation (macOS security policy)
#
# Tidak perlu sudo — LaunchAgent berjalan sebagai user biasa.
# =============================================================================

set -euo pipefail

# ============================================================
# WARNA & HELPER
# ============================================================
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'

step()    { echo -e "\n${CYAN}[STEP]${NC} $1"; }
ok()      { echo -e "  ${GREEN}[OK]${NC}  $1"; }
warn()    { echo -e "  ${YELLOW}[!]${NC}   $1"; }
fail()    { echo -e "  ${RED}[X]${NC}   $1"; }
info()    { echo -e "        $1"; }
section() { echo -e "\n${BOLD}${CYAN}══ $1 ══${NC}"; }

# ============================================================
# PARSE ARGUMEN
# ============================================================
DO_BACKEND=false
DO_FRONTEND=false

case "${1:---all}" in
    --backend)  DO_BACKEND=true ;;
    --frontend) DO_FRONTEND=true ;;
    --all|*)    DO_BACKEND=true; DO_FRONTEND=true ;;
esac

# ============================================================
# PATH RESOLUTION (dinamis dari lokasi script)
# ============================================================
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"
VENV_PYTHON="${ROOT_DIR}/venv/bin/python"
PRODUCTION_PY="${BACKEND_DIR}/run_production.py"
FRONTEND_RUNNER="${FRONTEND_DIR}/run_production.sh"
ENV_FILE="${BACKEND_DIR}/.env"
LOGS_DIR="${ROOT_DIR}/logs"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"

# Service identifiers
BACKEND_LABEL="com.tps.apddetection.backend"
FRONTEND_LABEL="com.tps.apddetection.frontend"
LEGACY_LABEL="com.tps.apddetection"   # label lama sebelum refactor

BACKEND_PLIST="${LAUNCH_AGENTS_DIR}/${BACKEND_LABEL}.plist"
FRONTEND_PLIST="${LAUNCH_AGENTS_DIR}/${FRONTEND_LABEL}.plist"

# ============================================================
# HEADER
# ============================================================
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   APD Detection — Install macOS LaunchAgent(s)      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo "  Repo root  : ${ROOT_DIR}"
echo -n "  Installing : "
if ${DO_BACKEND} && ${DO_FRONTEND}; then echo "backend + frontend (--all)"
elif ${DO_BACKEND};  then echo "backend saja (--backend)"
elif ${DO_FRONTEND}; then echo "frontend saja (--frontend)"
fi
echo ""

# ============================================================
# MIGRASI: UNLOAD SERVICE LAMA (com.tps.apddetection tanpa suffix)
# ============================================================
LEGACY_PLIST="${LAUNCH_AGENTS_DIR}/${LEGACY_LABEL}.plist"
if launchctl list 2>/dev/null | grep "${LEGACY_LABEL}" >/dev/null; then
    warn "Ditemukan service lama '${LEGACY_LABEL}' — unload untuk migrasi ke nama baru."
    launchctl unload -w "${LEGACY_PLIST}" 2>/dev/null || true
    [ -f "${LEGACY_PLIST}" ] && rm -f "${LEGACY_PLIST}"
    ok "Service lama '${LEGACY_LABEL}' dihapus — digantikan oleh service baru dengan suffix."
fi

mkdir -p "${LOGS_DIR}" "${LAUNCH_AGENTS_DIR}"

# ============================================================
# FUNGSI: INSTALL BACKEND
# ============================================================
install_backend() {
    section "Backend Service (${BACKEND_LABEL})"

    # Validasi
    if [ ! -f "${VENV_PYTHON}" ]; then
        fail "Python venv tidak ditemukan: ${VENV_PYTHON}"
        info "Buat venv dulu: python3 -m venv venv && venv/bin/pip install -r backend/requirements.txt"
        return 1
    fi
    ok "Python venv: ${VENV_PYTHON}"

    if [ ! -f "${PRODUCTION_PY}" ]; then
        fail "backend/run_production.py tidak ditemukan."
        return 1
    fi
    ok "run_production.py: ${PRODUCTION_PY}"

    if [ ! -f "${ENV_FILE}" ]; then
        fail "backend/.env tidak ditemukan."
        info "  cp backend/.env.example backend/.env && nano backend/.env"
        return 1
    fi
    if ! grep -qE '^DATABASE_URL\s*=\s*.+' "${ENV_FILE}"; then
        fail "DATABASE_URL belum diisi di backend/.env"
        return 1
    fi
    ok "backend/.env berisi DATABASE_URL"

    # Unload jika sudah terpasang (reinstall bersih)
    if launchctl list 2>/dev/null | grep "${BACKEND_LABEL}" >/dev/null; then
        warn "Service '${BACKEND_LABEL}' sudah ada — reinstall."
        launchctl unload -w "${BACKEND_PLIST}" 2>/dev/null || true
    fi

    # Generate plist
    cat > "${BACKEND_PLIST}" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
    "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${BACKEND_LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${VENV_PYTHON}</string>
        <string>${PRODUCTION_PY}</string>
    </array>

    <!-- WorkingDirectory: backend/ agar path relatif model YOLO berjalan -->
    <key>WorkingDirectory</key>
    <string>${BACKEND_DIR}</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <!-- Cegah restart-loop cepat jika error fatal (8 detik) -->
    <key>ThrottleInterval</key>
    <integer>8</integer>

    <key>StandardOutPath</key>
    <string>${LOGS_DIR}/backend_stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${LOGS_DIR}/backend_stderr.log</string>

    <!-- DATABASE_URL TIDAK di-set di sini — dibaca dari backend/.env
         oleh python-dotenv di dalam run_production.py -->
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>
PLIST_EOF

    plutil -lint "${BACKEND_PLIST}" > /dev/null 2>&1 \
        && ok "Plist valid: ${BACKEND_PLIST}" \
        || { fail "Plist gagal validasi."; return 1; }

    launchctl load -w "${BACKEND_PLIST}"
    sleep 3

    PID=$(launchctl list 2>/dev/null | awk -v l="${BACKEND_LABEL}" '$3==l{print $1}')
    if [ "${PID:-"-"}" != "-" ] && [ -n "${PID:-}" ]; then
        ok "Backend service berjalan (PID: ${PID})."
    else
        warn "Backend terdaftar tapi PID '-' — mungkin masih startup."
        info "Cek: launchctl list | grep apddetection"
        info "Log: tail -f ${LOGS_DIR}/backend_stderr.log"
    fi

    # Health check (tunggu model YOLO load)
    info "Menunggu backend startup (~10 detik untuk load model YOLO)..."
    sleep 10
    if curl -sf "http://localhost:5001/health" > /dev/null 2>&1; then
        ok "Backend merespons di http://localhost:5001/health ✓"
    else
        warn "Backend belum merespons — cek log jika berlanjut."
    fi
}

# ============================================================
# FUNGSI: INSTALL FRONTEND
# ============================================================
install_frontend() {
    section "Frontend Service (${FRONTEND_LABEL})"

    # Pastikan run_production.sh ada dan executable
    if [ ! -f "${FRONTEND_RUNNER}" ]; then
        fail "frontend/run_production.sh tidak ditemukan: ${FRONTEND_RUNNER}"
        return 1
    fi
    chmod +x "${FRONTEND_RUNNER}"
    ok "Frontend runner: ${FRONTEND_RUNNER}"

    if [ ! -f "${FRONTEND_DIR}/package.json" ]; then
        fail "frontend/package.json tidak ditemukan."
        return 1
    fi
    ok "package.json: ${FRONTEND_DIR}/package.json"

    # Cek node_modules tersedia
    if [ ! -d "${FRONTEND_DIR}/node_modules" ]; then
        warn "node_modules belum ada — menjalankan npm install..."
        (cd "${FRONTEND_DIR}" && npm install)
        ok "npm install selesai."
    fi

    # Build frontend jika belum ada build output
    if [ ! -f "${FRONTEND_DIR}/.next/BUILD_ID" ]; then
        info "Belum ada build .next/ — menjalankan npm run build terlebih dahulu..."
        (cd "${FRONTEND_DIR}" && npm run build)
        ok "Build frontend selesai."
    else
        info "Build .next/ sudah ada — skip build (gunakan --rebuild jika perlu)."
    fi

    # Unload jika sudah terpasang
    if launchctl list 2>/dev/null | grep "${FRONTEND_LABEL}" >/dev/null; then
        warn "Service '${FRONTEND_LABEL}' sudah ada — reinstall."
        launchctl unload -w "${FRONTEND_PLIST}" 2>/dev/null || true
    fi

    # Cari node binary (perlu path absolut untuk launchd)
    NODE_BIN="$(command -v node 2>/dev/null || echo "")"
    NPM_BIN="$(command -v npm 2>/dev/null || echo "")"
    if [ -z "${NODE_BIN}" ] || [ -z "${NPM_BIN}" ]; then
        fail "node atau npm tidak ditemukan di PATH."
        info "Install Node.js: https://nodejs.org/ atau brew install node"
        return 1
    fi
    ok "Node.js: ${NODE_BIN}"

    # Generate plist
    # Jalankan node langsung dengan script next.js start agar terhindar dari
    # pembatasan sandbox macOS TCC pada shell sistem (/bin/bash).
    cat > "${FRONTEND_PLIST}" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
    "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${FRONTEND_LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${NODE_BIN}</string>
        <string>${FRONTEND_DIR}/node_modules/next/dist/bin/next</string>
        <string>start</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${FRONTEND_DIR}</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>ThrottleInterval</key>
    <integer>8</integer>

    <key>StandardOutPath</key>
    <string>${LOGS_DIR}/frontend_stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${LOGS_DIR}/frontend_stderr.log</string>

    <!-- PATH harus menyertakan lokasi node/npm (Homebrew atau NVM) -->
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$(dirname "${NODE_BIN}"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
</dict>
</plist>
PLIST_EOF

    plutil -lint "${FRONTEND_PLIST}" > /dev/null 2>&1 \
        && ok "Plist valid: ${FRONTEND_PLIST}" \
        || { fail "Plist gagal validasi."; return 1; }

    launchctl load -w "${FRONTEND_PLIST}"
    sleep 5

    PID=$(launchctl list 2>/dev/null | awk -v l="${FRONTEND_LABEL}" '$3==l{print $1}')
    if [ "${PID:-"-"}" != "-" ] && [ -n "${PID:-}" ]; then
        ok "Frontend service berjalan (PID: ${PID})."
    else
        warn "Frontend terdaftar tapi PID '-' — mungkin masih build/startup."
        info "Next.js build bisa makan 1-2 menit pertama kali."
        info "Log: tail -f ${LOGS_DIR}/frontend_stderr.log"
    fi

    # Health check
    info "Menunggu Next.js startup (~15 detik)..."
    sleep 15
    if curl -sf "http://localhost:3000" > /dev/null 2>&1; then
        ok "Frontend merespons di http://localhost:3000 ✓"
    else
        warn "Frontend belum merespons — mungkin masih build. Cek log."
    fi
}

# ============================================================
# EKSEKUSI
# ============================================================
BACKEND_FAILED=false
FRONTEND_FAILED=false

if ${DO_BACKEND}; then
    install_backend || BACKEND_FAILED=true
fi

if ${DO_FRONTEND}; then
    install_frontend || FRONTEND_FAILED=true
fi

# ============================================================
# RINGKASAN AKHIR
# ============================================================
echo ""
echo "╔══════════════════════════════════════════════════════╗"
if ! ${BACKEND_FAILED} && ! ${FRONTEND_FAILED}; then
    echo -e "║  ${GREEN}INSTALL SELESAI${NC}                                    ║"
else
    echo -e "║  ${YELLOW}INSTALL SELESAI (ada peringatan)${NC}                   ║"
fi
echo "╚══════════════════════════════════════════════════════╝"
echo ""

if ${DO_BACKEND}; then
    if ${BACKEND_FAILED}; then
        echo -e "  ${RED}[GAGAL]${NC} Backend — cek output di atas"
    else
        echo -e "  ${GREEN}[OK]${NC}    Backend  : http://localhost:5001"
        echo "          Plist    : ${BACKEND_PLIST}"
        echo "          Log      : ${LOGS_DIR}/backend_stdout.log"
        echo "          Stderr   : ${LOGS_DIR}/backend_stderr.log"
    fi
    echo ""
fi

if ${DO_FRONTEND}; then
    if ${FRONTEND_FAILED}; then
        echo -e "  ${RED}[GAGAL]${NC} Frontend — cek output di atas"
    else
        echo -e "  ${GREEN}[OK]${NC}    Frontend : http://localhost:3000"
        echo "          Plist    : ${FRONTEND_PLIST}"
        echo "          Log      : ${LOGS_DIR}/frontend_stdout.log"
        echo "          Stderr   : ${LOGS_DIR}/frontend_stderr.log"
    fi
    echo ""
fi

echo "  Manajemen service:"
echo -e "    ${YELLOW}./status_mac.sh${NC}                          # cek semua status"
echo -e "    ${YELLOW}launchctl list | grep apddetection${NC}      # cek launchd"
echo -e "    ${YELLOW}launchctl stop com.tps.apddetection.backend${NC}   # stop backend"
echo -e "    ${YELLOW}launchctl stop com.tps.apddetection.frontend${NC}  # stop frontend"
echo ""
echo -e "  Uninstall: ${YELLOW}./uninstall_service_mac.sh --all${NC}"
echo ""
