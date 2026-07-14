"""
run_production.py — Production entry point untuk APD Detection Backend.

Jalankan file ini (bukan app.py) saat deploy sebagai background service
di Windows (NSSM) maupun macOS (launchd). Menggunakan Waitress sebagai
WSGI server — cross-platform, tidak seperti Gunicorn yang tidak berjalan di Windows.

PERBEDAAN DARI app.py:
  - Tidak ada debug=True / use_reloader
  - Logging diarahkan ke file dengan rotasi (logs/backend.log)
  - load_dotenv() dipanggil dari path absolut (penting untuk service manager,
    karena CWD service bisa berbeda dari lokasi repo di semua OS)
  - db_writer_thread dan init_aggregates_from_db() diinisialisasi di sini
    (tidak bergantung pada if __name__ == '__main__' di app.py)

Thread count (threads=4):
  Satu proses Waitress dengan 4 thread cukup untuk:
    - Beberapa request REST JSON bersamaan
    - Satu atau dua stream MJPEG /video_feed bersamaan
  Kamera (cv2.VideoCapture) diakses dari satu camera_thread daemon di app.py,
  bukan dari thread Waitress — tidak ada konflik akses kamera.

Cara menjalankan manual (untuk testing):
  macOS/Linux : venv/bin/python backend/run_production.py
  Windows     : venv\\Scripts\\python.exe backend\\run_production.py

Cara install sebagai background service:
  macOS   : Lihat install_service_mac.sh di root repo.
  Windows : Lihat install_service.ps1 di root repo.
"""

import os
import sys
import logging
import threading
from logging.handlers import RotatingFileHandler
from pathlib import Path

# ============================================================
# 1. RESOLVE PATH — penting agar berjalan sebagai background service
#    di semua OS (CWD service mungkin berbeda dari lokasi repo)
# ============================================================
SCRIPT_DIR = Path(__file__).resolve().parent      # → .../apd-detection/backend
REPO_ROOT   = SCRIPT_DIR.parent                   # → .../apd-detection
ENV_FILE    = SCRIPT_DIR / ".env"
LOGS_DIR    = REPO_ROOT / "logs"

# ============================================================
# 2. LOAD .env SEBELUM IMPORT app (penting untuk DATABASE_URL)
# ============================================================
from dotenv import load_dotenv
load_dotenv(dotenv_path=ENV_FILE)

# Validasi DATABASE_URL — lebih awal = pesan error lebih jelas
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    sys.exit(
        "\n[FATAL] DATABASE_URL belum di-set.\n"
        f"Pastikan file {ENV_FILE} ada dan berisi DATABASE_URL yang valid.\n"
        "Salin dari backend/.env.example dan isi kredensial PostgreSQL Anda.\n"
    )

# ============================================================
# 3. SETUP LOGGING (sebelum import app agar semua log tertangkap)
# ============================================================
LOGS_DIR.mkdir(exist_ok=True)
LOG_FILE = LOGS_DIR / "backend.log"

# Root logger — semua log dari app.py dan library akan masuk ke sini
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)

# Rotating file handler: max 10 MB per file, simpan 5 file terakhir
file_handler = RotatingFileHandler(
    LOG_FILE,
    maxBytes=10 * 1024 * 1024,  # 10 MB
    backupCount=5,
    encoding="utf-8",
)
file_handler.setFormatter(logging.Formatter(
    "[%(asctime)s] %(levelname)s %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
))
root_logger.addHandler(file_handler)

# Console handler — tetap tampil di stdout (berguna untuk NSSM log dan debugging)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(logging.Formatter(
    "[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
))
root_logger.addHandler(console_handler)

logger = logging.getLogger("run_production")
logger.info("=" * 60)
logger.info("APD Detection Backend — Production Startup")
logger.info(f"Repo root  : {REPO_ROOT}")
logger.info(f"Env file   : {ENV_FILE}")
logger.info(f"Log file   : {LOG_FILE}")
logger.info("=" * 60)

# ============================================================
# 4. IMPORT APP (setelah .env di-load dan DATABASE_URL terisi)
# ============================================================
# Tambahkan backend/ ke sys.path agar import relatif di app.py berjalan
sys.path.insert(0, str(SCRIPT_DIR))
os.chdir(SCRIPT_DIR)  # set CWD ke backend/ untuk path relatif model YOLO

from app import app, db_writer_worker, init_aggregates_from_db  # noqa: E402

# ============================================================
# 5. START BACKGROUND THREADS
#    (Normalnya ada di if __name__ == '__main__' di app.py —
#     harus dipanggil eksplisit di sini karena kita tidak
#     menjalankan app.py langsung)
# ============================================================
logger.info("Memulai db_writer_thread...")
db_writer_thread = threading.Thread(target=db_writer_worker, daemon=True, name="db-writer")
db_writer_thread.start()

logger.info("Menginisialisasi agregat historis dari database...")
init_aggregates_from_db()

# ============================================================
# 6. SERVE VIA WAITRESS (production WSGI, cross-platform)
# ============================================================
from waitress import serve  # noqa: E402

HOST = "0.0.0.0"
PORT = 5001
THREADS = 4  # 1 proses, 4 thread — aman untuk shared cv2.VideoCapture

logger.info(f"Waitress mendengarkan di http://{HOST}:{PORT} (threads={THREADS})")
logger.info("Backend siap. Tekan Ctrl+C untuk berhenti (atau stop via Service Manager).")

try:
    serve(app, host=HOST, port=PORT, threads=THREADS)
except KeyboardInterrupt:
    logger.info("Shutdown diminta via Ctrl+C.")
except Exception as exc:
    logger.exception(f"Waitress mengalami error fatal: {exc}")
    sys.exit(1)
