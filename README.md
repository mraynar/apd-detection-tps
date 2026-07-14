# APD Detection System - TPS Petikemas Surabaya

Sistem deteksi Alat Pelindung Diri (helm dan rompi keselamatan) berbasis YOLOv8-OBB,
dengan backend Flask (Python) dan frontend Next.js.

---

## Mulai Cepat (Baru Pertama Kali Clone Repo Ini?)

Panduan ini untuk siapapun yang baru clone repo ini dan belum pernah menjalankan
project ini sama sekali, baik di Windows maupun macOS. Ikuti sesuai OS Anda dari
atas ke bawah.

### Ringkasan Arsitektur

Backend
- Teknologi: Flask + YOLOv8-OBB + OpenCV
- Port: 5001
- Fungsi: API, deteksi APD, kamera, database

Frontend
- Teknologi: Next.js
- Port: 3000
- Fungsi: Dashboard web (yang dibuka di browser)

Database
- Teknologi: PostgreSQL
- Port: 5432
- Fungsi: Auth, riwayat pelanggaran, analytics

Dua mode menjalankan sistem ini:

1. Mode testing/development (start.sh) - jalan manual di terminal, berhenti saat
   terminal ditutup. Cocok untuk coba-coba dan debug.
2. Mode background service (install_service_mac.sh / install_service.ps1) - jalan
   permanen, auto-start saat boot, auto-restart kalau crash. Cocok untuk pemakaian
   harian/produksi.

---

## Setup di Windows

### Prasyarat - Install Dulu Sebelum Mulai

- Git (versi terbaru) - https://git-scm.com/download/win
- Python 3.11 atau lebih baru - https://www.python.org/downloads/
  Saat instalasi, centang "Add Python to PATH"
- PostgreSQL 14 atau lebih baru - https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
- Node.js 18 LTS atau lebih baru - https://nodejs.org/

Catatan: NSSM (untuk background service) akan diunduh otomatis oleh install_service.ps1.
Tidak perlu install manual.

### Langkah 1 - Clone Repository

    git clone https://github.com/mraynar/apd-detection-tps.git
    cd apd-detection-tps

### Langkah 2 - Jalankan Setup Otomatis

Buka PowerShell (bukan Command Prompt), lalu jalankan:

    PowerShell -ExecutionPolicy Bypass -File setup.ps1

Script ini otomatis melakukan:

1. Cek versi Python
2. Buat virtual environment (venv/)
3. Install semua Python dependency dari requirements.txt
4. Cek dan (kalau perlu) start PostgreSQL service
5. Restore database dari apd_detection_pg12_20260708.sql
6. Salin backend/.env.example ke backend/.env, buka Notepad otomatis

Kalau PostgreSQL belum ditemukan, script berhenti dan menampilkan link download.
Install dulu, lalu jalankan ulang setup.ps1.

### Langkah 3 - Isi Konfigurasi .env

Notepad akan terbuka otomatis berisi backend/.env. Isi baris berikut:

    DATABASE_URL=postgresql://postgres:PASSWORD_ANDA@localhost:5432/apd_detection

Ganti PASSWORD_ANDA sesuai password PostgreSQL Anda. Simpan dan tutup.

Untuk frontend, jalankan:

    copy frontend\.env.local.example frontend\.env.local

Isi NEXT_PUBLIC_BACKEND_URL=http://localhost:5001 (default sudah benar untuk lokal).

### Langkah 4 - Pilih Mode Menjalankan

Opsi A - Testing cepat dulu (disarankan sebelum install service permanen):

    venv\Scripts\activate
    cd backend
    python app.py

Di terminal terpisah:

    cd frontend
    npm run dev

Buka http://localhost:3000 di browser.

Opsi B - Install sebagai background service permanen:

Buka PowerShell sebagai Administrator (klik kanan pada PowerShell, pilih
"Run as Administrator").

Untuk backend dan frontend sekaligus:

    PowerShell -ExecutionPolicy Bypass -File install_service.ps1 -All

Untuk backend saja:

    PowerShell -ExecutionPolicy Bypass -File install_service.ps1 -Backend

Untuk frontend saja:

    PowerShell -ExecutionPolicy Bypass -File install_service.ps1 -Frontend

Tanpa argumen sama dengan -All.

Script ini akan:

1. Migrasi otomatis kalau ada service lama bernama APDDetection
2. Unduh NSSM kalau belum ada
3. Daftarkan APDDetectionBackend dan/atau APDDetectionFrontend sebagai Windows Service
4. Konfigurasi auto-start saat boot dan auto-restart saat crash (delay 8 detik)
5. Buka port 5001 dan/atau 3000 di Windows Firewall
6. Frontend: build folder .next otomatis kalau belum ada, lalu jalankan next start

