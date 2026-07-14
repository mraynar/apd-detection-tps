#!/usr/bin/env bash
# =============================================================================
# uninstall_service_mac.sh — Uninstall APD Detection LaunchAgent dari macOS
#
# PENGGUNAAN:
#   ./uninstall_service_mac.sh --backend    # uninstall backend saja
#   ./uninstall_service_mac.sh --frontend   # uninstall frontend saja
#   ./uninstall_service_mac.sh --all        # uninstall keduanya (DEFAULT)
#   ./uninstall_service_mac.sh              # sama dengan --all
#
# Log di folder logs/ TIDAK dihapus — simpan untuk debugging.
# =============================================================================

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'

step()    { echo -e "\n${CYAN}[STEP]${NC} $1"; }
ok()      { echo -e "  ${GREEN}[OK]${NC}  $1"; }
warn()    { echo -e "  ${YELLOW}[!]${NC}   $1"; }
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

LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
BACKEND_LABEL="com.tps.apddetection.backend"
FRONTEND_LABEL="com.tps.apddetection.frontend"
LEGACY_LABEL="com.tps.apddetection"
BACKEND_PLIST="${LAUNCH_AGENTS_DIR}/${BACKEND_LABEL}.plist"
FRONTEND_PLIST="${LAUNCH_AGENTS_DIR}/${FRONTEND_LABEL}.plist"
LEGACY_PLIST="${LAUNCH_AGENTS_DIR}/${LEGACY_LABEL}.plist"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   APD Detection — Uninstall macOS LaunchAgent(s)    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -n "  Uninstalling : "
if ${DO_BACKEND} && ${DO_FRONTEND}; then echo "backend + frontend (--all)"
elif ${DO_BACKEND};  then echo "backend saja (--backend)"
elif ${DO_FRONTEND}; then echo "frontend saja (--frontend)"
fi
echo ""

# ============================================================
# FUNGSI: UNLOAD SATU SERVICE
# ============================================================
unload_service() {
    local label="$1"
    local plist="$2"

    section "${label}"

    local is_loaded=false
    if launchctl list 2>/dev/null | grep "${label}" >/dev/null; then
        local pid
        pid=$(launchctl list 2>/dev/null | awk -v l="${label}" '$3==l{print $1}')
        info "Service terdaftar. PID: ${pid:-"-"}"
        is_loaded=true
    else
        warn "Service '${label}' tidak ditemukan di launchctl list."
    fi

    if ${is_loaded}; then
        launchctl unload -w "${plist}" 2>/dev/null || {
            warn "launchctl unload gagal — mencoba stop manual."
            launchctl stop "${label}" 2>/dev/null || true
        }
        ok "Service '${label}' di-unload."
    fi

    if [ -f "${plist}" ]; then
        rm -f "${plist}"
        ok "Plist dihapus: ${plist}"
    else
        warn "Plist tidak ditemukan: ${plist}"
    fi

    # Konfirmasi bersih
    if launchctl list 2>/dev/null | grep "${label}" >/dev/null; then
        warn "'${label}' masih muncul di launchctl — mungkin perlu logout/login."
    else
        ok "'${label}' tidak lagi terdaftar."
    fi
}

# ============================================================
# MIGRASI: Hapus juga service lama jika masih ada
# ============================================================
if launchctl list 2>/dev/null | grep "${LEGACY_LABEL}" >/dev/null && \
   ! launchctl list 2>/dev/null | grep "${LEGACY_LABEL}\." >/dev/null; then
    warn "Ditemukan service lama '${LEGACY_LABEL}' — hapus sekalian."
    launchctl unload -w "${LEGACY_PLIST}" 2>/dev/null || true
    [ -f "${LEGACY_PLIST}" ] && rm -f "${LEGACY_PLIST}"
    ok "Service lama '${LEGACY_LABEL}' dihapus."
fi

# ============================================================
# EKSEKUSI
# ============================================================
${DO_BACKEND}  && unload_service "${BACKEND_LABEL}"  "${BACKEND_PLIST}"
${DO_FRONTEND} && unload_service "${FRONTEND_LABEL}" "${FRONTEND_PLIST}"

# ============================================================
# SELESAI
# ============================================================
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo -e "║  ${GREEN}UNINSTALL SELESAI${NC}                                  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  File log di logs/ tidak dihapus — simpan untuk referensi."
echo ""
echo "  Untuk install ulang:"
echo -e "    ${YELLOW}./install_service_mac.sh --all${NC}"
echo ""
