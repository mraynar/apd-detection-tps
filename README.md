## Model yang Berjalan

- **Helmet** — deteksi helm terpasang / tidak (head, helmet, person)
- **Vest** — deteksi rompi keselamatan terpasang / tidak

Model chinstrap (tali pengunci helm) sedang dalam proses training, belum aktif di `backend/app.py`.

## Cara Menjalankan

### 1. Setup awal (sekali saja)

```bash
git clone https://github.com/mraynar/apd-detection-tps.git
cd apd-detection-tps

python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

cd frontend
npm install
cd ..
```

Backend butuh koneksi PostgreSQL untuk auth dan riwayat pelanggaran. Isi kredensial database di `backend/.env` — lihat variabel yang dipakai di `backend/database.py`.

### 2. Jalankan (setiap kali mau develop)

Cukup satu perintah dari root project, backend dan frontend jalan bareng dalam satu terminal:

```bash
./start.sh
```

Ctrl+C untuk menghentikan keduanya sekaligus. Kalau `start.sh` belum bisa dieksekusi, jalankan dulu `chmod +x start.sh`.

- Backend: `http://localhost:5001`
- Frontend: `http://localhost:3000`
- Log backend: `/tmp/apd-backend.log`
- Log frontend: `/tmp/apd-frontend.log`

Login pertama kali pakai akun yang dibuat lewat `backend/db_init.py` (jalankan sekali setelah setup database).

## Konfigurasi Kamera / RTSP

Pengaturan sumber kamera (webcam lokal atau RTSP CCTV) diatur lewat halaman **Camera Settings** di dashboard, bukan edit kode manual. Backend otomatis test koneksi sebelum menerapkan sumber kamera baru.

## Known Issues / Catatan Teknis

- **Port 5000 bentrok dengan AirPlay Receiver di macOS** — makanya backend pakai port 5001.
- **Continuity Camera (Mac + iPhone berdekatan)** bisa otomatis switch jadi kamera iPhone saat testing webcam. Kalau kamera yang muncul bukan webcam laptop, matikan Continuity Camera di System Settings Mac dan iPhone.
- Dataset training **tidak di-push ke GitHub** (ukuran besar). Lihat `.gitignore` — folder `dataset/`, `VEST-SAFETY/`, `datasets-new/`, `runs_backup_*` sengaja dikecualikan.
- Akurasi deteksi menurun pada kondisi CCTV jarak jauh + minim cahaya. Sedang dalam perbaikan lewat data augmentation dan penambahan dataset (lihat progress training di `training_log.txt`).

## Requirements

- Python 3.11+ (dites di 3.14)
- Node.js untuk frontend (Next.js)
- PostgreSQL untuk auth & riwayat pelanggaran
