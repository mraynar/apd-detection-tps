# APD Detection System — TPS Petikemas Surabaya

Sistem deteksi Alat Pelindung Diri (helm & rompi keselamatan) berbasis YOLOv8-OBB,
dengan backend Flask (Python) dan frontend Next.js.

---

## 🚀 Mulai Cepat (Baru Pertama Kali Clone Repo Ini?)

Panduan ini untuk siapapun yang baru `git clone` repo ini dan belum pernah
menjalankan project ini sama sekali — baik di **Windows** maupun **macOS**.
Ikuti sesuai OS Anda dari atas ke bawah.

### Ringkasan Arsitektur

| Komponen | Teknologi | Port | Fungsi |
|---|---|---|---|
| Backend | Flask + YOLOv8-OBB + OpenCV | `5001` | API, deteksi APD, kamera, database |
| Frontend | Next.js | `3000` | Dashboard web (yang Anda buka di browser) |
| Database | PostgreSQL | `5432` | Auth, riwayat pelanggaran, analytics |

Dua mode menjalankan sistem ini:
- **Mode testing/development** (`start.sh`) — jalan manual di terminal, berhenti saat terminal ditutup. Cocok untuk coba-coba/debug.
- **Mode background service** (`install_service_mac.sh` / `install_service.ps1`) — jalan permanen, auto-start saat boot, auto-restart kalau crash. Cocok untuk pemakaian harian/produksi.

---

## 🪟 Setup di Windows

### Prasyarat — Install Dulu Sebelum Mulai

| Software | Versi Minimum | Download |
|----------|--------------|---------|
| Git | Terbaru | https://git-scm.com/download/win |
| Python | 3.11+ | https://www.python.org/downloads/ — centang **"Add Python to PATH"** |
| PostgreSQL | 14+ | https://www.enterprisedb.com/downloads/postgres-postgresql-downloads |
| Node.js | 18+ LTS | https://nodejs.org/ |

> **NSSM** (untuk background service) diunduh otomatis oleh `install_service.ps1`. Tidak perlu install manual.

### Langkah 1 — Clone Repository

```powershell
git clone https://github.com/mraynar/apd-detection-tps.git
cd apd-detection-tps
```

### Langkah 2 — Jalankan Setup Otomatis

Buka **PowerShell** (bukan Command Prompt):

```powershell
PowerShell -ExecutionPolicy Bypass -File setup.ps1
```

Script ini otomatis:
1. Cek versi Python
2. Buat virtual environment (`venv/`)
3. Install semua Python dependency dari `requirements.txt`
4. Cek dan (kalau perlu) start PostgreSQL service
5. Restore database dari `apd_detection_pg12_20260708.sql`
6. Salin `backend/.env.example` → `backend/.env`, buka Notepad otomatis

Kalau PostgreSQL belum ditemukan, script berhenti dan kasih link download — install dulu, lalu jalankan ulang `setup.ps1`.

### Langkah 3 — Isi Konfigurasi `.env`

Notepad akan terbuka otomatis berisi `backend/.env`. Isi:

```env
DATABASE_URL=postgresql://postgres:PASSWORD_ANDA@localhost:5432/apd_detection
```

Ganti `PASSWORD_ANDA` sesuai password PostgreSQL Anda. Simpan dan tutup.

Untuk frontend:
```powershell
copy frontend\.env.local.example frontend\.env.local
```
Isi `NEXT_PUBLIC_BACKEND_URL=http://localhost:5001` (default sudah benar untuk lokal).

### Langkah 4 — Pilih Mode Menjalankan

**Opsi A — Testing cepat dulu (disarankan sebelum install service permanen):**
```powershell
# Belum ada start.bat resmi untuk Windows — jalankan manual:
venv\Scripts\activate
cd backend
python app.py
```
Di terminal terpisah:
```powershell
cd frontend
npm run dev
```
Buka `http://localhost:3000`.

**Opsi B — Install sebagai background service permanen:**

Buka **PowerShell sebagai Administrator** (klik kanan → "Run as Administrator"):

| Yang mau dijalankan | Command |
|---|---|
| Backend + Frontend (keduanya) | `PowerShell -ExecutionPolicy Bypass -File install_service.ps1 -All` |
| Backend saja | `PowerShell -ExecutionPolicy Bypass -File install_service.ps1 -Backend` |
| Frontend saja | `PowerShell -ExecutionPolicy Bypass -File install_service.ps1 -Frontend` |