Perlu Administrator karena mendaftarkan Windows Service dan menambah Firewall rule
membutuhkan hak akses tersebut.

### Langkah 5 - Verifikasi Service Berjalan

    .\status_windows.ps1

Atau cek individual:

    Get-Service APDDetectionBackend
    Get-Service APDDetectionFrontend

    Invoke-RestMethod http://localhost:5001/health
    Invoke-RestMethod http://localhost:3000

### Manajemen Service Windows Sehari-hari

    .\status_windows.ps1

    Start-Service APDDetectionBackend
    Stop-Service  APDDetectionBackend
    Restart-Service APDDetectionBackend

    Start-Service APDDetectionFrontend
    Stop-Service  APDDetectionFrontend
    Restart-Service APDDetectionFrontend

Service auto-start saat Windows boot dan auto-restart saat crash. Tidak perlu
dijalankan manual setiap hari.

### Lokasi File Log Windows

- logs\backend.log - log utama Python backend (rotasi maksimal 10 MB x 5 file)
- logs\backend_stdout.log dan logs\backend_stderr.log - output NSSM backend
  (cek stderr saat backend crash)
- logs\frontend_stdout.log dan logs\frontend_stderr.log - output NSSM frontend

Pantau log secara real-time:

    Get-Content logs\backend.log -Wait -Tail 20
    Get-Content logs\frontend_stdout.log -Wait -Tail 20

### Uninstall / Reinstall Service Windows

    PowerShell -ExecutionPolicy Bypass -File uninstall_service.ps1 -All
    PowerShell -ExecutionPolicy Bypass -File install_service.ps1 -All

### Troubleshooting Windows

Gejala: APDDetectionBackend berstatus Stopped terus-menerus
Kemungkinan penyebab: DATABASE_URL salah di file .env
Solusi: jalankan Get-Content logs\backend_stderr.log -Tail 30

Gejala: Backend tidak merespons di port 5001
Kemungkinan penyebab: service belum Running, atau Firewall memblokir
Solusi: jalankan .\status_windows.ps1 untuk cek status dan HTTP

Gejala: APDDetectionFrontend berstatus Stopped terus-menerus
Kemungkinan penyebab: build Next.js gagal
Solusi: jalankan Get-Content logs\frontend_stderr.log -Tail 30

Gejala: Frontend tidak merespons di port 3000
Kemungkinan penyebab: Firewall memblokir
Solusi: tambahkan rule berikut:
    New-NetFirewallRule -DisplayName "APDDetection-Frontend-Port3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow

Gejala: muncul dua service, APDDetection dan APDDetectionBackend
Kemungkinan penyebab: migrasi tidak berjalan
Solusi: jalankan uninstall_service.ps1 -All lalu install_service.ps1 -All

Gejala: muncul error "DATABASE_URL belum di-set"
Kemungkinan penyebab: backend\.env kosong atau belum dibuat
Solusi: salin dari backend\.env.example dan isi DATABASE_URL

---

## Setup di macOS

Catatan: macOS menggunakan launchd, bukan systemd seperti Linux dan bukan NSSM
seperti Windows. Service didaftarkan sebagai LaunchAgent, bukan LaunchDaemon, agar
bisa mengakses kamera. macOS memblokir akses kamera dari proses yang berjalan
sebelum user login.

### Prasyarat macOS

- Python 3.11 atau lebih baru - brew install python@3.11
- PostgreSQL 14 atau lebih baru - brew install postgresql@16
- Node.js 18 LTS atau lebih baru - brew install node
- Git - sudah tersedia di macOS lewat Xcode Command Line Tools

### Langkah 1 - Clone dan Setup Awal

    git clone https://github.com/mraynar/apd-detection-tps.git
    cd apd-detection-tps

    python3 -m venv venv
    venv/bin/pip install -r backend/requirements.txt

    createdb apd_detection
    psql -d apd_detection -f apd_detection_pg12_20260708.sql

    cd frontend && npm install && cd ..

### Langkah 2 - Isi Konfigurasi .env

    cp backend/.env.example backend/.env
    nano backend/.env

Isi baris berikut di backend/.env:

    DATABASE_URL=postgresql://localhost/apd_detection

Untuk frontend:

    cp frontend/.env.local.example frontend/.env.local

Isi NEXT_PUBLIC_BACKEND_URL=http://localhost:5001 (default sudah benar).

### Langkah 3 - Pilih Mode Menjalankan

Opsi A - Testing cepat dulu (wajib dilakukan minimal sekali, terutama untuk
menyetujui izin kamera):

    chmod +x start.sh
    ./start.sh

Ini menjalankan backend (python app.py) dan frontend (npm run dev) sekaligus di
terminal, berhenti saat Ctrl+C ditekan. Popup izin kamera macOS akan muncul saat
ini - klik Allow. Langkah ini penting dilakukan sebelum install background
service, karena proses background (launchd) tidak bisa menampilkan popup izin.

