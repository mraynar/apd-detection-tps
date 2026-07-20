# ==============================================================================
# backend/Dockerfile — APD Detection Backend (Production)
#
# ASUMSI PRODUKSI:
#   Semua kamera di lingkungan produksi adalah RTSP (network stream).
#   TIDAK ada device passthrough webcam hardware (--device /dev/video0).
#   Jika webcam lokal dibutuhkan di masa depan, tambahkan flag --device
#   ke service backend di docker-compose.yml dan rebuild image.
#
# Build context: root repo (lihat docker-compose.yml → context: .)
# Dockerfile path: backend/Dockerfile
# ==============================================================================

FROM python:3.11-slim

# ---- System dependencies ----
# libgl1 + libglib2.0-0: dibutuhkan oleh OpenCV (cv2) di Linux/slim.
# ffmpeg: dipakai oleh _test_rtsp_with_timeout() untuk pre-check RTSP stream.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# ---- Working directory ----
# run_production.py menghitung REPO_ROOT = SCRIPT_DIR.parent → /app
# sehingga /app/models-archive dan /app/logs bekerja dengan benar.
WORKDIR /app/backend

# ---- Python dependencies ----
# Install terlebih dahulu (sebelum COPY source) untuk memanfaatkan Docker layer cache.
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ---- Application source ----
COPY backend/ .

# ---- Exposed port ----
# Backend Waitress mendengarkan di port 5001 (sesuai run_production.py).
EXPOSE 5001

# ---- Entrypoint ----
# Jalankan via run_production.py (Waitress WSGI, bukan Flask dev server).
# DATABASE_URL dan CORS_ORIGINS wajib di-set dari env_file di docker-compose.yml.
CMD ["python", "run_production.py"]