Tanpa argumen = sama dengan `-All`.

Script ini akan:
1. Migrasi otomatis kalau ada service lama `APDDetection`
2. Unduh NSSM kalau belum ada
3. Daftarkan `APDDetectionBackend` dan/atau `APDDetectionFrontend` sebagai Windows Service
4. Konfigurasi auto-start saat boot + auto-restart saat crash (delay 8 detik)
5. Buka port **5001** dan/atau **3000** di Windows Firewall
6. Frontend: build `.next/` otomatis kalau belum ada, lalu `next start`

> Perlu Administrator karena mendaftarkan Windows Service dan menambah Firewall rule butuh hak itu.

### Langkah 5 — Verifikasi Service Berjalan

```powershell
.\status_windows.ps1

# atau individual
Get-Service APDDetectionBackend
Get-Service APDDetectionFrontend

Invoke-RestMethod http://localhost:5001/health   # {"status":"ok"}
Invoke-RestMethod http://localhost:3000          # HTML frontend
```

### Manajemen Service Windows (Sehari-hari)

```powershell
.\status_windows.ps1

# Individual — tidak ganggu service lain
Start-Service APDDetectionBackend
Stop-Service  APDDetectionBackend
Restart-Service APDDetectionBackend

Start-Service APDDetectionFrontend
Stop-Service  APDDetectionFrontend
Restart-Service APDDetectionFrontend
```

Service auto-start saat boot dan auto-restart saat crash — tidak perlu jalankan manual tiap hari.

### Lokasi Log Windows

| File | Isi |
|---|---|
| `logs\backend.log` | Log utama Python backend (rotasi 10 MB × 5 file) |
| `logs\backend_stdout.log` / `backend_stderr.log` | Output NSSM backend (cek stderr saat crash) |
| `logs\frontend_stdout.log` / `frontend_stderr.log` | Output NSSM frontend |

```powershell
Get-Content logs\backend.log -Wait -Tail 20
Get-Content logs\frontend_stdout.log -Wait -Tail 20
```

### Uninstall / Reinstall (Windows)

```powershell
PowerShell -ExecutionPolicy Bypass -File uninstall_service.ps1 -All
PowerShell -ExecutionPolicy Bypass -File install_service.ps1 -All
```

### Troubleshooting Windows

| Gejala | Kemungkinan Penyebab | Solusi |
|---|---|---|
| `APDDetectionBackend` Stopped terus | `DATABASE_URL` salah | `Get-Content logs\backend_stderr.log -Tail 30` |
| Backend tidak merespons di 5001 | Service belum Running / Firewall | `.\status_windows.ps1` |
| `APDDetectionFrontend` Stopped terus | Build Next.js gagal | `Get-Content logs\frontend_stderr.log -Tail 30` |
| Frontend tidak merespons di 3000 | Firewall blokir | `New-NetFirewallRule -DisplayName "APDDetection-Frontend-Port3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow` |
| Ada dua service `APDDetection` & `APDDetectionBackend` | Migrasi gagal | `uninstall_service.ps1 -All` lalu `install_service.ps1 -All` |
| "DATABASE_URL belum di-set" | `.env` kosong | Salin dari `.env.example`, isi `DATABASE_URL` |

---

## 🍎 Setup di macOS

> macOS pakai **launchd** (bukan systemd/NSSM). Service didaftarkan sebagai
> **LaunchAgent** (bukan LaunchDaemon) supaya bisa akses kamera — macOS memblokir
> akses kamera untuk proses yang jalan sebelum user login.

### Prasyarat macOS

| Software | Install |
|---|---|
| Python 3.11+ | `brew install python@3.11` |
| PostgreSQL 14+ | `brew install postgresql@16` |
| Node.js 18+ LTS | `brew install node` |
| Git | Sudah ada (Xcode CLT) |

### Langkah 1 — Clone dan Setup Awal

```bash
git clone https://github.com/mraynar/apd-detection-tps.git
cd apd-detection-tps

# Backend
python3 -m venv venv
venv/bin/pip install -r backend/requirements.txt

# Database
createdb apd_detection
psql -d apd_detection -f apd_detection_pg12_20260708.sql

# Frontend
cd frontend && npm install && cd ..
```

### Langkah 2 — Isi Konfigurasi `.env`

```bash
cp backend/.env.example backend/.env
nano backend/.env
# Isi: DATABASE_URL=postgresql://localhost/apd_detection

cp frontend/.env.local.example frontend/.env.local
# Isi: NEXT_PUBLIC_BACKEND_URL=http://localhost:5001
```