- Backend: http://localhost:5001
- Frontend: http://localhost:3000
- Log: /tmp/apd-backend.log dan /tmp/apd-frontend.log

Opsi B - Install sebagai background service permanen:

    chmod +x install_service_mac.sh uninstall_service_mac.sh status_mac.sh

Untuk backend dan frontend sekaligus:

    ./install_service_mac.sh --all

Untuk backend saja:

    ./install_service_mac.sh --backend

Untuk frontend saja:

    ./install_service_mac.sh --frontend

Tanpa argumen sama dengan --all. Migrasi dari service lama bernama
com.tps.apddetection (tanpa suffix) berjalan otomatis.

Script ini akan:

1. Validasi prasyarat (venv, file .env, run_production.py, Node.js)
2. Build frontend (folder .next) kalau belum ada
3. Generate file plist dengan path yang di-resolve secara dinamis, tidak hardcode
4. Install ke folder ~/Library/LaunchAgents/
5. Load lewat launchctl load -w
6. Verifikasi lewat HTTP health check

Peringatan penting: kalau kamera belum pernah disetujui sebelumnya lewat Opsi A,
backend yang dijalankan sebagai background service akan gagal mengakses kamera
secara diam-diam, karena macOS tidak bisa menampilkan popup izin untuk proses
launchd. Selalu jalankan ./start.sh minimal sekali terlebih dahulu dan setujui
izin kamera, baru install service permanen.

Tidak perlu menjalankan dengan sudo. LaunchAgent berjalan sebagai user biasa.

### Langkah 4 - Verifikasi Service Berjalan

    ./status_mac.sh

Atau cek individual:

    launchctl list | grep apddetection

    curl http://localhost:5001/health
    curl -I http://localhost:3000

### Manajemen Service macOS Sehari-hari

    ./status_mac.sh

Stop dan start individual, tidak mengganggu service lain:

    launchctl stop  com.tps.apddetection.backend
    launchctl start com.tps.apddetection.backend
    launchctl stop  com.tps.apddetection.frontend
    launchctl start com.tps.apddetection.frontend

Restart cukup dengan stop saja, launchd akan otomatis restart dalam sekitar
8 detik karena KeepAlive aktif:

    launchctl stop com.tps.apddetection.backend

Nonaktifkan sementara (tidak auto-start saat login):

    launchctl unload ~/Library/LaunchAgents/com.tps.apddetection.backend.plist

Aktifkan kembali:

    launchctl load -w ~/Library/LaunchAgents/com.tps.apddetection.backend.plist

### Lokasi File Log macOS

- logs/backend.log - log utama Python backend (rotasi maksimal 10 MB x 5 file)
- logs/backend_stdout.log dan logs/backend_stderr.log - output launchd backend
  (cek stderr saat backend crash)
- logs/frontend_stdout.log dan logs/frontend_stderr.log - output launchd frontend

Pantau log secara real-time:

    tail -f logs/backend.log
    tail -f logs/frontend_stdout.log

Saat service crash pada startup:

    tail -30 logs/backend_stderr.log
    tail -30 logs/frontend_stderr.log

### Uninstall / Reinstall Service macOS

    ./uninstall_service_mac.sh --all
    ./install_service_mac.sh --all

### Troubleshooting macOS

Gejala: PID muncul sebagai tanda strip di launchctl list
Kemungkinan penyebab: crash saat startup
Solusi: jalankan tail logs/backend_stderr.log

Gejala: muncul error "DATABASE_URL belum di-set"
Kemungkinan penyebab: backend/.env tidak ada atau kosong
Solusi: jalankan cp backend/.env.example backend/.env lalu edit isinya

Gejala: backend crash berulang-ulang (restart loop)
Kemungkinan penyebab: PostgreSQL tidak berjalan
Solusi: jalankan brew services start postgresql@16

Gejala: frontend PID masih strip setelah baru install
Kemungkinan penyebab: proses build Next.js masih berjalan
Solusi: tunggu 2 sampai 3 menit, lalu jalankan ./status_mac.sh lagi

Gejala: port 5001 atau 3000 sudah dipakai
Kemungkinan penyebab: ada proses lain atau instance lama yang masih nyangkut
Solusi: jalankan lsof -i :5001 atau lsof -i :3000, catat PID yang muncul, lalu
kill -9 PID_TERSEBUT

Gejala: muncul error "OpenCV not authorized to capture video" saat pakai
background service
Kemungkinan penyebab: izin kamera belum pernah disetujui untuk proses ini
Solusi: stop service, jalankan manual (python run_production.py dari folder
backend), setujui popup izin kamera yang muncul, tekan Ctrl+C, lalu start
service lagi

