#!/usr/bin/env bash
# =============================================================================
# status_mac.sh — Cek status gabungan APD Detection services (macOS)
#
# Menampilkan status launchctl, PID, dan HTTP health check untuk
# backend dan frontend sekaligus dalam satu output.
#
# Penggunaan: ./status_mac.sh
# =============================================================================

set -uo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'

BACKEND_LABEL="com.tps.apddetection.backend"
FRONTEND_LABEL="com.tps.apddetection.frontend"
BACKEND_PORT=5001
FRONTEND_PORT=3000

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOGS_DIR="${ROOT_DIR}/logs"


# ============================================================
# HELPER
# ============================================================
check_service() {
    local label="$1"
    local port="$2"
    local url="$3"
    local name="$4"

    echo -e "${BOLD}${name}${NC} (${label})"

    # launchctl status
    if launchctl list 2>/dev/null | grep "${label}" >/dev/null; then
        local pid exit_code
        pid=$(launchctl list 2>/dev/null | awk -v l="${label}" '$3==l{print $1}')
        exit_code=$(launchctl list 2>/dev/null | awk -v l="${label}" '$3==l{print $2}')
        local name_lower
        name_lower=$(echo "$name" | tr '[:upper:]' '[:lower:]')
        if [ "${pid:-"-"}" != "-" ] && [ -n "${pid:-}" ]; then
            echo -e "  launchd  : ${GREEN}RUNNING${NC} (PID: ${pid})"
        else
            echo -e "  launchd  : ${YELLOW}REGISTERED tapi tidak jalan${NC} (last exit: ${exit_code:-"?"})"
            echo -e "             ${YELLOW}Cek: tail -20 ${LOGS_DIR}/${name_lower}_stderr.log${NC}"
        fi
    else
        local name_lower
        name_lower=$(echo "$name" | tr '[:upper:]' '[:lower:]')
        echo -e "  launchd  : ${RED}TIDAK TERDAFTAR${NC}"
        echo -e "             Jalankan: ./install_service_mac.sh --${name_lower}"
    fi

    # HTTP check
    if curl -sf --max-time 3 "${url}" > /dev/null 2>&1; then
        local response
        response=$(curl -sf --max-time 3 "${url}" 2>/dev/null | cut -c 1-200)
        echo -e "  HTTP     : ${GREEN}OK${NC} → ${url}"
        echo -e "             Response: ${response}"
    else
        echo -e "  HTTP     : ${RED}TIDAK MERESPONS${NC} → ${url}"
    fi
    echo ""
}

# ============================================================
# OUTPUT
# ============================================================
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   APD Detection — Status Services (macOS)           ║"
echo "╚══════════════════════════════════════════════════════╝"
echo "  Waktu : $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Host  : $(hostname)"
echo ""

check_service "${BACKEND_LABEL}"  "${BACKEND_PORT}"  "http://localhost:${BACKEND_PORT}/health" "Backend"
check_service "${FRONTEND_LABEL}" "${FRONTEND_PORT}" "http://localhost:${FRONTEND_PORT}"        "Frontend"

# ============================================================
# LOG SUMMARY
# ============================================================
echo -e "${BOLD}Log Files${NC}"
for logfile in backend_stdout backend_stderr frontend_stdout frontend_stderr backend; do
    f="${LOGS_DIR}/${logfile}.log"
    if [ -f "${f}" ]; then
        size=$(du -sh "${f}" 2>/dev/null | cut -f1)
        modified=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "${f}" 2>/dev/null || stat -c "%y" "${f}" 2>/dev/null | cut -c1-16)
        echo -e "  ${f##*/} (${size}, terakhir: ${modified})"
    fi
done
echo ""

# ============================================================
# QUICK COMMANDS
# ============================================================
echo -e "${BOLD}Quick Commands:${NC}"
echo "  Restart backend  : launchctl stop ${BACKEND_LABEL}"
echo "  Restart frontend : launchctl stop ${FRONTEND_LABEL}"
echo "  Live log backend : tail -f ${LOGS_DIR}/backend.log"
echo "  Live log frontend: tail -f ${LOGS_DIR}/frontend_stdout.log"
echo ""