### Langkah 3 — Pilih Mode Menjalankan

**Opsi A — Testing cepat dulu (disarankan pertama kali, terutama untuk approve izin kamera):**
```bash
chmod +x start.sh
./start.sh
```
Ini jalankan backend (`python app.py`) + frontend (`npm run dev`) sekaligus di terminal, berhenti saat `Ctrl+C`. Popup izin kamera macOS akan muncul di sini — klik **Allow**. Ini penting dilakukan **sebelum** install background service, karena proses background (`launchd`) tidak bisa menampilkan popup izin.

- Backend: `http://localhost:5001`
- Frontend: `http://localhost:3000`
- Log: `/tmp/apd-backend.log`, `/tmp/apd-frontend.log`

**Opsi B — Install sebagai background service permanen:**

```bash
chmod +x install_service_mac.sh uninstall_service_mac.sh status_mac.sh
```

| Yang mau dijalankan | Command |
|---|---|
| Backend + Frontend (keduanya) | `./install_service_mac.sh --all` |
| Backend saja | `./install_service_mac.sh --backend` |
| Frontend saja | `./install_service_mac.sh --frontend` |

Tanpa argumen = sama dengan `--all`. Migrasi dari service lama `com.tps.apddetection` (tanpa suffix) otomatis.

Script ini akan:
1. Validasi prasyarat (venv, `.env`, `run_production.py`, Node.js)
2. Build frontend (`.next/`) kalau belum ada
3. Generate plist dengan path dinamis (tidak hardcode)
4. Install ke `~/Library/LaunchAgents/`
5. Load via `launchctl load -w`
6. Verifikasi HTTP health check

Tidak perlu `sudo` — LaunchAgent jalan sebagai user biasa.

> **Penting:** Kalau kamera belum pernah di-approve sebelumnya (lewat Opsi A), backend
> background service akan gagal akses kamera secara diam-diam (macOS tidak bisa
> munculkan popup izin untuk proses `launchd`). Selalu jalankan `./start.sh` minimal
> sekali dulu dan approve izin kamera, baru install service permanen.

### Langkah 4 — Verifikasi Service Berjalan

```bash
./status_mac.sh

# atau individual
launchctl list | grep apddetection

curl http://localhost:5001/health   # {"status":"ok"}
curl -I http://localhost:3000       # HTTP/1.1 200 OK
```

### Manajemen Service macOS (Sehari-hari)

```bash
./status_mac.sh

# Individual — tidak ganggu service lain
launchctl stop  com.tps.apddetection.backend    # restart otomatis (KeepAlive)
launchctl start com.tps.apddetection.backend
launchctl stop  com.tps.apddetection.frontend
launchctl start com.tps.apddetection.frontend

# Nonaktifkan sementara (tidak auto-start saat login)
launchctl unload ~/Library/LaunchAgents/com.tps.apddetection.backend.plist

# Aktifkan kembali
launchctl load -w ~/Library/LaunchAgents/com.tps.apddetection.backend.plist
```

### Lokasi Log macOS

| File | Isi |
|---|---|
| `logs/backend.log` | Log utama Python backend (rotasi 10 MB × 5 file) |
| `logs/backend_stdout.log` / `backend_stderr.log` | Output launchd backend (cek stderr saat crash) |
| `logs/frontend_stdout.log` / `frontend_stderr.log` | Output launchd frontend |

```bash
tail -f logs/backend.log
tail -f logs/frontend_stdout.log
tail -30 logs/backend_stderr.log   # saat crash
```

### Uninstall / Reinstall (macOS)

```bash
./uninstall_service_mac.sh --all
./install_service_mac.sh --all
```

### Troubleshooting macOS

