#!/usr/bin/env bash
# =============================================================================
# frontend/run_production.sh — Jalankan Next.js frontend dalam mode production
#
# Dipakai oleh LaunchAgent macOS (com.tps.apddetection.frontend) dan untuk
# testing manual. Berbeda dari `npm run dev` yang dipakai start.sh:
#   - npm run build  : compile TypeScript + optimasi aset (sekali, bisa di-skip)
#   - npm run start  : Next.js production server (stabil, tidak hot-reload)
#
# Penggunaan:
#   ./frontend/run_production.sh           # build jika .next belum ada, lalu start
#   ./frontend/run_production.sh --rebuild  # paksa rebuild walau .next sudah ada
#
# ENV:
#   NEXT_PUBLIC_BACKEND_URL dibaca dari frontend/.env.local secara otomatis
#   oleh Next.js build dan runtime — tidak perlu export manual di sini.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"   # → .../apd-detection/frontend
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"    # → .../apd-detection
FRONTEND_DIR="${SCRIPT_DIR}"
NEXT_BUILD_DIR="${FRONTEND_DIR}/.next"
LOGS_DIR="${ROOT_DIR}/logs"
FORCE_REBUILD=false

# Parse argumen
for arg in "$@"; do
    case "${arg}" in
        --rebuild) FORCE_REBUILD=true ;;
    esac
done

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'
RED='\033[0;31m'; NC='\033[0m'
info() { echo -e "${CYAN}[frontend]${NC} $1"; }
warn() { echo -e "${YELLOW}[frontend]${NC} $1"; }

cd "${FRONTEND_DIR}"

# Cek node_modules
if [ ! -d "node_modules" ]; then
    info "node_modules tidak ada — menjalankan npm install..."
    npm install
fi

# Build jika diperlukan
if [ "${FORCE_REBUILD}" = true ] || [ ! -d "${NEXT_BUILD_DIR}" ] || [ ! -f "${NEXT_BUILD_DIR}/BUILD_ID" ]; then
    info "Menjalankan npm run build..."
    npm run build
    info "Build selesai."
else
    info "Build sudah ada di .next/ — skip build (gunakan --rebuild untuk paksa ulang)."
fi

# Buat folder logs jika belum ada (dipakai saat jalan via launchd)
mkdir -p "${LOGS_DIR}"

info "Memulai Next.js production server di port 3000..."
info "Ctrl+C untuk berhenti."

# Jalankan production server — ini blocking (launchd yang manage lifecycle-nya)
exec npm run start
