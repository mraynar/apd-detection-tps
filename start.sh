#!/usr/bin/env bash
# ============================================================
# start.sh — Jalankan backend (Flask) + frontend (Next.js)
#            dari satu perintah terminal
#
# Penggunaan: ./start.sh
# Hentikan : Ctrl+C  (kedua proses akan ikut berhenti)
# ============================================================

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_ACTIVATE="$ROOT_DIR/venv/bin/activate"

# Warna output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BACKEND_PID=""
FRONTEND_PID=""

# ---- Cleanup: matikan kedua proses saat Ctrl+C / SIGTERM ----
cleanup() {
  echo ""
  echo -e "${YELLOW}⏹  Menghentikan semua proses...${NC}"

  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null
    echo -e "   Backend  (PID ${BACKEND_PID}) → dihentikan"
  fi

  if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null
    echo -e "   Frontend (PID ${FRONTEND_PID}) → dihentikan"
  fi

  # Tunggu proses benar-benar selesai
  wait 2>/dev/null
  echo -e "${GREEN}✅ Semua proses dihentikan.${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM

# ---- Validasi direktori & venv ----
if [ ! -f "$VENV_ACTIVATE" ]; then
  echo -e "${RED}❌ Virtual environment tidak ditemukan di: $VENV_ACTIVATE${NC}"
  echo "   Pastikan Anda sudah membuat venv dengan: python -m venv venv"
  exit 1
fi

if [ ! -f "$BACKEND_DIR/app.py" ]; then
  echo -e "${RED}❌ backend/app.py tidak ditemukan.${NC}"
  exit 1
fi

if [ ! -f "$FRONTEND_DIR/package.json" ]; then
  echo -e "${RED}❌ frontend/package.json tidak ditemukan.${NC}"
  exit 1
fi

# ---- Jalankan Backend ----
echo ""
echo -e "${CYAN}🐍 Memulai backend Flask...${NC}"
source "$VENV_ACTIVATE"
cd "$BACKEND_DIR"
python app.py > /tmp/apd-backend.log 2>&1 &
BACKEND_PID=$!
echo -e "   Backend dimulai (PID ${BACKEND_PID})"
echo -e "   Log tersedia di: /tmp/apd-backend.log"

# Tunggu model YOLO selesai load sebelum jalankan frontend
echo -e "${YELLOW}   ⏳ Menunggu model YOLO load (8 detik)...${NC}"
sleep 8

# Cek apakah backend masih berjalan
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo -e "${RED}❌ Backend gagal dimulai! Periksa log: /tmp/apd-backend.log${NC}"
  exit 1
fi

# ---- Jalankan Frontend ----
echo ""
echo -e "${CYAN}⚡ Memulai frontend Next.js...${NC}"
cd "$FRONTEND_DIR"
npm run dev > /tmp/apd-frontend.log 2>&1 &
FRONTEND_PID=$!
echo -e "   Frontend dimulai (PID ${FRONTEND_PID})"
echo -e "   Log tersedia di: /tmp/apd-frontend.log"

# Tunggu sebentar agar Next.js selesai compile
sleep 4

# ---- Tampilkan info ----
echo ""
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Sistem APD Detection berjalan${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "   🐍 Backend  → ${CYAN}http://localhost:5001${NC}  (PID ${BACKEND_PID})"
echo -e "   ⚡ Frontend → ${CYAN}http://localhost:3000${NC}  (PID ${FRONTEND_PID})"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "   📋 Log backend : /tmp/apd-backend.log"
echo -e "   📋 Log frontend: /tmp/apd-frontend.log"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${YELLOW}   Tekan Ctrl+C untuk menghentikan semua proses${NC}"
echo ""

# Tunggu hingga salah satu proses selesai / Ctrl+C
wait