Gejala: file plist hilang, atau launchctl bootstrap gagal dengan pesan
"Input/output error"
Kemungkinan penyebab: file plist terhapus atau rusak
Solusi: jalankan ./install_service_mac.sh --backend atau --frontend, file akan
di-generate ulang secara otomatis

Gejala: service lama bernama com.tps.apddetection masih ada
Kemungkinan penyebab: proses migrasi tidak berjalan dengan benar
Solusi: jalankan ./uninstall_service_mac.sh --all lalu ./install_service_mac.sh --all

Gejala: kamera sama sekali tidak terdeteksi
Kemungkinan penyebab: file plist berada di /Library/LaunchAgents/ (LaunchDaemon),
bukan di ~/Library/LaunchAgents/ (LaunchAgent)
Solusi: install ulang tanpa menggunakan sudo

Gejala: error 500 muncul di semua endpoint API setelah restart service
Kemungkinan penyebab: port bentrok dengan proses lama yang belum benar-benar
mati dari percobaan manual sebelumnya
Solusi: jalankan lsof -i tcp:5001 -sTCP:LISTEN, kill prosesnya kalau ada,
lalu install ulang service

---

## Model yang Berjalan

- Helmet - deteksi helm terpasang atau tidak (kelas: head, helmet, person)
- Vest - deteksi rompi keselamatan terpasang atau tidak

Model chinstrap (tali pengunci helm) masih dalam proses training, belum aktif
di backend/app.py.

---

## File Database - Perbedaan Format Dump dan SQL

File apd_detection_20260708.dump
- Format: custom binary (hasil pg_dump -Fc)
- Cara restore: pg_restore
- Kompatibilitas: hanya PostgreSQL yang sama atau lebih baru dari versi
  pembuat dump

File apd_detection_pg12_20260708.sql
- Format: plain SQL teks
- Cara restore: psql
- Kompatibilitas: semua versi PostgreSQL, lebih portable

Default yang digunakan oleh setup.ps1 dan instruksi manual macOS adalah file
.sql karena lebih portable lintas versi PostgreSQL.

Cara restore manual di macOS/Linux:

    psql -d apd_detection -f apd_detection_pg12_20260708.sql
    pg_restore -d apd_detection apd_detection_20260708.dump

Cara restore manual di Windows:

    psql -U postgres -d apd_detection -f apd_detection_pg12_20260708.sql
    pg_restore -U postgres -d apd_detection apd_detection_20260708.dump

---

## Konfigurasi Kamera dan RTSP

Sumber kamera (webcam lokal atau RTSP CCTV) diatur lewat halaman Camera and RTSP
Settings di dashboard, bukan dengan mengedit kode secara manual. Backend otomatis
menguji koneksi sebelum menerapkan sumber kamera baru.

Ada dua jenis kamera yang tampil di dashboard, jangan sampai tertukar:

Preview Camera atau Local Webcam - diakses langsung oleh browser (client-side),
dipakai untuk menguji kamera di halaman Camera and RTSP Settings.

CAM 0x pada Live Monitoring - diakses oleh backend Python (server-side, lewat
cv2.VideoCapture), ini yang benar-benar dipakai untuk deteksi APD. Kamera ini
membutuhkan izin akses kamera macOS untuk proses backend, terpisah dari izin
kamera Safari atau Chrome.

---

## Known Issues dan Catatan Teknis

Port 5000 bentrok dengan AirPlay Receiver di macOS, itu sebabnya backend
menggunakan port 5001.

Continuity Camera (Mac dan iPhone yang berdekatan) bisa otomatis berpindah ke
kamera iPhone saat menguji webcam. Kalau kamera yang muncul bukan webcam laptop,
matikan Continuity Camera di System Settings Mac dan di iPhone.

Dataset training tidak di-push ke GitHub karena ukurannya besar. Lihat isi
.gitignore, folder dataset/, VEST-SAFETY/, datasets-new/, dan runs_backup_*
sengaja dikecualikan.

Akurasi deteksi menurun pada kondisi CCTV jarak jauh dengan pencahayaan minim.
Sedang diperbaiki lewat data augmentation dan penambahan dataset. Lihat progress
training di training_log.txt.

Mode start.sh menjalankan backend lewat python app.py (dev server Flask), bukan
lewat Waitress. Ini disengaja untuk kemudahan debug saat development, dan
terpisah dari run_production.py yang dipakai oleh background service.

---

## Requirements

- Python 3.11 atau lebih baru (sudah diuji di versi 3.14)
- Node.js 18 LTS atau lebih baru (untuk frontend Next.js)
- PostgreSQL 14 atau lebih baru (untuk autentikasi dan riwayat pelanggaran)