| Gejala | Kemungkinan Penyebab | Solusi |
|---|---|---|
| PID `-` di `launchctl list` | Crash saat startup | `tail logs/backend_stderr.log` |
| "DATABASE_URL belum di-set" | `.env` kosong | `cp backend/.env.example backend/.env && nano backend/.env` |
| Backend crash loop | PostgreSQL tidak jalan | `brew services start postgresql@16` |
| Frontend PID `-` setelah install | Build masih proses | Tunggu 2-3 menit, `./status_mac.sh` lagi |
| Port 5001/3000 sudah dipakai | Proses lain/instance lama nyangkut | `lsof -i :5001` → catat PID → `kill -9 <PID>` |
| Kamera "not authorized to capture video" saat pakai service | Izin kamera belum pernah di-approve untuk proses ini | Stop service → jalankan manual (`python run_production.py` dari `backend/`) → approve popup izin → Ctrl+C → start service lagi |
| Plist hilang / `launchctl bootstrap` gagal "I/O error" | File plist terhapus/corrupt | `./install_service_mac.sh --backend` (atau `--frontend`) — akan generate ulang otomatis |
| Service lama `com.tps.apddetection` masih ada | Migrasi tidak jalan | `./uninstall_service_mac.sh --all` lalu `./install_service_mac.sh --all` |
| Kamera tidak terdeteksi sama sekali | Plist ada di `/Library/LaunchAgents/` (daemon), bukan `~/Library/LaunchAgents/` | Install ulang tanpa `sudo` |
| Error 500 di semua endpoint API setelah restart service | Port bentrok dengan proses zombie dari percobaan manual sebelumnya | `lsof -i tcp:5001 -sTCP:LISTEN` → kill kalau ada, lalu install ulang service |

---

## Model yang Berjalan

- **Helmet** — deteksi helm terpasang / tidak (head, helmet, person)
- **Vest** — deteksi rompi keselamatan terpasang / tidak

Model chinstrap (tali pengunci helm) masih dalam training, belum aktif di `backend/app.py`.

---

## File Database — Perbedaan `.dump` vs `.sql`

| File | Format | Restore dengan | Kompatibilitas |
|---|---|---|---|
| `apd_detection_20260708.dump` | Custom binary (`pg_dump -Fc`) | `pg_restore` | Hanya PostgreSQL sama/lebih baru dari versi pembuat dump |
| `apd_detection_pg12_20260708.sql` | Plain SQL teks | `psql` | Semua versi PostgreSQL — lebih portable |

**Default yang dipakai `setup.ps1` dan instruksi manual macOS adalah `.sql`** karena lebih portable lintas versi.

```bash
# macOS/Linux
psql -d apd_detection -f apd_detection_pg12_20260708.sql          # .sql (rekomendasi)
pg_restore -d apd_detection apd_detection_20260708.dump           # .dump (hanya jika versi PG sama)
```

```powershell
# Windows
psql -U postgres -d apd_detection -f apd_detection_pg12_20260708.sql
pg_restore -U postgres -d apd_detection apd_detection_20260708.dump
```

---

## Konfigurasi Kamera / RTSP

Sumber kamera (webcam lokal atau RTSP CCTV) diatur lewat halaman **Camera & RTSP Settings**
di dashboard, bukan edit kode manual. Backend otomatis test koneksi sebelum menerapkan
sumber kamera baru.

Ada dua jenis "kamera" yang tampil di dashboard, jangan tertukar:
- **Preview Camera / Local Webcam** — diakses langsung oleh browser (client-side), dipakai untuk halaman Camera & RTSP Settings saat menguji kamera.
- **CAM 0x (Live Monitoring)** — diakses oleh backend Python (server-side, `cv2.VideoCapture`), ini yang benar-benar dipakai untuk deteksi APD. Kamera ini butuh izin akses kamera macOS untuk proses backend, terpisah dari izin kamera Safari/Chrome.

---

## Known Issues / Catatan Teknis

- **Port 5000 bentrok dengan AirPlay Receiver di macOS** — makanya backend pakai port 5001.
- **Continuity Camera** (Mac + iPhone berdekatan) bisa otomatis switch ke kamera iPhone saat testing webcam. Kalau kamera yang muncul bukan webcam laptop, matikan Continuity Camera di System Settings Mac dan iPhone.
- Dataset training **tidak di-push ke GitHub** (ukuran besar). Lihat `.gitignore` — folder `dataset/`, `VEST-SAFETY/`, `datasets-new/`, `runs_backup_*` sengaja dikecualikan.
- Akurasi deteksi menurun pada kondisi CCTV jarak jauh + minim cahaya. Sedang diperbaiki lewat data augmentation dan penambahan dataset (lihat progress di `training_log.txt`).
- Mode `start.sh` menjalankan backend lewat `python app.py` (dev server Flask), **bukan** lewat Waitress — ini disengaja untuk kemudahan debug saat development, dan terpisah dari `run_production.py` yang dipakai background service.

---

## Requirements

- Python 3.11+ (dites di 3.14)
- Node.js 18+ LTS (frontend Next.js)
- PostgreSQL 14+ (auth & riwayat pelanggaran)