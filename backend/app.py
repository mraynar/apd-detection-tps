"""
PPE Detection System - Terminal Petikemas Surabaya (PT TPS - Pelindo)

Real-time detection of helmet and safety vest usage using two separate
YOLOv8-OBB models, displayed through a Next.js web dashboard.

Known limitation (documented, not hidden): the helmet/head models can
occasionally misclassify a bare head as "helmet" at certain angles or
lighting conditions. This is a model training limitation, not a code bug.
It is mitigated here via conservative confidence thresholds, but the
long-term fix is retraining with a larger and more varied dataset
(different angles, distances, lighting - see project notes).

Features:
- Simultaneous helmet and vest detection (2 independent models)
- Adaptive lighting correction (CLAHE) for low-light conditions
- Temporal smoothing to reduce detection flicker
- Per-class confidence thresholds, tuned to reduce false positives
- Supports both webcam and CCTV (RTSP) input
- Auto-detects OS for camera backend compatibility (Windows & Mac)
- REST JSON API for Next.js frontend
- CORS enabled for localhost:3000 (Next.js dev) and production origin

==== CAMERA INDEX NOTES (cross-platform) ====

CAMERA_INDEX adalah urutan perangkat fisik seperti yang dideteksi oleh OS.
Angka index-nya (0, 1, 2, ...) TIDAK berubah antar OS — yang berbeda antar OS
hanyalah BACKEND yang digunakan oleh OpenCV:
  - Windows: cv2.CAP_DSHOW (DirectShow) — lebih stabil untuk USB webcam di Windows
  - macOS/Linux: default (AVFoundation di macOS, V4L2 di Linux)

Konsekuensinya:
  - Index 0 di Windows dan index 0 di macOS bisa menunjuk ke kamera fisik yang BERBEDA,
    tergantung urutan deteksi OS dan perangkat yang terhubung.
  - Tidak ada normalisasi silang OS — user harus refresh enumerasi di device masing-masing.

Known issue — macOS Continuity Camera:
  Jika iPhone berada di dekat Mac dan fitur Continuity Camera aktif, iPhone dapat
  secara otomatis muncul sebagai kamera tambahan dan MENGUBAH urutan index yang ada.
  Contoh: built-in webcam yang sebelumnya di index 0 bisa berpindah ke index 1.
  Jika hasil enumerasi kamera terlihat aneh, cek System Settings > General > AirPlay & Handoff
  dan nonaktifkan Continuity Camera sementara, atau cabut iPhone dari jangkauan Bluetooth/WiFi Mac.
"""

from flask import Flask, Response, jsonify, request, stream_with_context
from flask_cors import CORS
from ultralytics import YOLO
from collections import deque, defaultdict
import cv2
import csv
import io
import os
import queue
import platform
import time
import uuid
import datetime
import threading
from functools import wraps
import bcrypt
from dotenv import load_dotenv
import numpy as np
import torch

# Auto-detect best available inference device (cross-platform safe: Mac/Windows/Linux)
if torch.cuda.is_available():
    DEVICE = 'cuda'
elif torch.backends.mps.is_available():
    DEVICE = 'mps'
else:
    DEVICE = 'cpu'
print(f"[INFO] Using inference device: {DEVICE}")

# Load environmental variables
load_dotenv()

app = Flask(__name__)

# ---- CORS -------------------------------------------------------------------
# CORS_ORIGINS (env): comma-separated list of additional allowed origins.
# Example (production): CORS_ORIGINS=http://192.168.1.100:3000,https://apd.tps.co.id
# Localhost origins are always included as a fallback for development.
_cors_origins_env = os.environ.get("CORS_ORIGINS", "")
_cors_extra = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
_cors_origins = list(dict.fromkeys(
    _cors_extra + ["http://localhost:3000", "http://127.0.0.1:3000"]
))
print(f"[INFO] CORS origins: {_cors_origins}")

CORS(app, resources={r"/*": {
    "origins": _cors_origins,
    "allow_headers": ["Authorization", "Content-Type", "Cookie"]
}}, supports_credentials=True)

# ==== DATABASE CONFIGURATION ====
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise SystemExit(
        "\n[FATAL] DATABASE_URL belum di-set.\n"
        "Copy backend/.env.example ke backend/.env dan isi sesuai "
        "kredensial PostgreSQL lokal Anda.\n"
        "Contoh: DATABASE_URL=postgresql://postgres:password@localhost:5432/apd_detection\n"
    )
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

from database import db, User, Session as DBSession, Violation, Camera
db.init_app(app)

# ==== CENTRAL ROLE-BASED ACCESS CONTROL (RBAC) ====
ROLE_PERMISSIONS = {
    "admin": {
        "live_monitoring",
        "camera_control",
        "user_management",
        "detection_control",
        "compliance_review",
        "analytics"
    },
    "user": {
        "compliance_review",
        "analytics",
        "live_monitoring",
        "camera_control"
    }
}

def check_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def require_auth(permission=None):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if request.method == 'OPTIONS':
                return f(*args, **kwargs)

            # Retrieve token from Authorization header, cookie, or query parameter
            token = request.headers.get("Authorization")
            if not token:
                token = request.cookies.get("session_token")
            if not token:
                token = request.args.get("token")

            if not token:
                return jsonify({"error": "Unauthorized", "message": "Authentication token missing."}), 401

            if isinstance(token, str) and token.startswith("Bearer "):
                token = token[7:]

            now = datetime.datetime.utcnow()
            # Lookup the token in the database
            session = DBSession.query.filter_by(token=token).first()
            if not session or session.expires_at < now:
                # If session is expired, delete it
                if session:
                    db.session.delete(session)
                    db.session.commit()
                return jsonify({"error": "Unauthorized", "message": "Invalid or expired session token."}), 401

            # Validate role based on permission mapping
            user_role = session.role
            if permission:
                allowed_permissions = ROLE_PERMISSIONS.get(user_role, set())
                if permission not in allowed_permissions:
                    return jsonify({
                        "error": "Forbidden", 
                        "message": f"Akses ditolak. Role '{user_role}' tidak memiliki izin '{permission}'."
                    }), 403

            request.user_session = {
                "token": session.token,
                "user_id": session.user_id,
                "role": session.role
            }
            return f(*args, **kwargs)
        return decorated
    return decorator


# ==== AI MODELS ====
# Paths are relative to backend/ — run `python app.py` from the backend/ folder
MODEL_HELMET_PATH = '../models-archive/helmet_v5_safetyhelmet_5936img.pt'
MODEL_VEST_PATH = '../models-archive/vest_v5_cleaned_2936img.pt'
MODEL_CHINSTRAP_PATH = '../runs/chinstrap_v1/weights/best.pt'
ENABLE_CHINSTRAP = False

try:
    model_helmet = YOLO(MODEL_HELMET_PATH)
    model_vest = YOLO(MODEL_VEST_PATH)
    model_chinstrap = YOLO(MODEL_CHINSTRAP_PATH) if ENABLE_CHINSTRAP else None
    models_loaded = True
except Exception as e:
    print(f"[WARN] Could not load models: {e}")
    models_loaded = False
    model_helmet = None
    model_vest = None
    model_chinstrap = None

# ==== VIDEO SOURCE SETTINGS ====
# USE_RTSP = False -> use laptop webcam (for testing)
# USE_RTSP = True  -> use CCTV camera via RTSP (for field deployment)
USE_RTSP = False
CAMERA_INDEX = 0
RTSP_URL = "rtsp://username:password@camera_ip:port/stream"
SELECTED_CAMERA_ID = "webcam_0"  # logical ID for the currently active source
WEBCAM_DEVICE_ID = ""  # physical device ID for local webcam preview

# Target webcam capture resolution
CAPTURE_WIDTH = 1920
CAPTURE_HEIGHT = 1080

# Thread lock for camera/settings mutation
camera_lock = threading.Lock()

# Thread locks and dicts for per-camera-id active capture sessions
active_captures = {}
captures_dict_lock = threading.Lock()
camera_stats = {}
camera_stats_lock = threading.Lock()
CAPTURE_EXPIRY_SECONDS = 30

# Synchronized camera opening lock to prevent race conditions on environment settings
camera_open_lock = threading.Lock()

def safe_open_video_capture(url, timeout_ms=None, api_preference=cv2.CAP_FFMPEG):
    """
    Synchronized wrapper to open cv2.VideoCapture with an optional timeout.
    Uses OPENCV_FFMPEG_CAPTURE_OPTIONS to set FFMPEG-specific timeout environment variables.
    
    NOTE ON SCALING:
    Using one global camera_open_lock serializes all VideoCapture openings across all threads.
    If VideoCapture(url) hangs on a broken stream, other threads opening/connecting streams
    will block during that window. For multi-camera environments with dozens of streams,
    this should be optimized to use per-URL/per-IP locks rather than one global lock.
    """
    with camera_open_lock:
        if timeout_ms is not None:
            # FFMPEG timeout is in microseconds
            os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = f"rtsp_transport;tcp|timeout;{timeout_ms * 1000}"
        else:
            os.environ.pop("OPENCV_FFMPEG_CAPTURE_OPTIONS", None)

        try:
            # Use CAP_FFMPEG as api_preference to ensure capture options are respected
            cap = cv2.VideoCapture(url, api_preference)
        finally:
            # Reset environment variable immediately
            os.environ.pop("OPENCV_FFMPEG_CAPTURE_OPTIONS", None)
            
        return cap


def get_or_open_camera_capture(camera_id, rtsp_url):
    current_time = time.time()
    with captures_dict_lock:
        if camera_id in active_captures:
            entry = active_captures[camera_id]
            entry["last_requested"] = current_time
            # If the RTSP URL changed, release and reset the capture
            if entry["rtsp_url"] != rtsp_url:
                if entry["cap"] is not None:
                    entry["cap"].release()
                entry["cap"] = None
                entry["rtsp_url"] = rtsp_url
            return entry

        # Create entry
        entry = {
            "cap": None,
            "lock": threading.Lock(),
            "last_requested": current_time,
            "rtsp_url": rtsp_url
        }
        active_captures[camera_id] = entry
        return entry

def active_captures_cleanup_worker():
    while True:
        time.sleep(10)
        current_time = time.time()
        to_release = []
        with captures_dict_lock:
            for cam_id, entry in list(active_captures.items()):
                if current_time - entry["last_requested"] > CAPTURE_EXPIRY_SECONDS:
                    to_release.append((cam_id, entry))
                    del active_captures[cam_id]
                    
        for cam_id, entry in to_release:
            print(f"[RTSP] Releasing inactive stream for camera_id {cam_id}", flush=True)
            with entry["lock"]:
                if entry["cap"] is not None:
                    try:
                        entry["cap"].release()
                    except Exception as e:
                        print(f"[ERROR] Failed to release camera {cam_id}: {e}", flush=True)
                    entry["cap"] = None

# Start active captures cleanup daemon
cleanup_thread = threading.Thread(target=active_captures_cleanup_worker, daemon=True)
cleanup_thread.start()

def update_camera_stats(camera_id, all_detected, fps=0):
    if not camera_id:
        return
    violations_count = sum(1 for d in all_detected if d.get("violation", False))
    now = datetime.datetime.now()
    
    with camera_stats_lock:
        camera_stats[camera_id] = {
            "fps": fps,
            "total_detected": len(all_detected),
            "violations": violations_count,
            "last_frame_time": now.isoformat(),
            "detections": all_detected,
            "is_detecting": is_detecting,
            "stream_active": True
        }


def open_camera(use_rtsp=None, rtsp_url=None, cam_index=None):
    """Open a cv2 VideoCapture based on current settings."""
    _use_rtsp = USE_RTSP if use_rtsp is None else use_rtsp
    _rtsp_url = RTSP_URL if rtsp_url is None else rtsp_url
    _cam_index = CAMERA_INDEX if cam_index is None else cam_index

    if _use_rtsp:
        cap = cv2.VideoCapture(_rtsp_url)
    else:
        if platform.system() == "Windows":
            cap = cv2.VideoCapture(_cam_index, cv2.CAP_DSHOW)
        else:
            cap = cv2.VideoCapture(_cam_index)
            
        # Set target resolution
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAPTURE_WIDTH)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAPTURE_HEIGHT)
        
        # Read back actual resolution achieved
        actual_w = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
        actual_h = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
        print(f"[INFO] Webcam index {_cam_index} resolution set to: {actual_w}x{actual_h} (target: {CAPTURE_WIDTH}x{CAPTURE_HEIGHT})")
        
    return cap


camera = open_camera()

# ==== DETECTION SETTINGS ====
# "helmet" and "head" thresholds are deliberately conservative (higher) because
# these two classes are the most prone to confusion in the current model.
# Lowering them increases false positives (bare head misread as helmet).
CONFIDENCE_THRESHOLDS = {
    "head": 0.5,
    "helmet": 0.65,
    "Safety Vest": 0.4,
    "NO-Safety Vest": 0.45,
    
    # Chinstrap model thresholds (prefixed to avoid collision with helmet/head model)
    # - chinstrap_bad-strap: 0.55 (conservative to reduce false violation alerts)
    # - chinstrap_good-strap: 0.50 (standard compliant class)
    # - chinstrap_helmet: 0.65 (conservative, matches primary helmet threshold)
    # - chinstrap_no-helmet: 0.60 (conservative to avoid bare heads classified as no-helmet)
    "chinstrap_bad-strap": 0.55,
    "chinstrap_good-strap": 0.50,
    "chinstrap_helmet": 0.65,
    "chinstrap_no-helmet": 0.60,
}
DEFAULT_THRESHOLD = 0.5

NMS_IOU = 0.4
VIOLATION_CLASSES = {"head", "NO-Safety Vest", "chinstrap_bad-strap", "chinstrap_no-helmet"}

# Temporal smoothing: use the median violation count over recent frames
# to avoid the number flickering between values on a per-frame basis.
HISTORY_LENGTH = 5
detection_history = deque(maxlen=HISTORY_LENGTH)

# Toggle for pausing/resuming inference without stopping the camera
is_detecting = True

latest_stats = {
    "total_objects": 0,
    "violations": 0,
    "detections": [],
    "fps": 0,
    "last_frame_time": None,
}




# Hourly buckets: key = "YYYY-MM-DD HH", value = {"total": int, "violations": int}
hourly_buckets = defaultdict(lambda: {"total": 0, "violations": 0})

# Daily summary: key = "YYYY-MM-DD", value = {"total": int, "violations": int}
daily_summary = defaultdict(lambda: {"total": 0, "violations": 0})

stats_lock = threading.Lock()

# Cooldown for duplicate violation saving (in seconds)
VIOLATION_COOLDOWN_SEC = 5.0
last_logged_violations = {}  # key: (camera_source, label), value: time.time() float

# Asynchronous violation saving queue
violation_queue = queue.Queue()

def db_writer_worker():
    """Background worker thread to commit violations from the queue to PostgreSQL."""
    print("[INFO] Background DB writer thread started.", flush=True)
    while True:
        try:
            item = violation_queue.get()
            if item is None:
                # Shutdown signal
                violation_queue.task_done()
                break

            success = False
            retries = 3
            backoff = 2.0
            
            for attempt in range(retries):
                try:
                    with app.app_context():
                        new_violation = Violation(
                            id=item["id"],
                            timestamp=item["timestamp"],
                            label=item["label"],
                            confidence=item["confidence"],
                            camera_source=item["camera_source"],
                            is_violation=True
                        )
                        db.session.add(new_violation)
                        db.session.commit()
                        
                        # Enforce 50-record FIFO cap in the database table
                        total_count = Violation.query.count()
                        if total_count > 50:
                            to_delete = (
                                Violation.query.order_by(Violation.timestamp.asc(), Violation.created_at.asc())
                                .limit(total_count - 50)
                                .all()
                            )
                            for v in to_delete:
                                db.session.delete(v)
                            db.session.commit()
                        
                        success = True
                        break
                except Exception as e:
                    print(f"[ERROR] Failed to save violation to DB (attempt {attempt+1}/{retries}): {e}", flush=True)
                    try:
                        db.session.rollback()
                    except Exception:
                        pass
                    time.sleep(backoff)
                    backoff *= 2.0

            if not success:
                print(f"[CRITICAL] Failed to write violation {item['id']} to database after {retries} attempts. Saving locally to failed_violations.log.", flush=True)
                try:
                    backup_file = os.path.join(app.root_path, "failed_violations.log")
                    with open(backup_file, "a") as f:
                        f.write(f"Timestamp: {item['timestamp']} | ID: {item['id']} | Label: {item['label']} | Conf: {item['confidence']} | Source: {item['camera_source']}\n")
                except Exception as write_err:
                    print(f"[ERROR] Failed to write to backup log file: {write_err}", flush=True)

            violation_queue.task_done()
        except Exception as e:
            print(f"[ERROR] Exception in db_writer_worker thread loop: {e}", flush=True)


# ==== HELPER FUNCTIONS ====

def enhance_frame(frame):
    """
    Improve frame lighting and contrast before detection using CLAHE.
    Sharpening was tested and removed: it introduced visible artifacts on
    complex textures (hair, fabric edges) that made detection less reliable.
    
    Tuned: clipLimit set to 2.5 for stronger low-light correction, and added
    a conditional gamma correction step for dark frames to avoid over-exposure.
    """
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    
    # Conditional gamma correction for low-light frames (L-channel mean < 75)
    mean_l = np.mean(l)
    if mean_l < 75:
        # Boost shadows and dark regions
        gamma = 1.4
        invGamma = 1.0 / gamma
        table = np.array([((i / 255.0) ** invGamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
        l = cv2.LUT(l, table)
        
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    l = clahe.apply(l)
    enhanced = cv2.merge((l, a, b))
    enhanced = cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)
    return enhanced
def get_threshold(label):
    return CONFIDENCE_THRESHOLDS.get(label, DEFAULT_THRESHOLD)


def draw_violations_only(frame, results, label_prefix=""):
    """Draw bounding boxes ONLY for classes considered a violation."""
    names = results[0].names
    detected = []

    obb_data = results[0].obb
    if obb_data is None:
        return frame, detected

    for box in obb_data:
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        raw_label = names[cls_id]
        
        # Apply prefix to distinguish classes from different models (e.g. "chinstrap_helmet")
        label = f"{label_prefix}{raw_label}" if label_prefix else raw_label

        if conf < get_threshold(label):
            continue

        is_violation = label in VIOLATION_CLASSES
        points = box.xyxyxyxy[0].cpu().numpy().astype(int)
        
        detected.append({
            "label": label,
            "confidence": round(conf, 2),
            "violation": is_violation,
            "is_violation": is_violation,
            "box_points": points.tolist()
        })

        if is_violation:
            cv2.polylines(frame, [points], isClosed=True, color=(0, 0, 255), thickness=2)
            text_pos = (int(points[0][0]), int(points[0][1]) - 10)
            cv2.putText(frame, f"{label} {conf:.2f}", text_pos,
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

    return frame, detected


def smooth_violation_count(current_count):
    detection_history.append(current_count)
    sorted_history = sorted(detection_history)
    mid = len(sorted_history) // 2
    return sorted_history[mid]


def record_detections(all_detected, now):
    """Append violation events to in-memory aggregates and queue database writes asynchronously."""
    hour_key = now.strftime("%Y-%m-%d %H")
    day_key = now.strftime("%Y-%m-%d")

    with stats_lock:
        hourly_buckets[hour_key]["total"] += len(all_detected)
        daily_summary[day_key]["total"] += len(all_detected)

        for d in all_detected:
            if d["violation"]:
                camera_source = RTSP_URL if USE_RTSP else f"Webcam #{CAMERA_INDEX}"
                label = d["label"]
                
                # Cooldown check to deduplicate violations
                cooldown_key = (camera_source, label)
                current_time = time.time()
                last_logged = last_logged_violations.get(cooldown_key, 0.0)
                if current_time - last_logged < VIOLATION_COOLDOWN_SEC:
                    continue
                    
                last_logged_violations[cooldown_key] = current_time
                
                event_id = str(uuid.uuid4())
                timestamp_str = now.isoformat()
                
                # Queue the violation to be saved asynchronously in the background thread
                violation_data = {
                    "id": event_id,
                    "timestamp": timestamp_str,
                    "label": label,
                    "confidence": d["confidence"],
                    "camera_source": camera_source
                }
                violation_queue.put(violation_data)
                
                hourly_buckets[hour_key]["violations"] += 1
                daily_summary[day_key]["violations"] += 1



# ==== MJPEG STREAM GENERATOR ====

def generate_frames():
    global latest_stats, camera
    prev_time = time.time()

    while True:
        if not USE_RTSP:
            # Client-side webcams are uploaded to /api/detect-frame; server streaming is inactive
            time.sleep(0.5)
            continue

        t0 = time.time()
        with camera_lock:
            if camera and camera.isOpened():
                success, frame = camera.read()
            else:
                success, frame = False, None
        t_cam = time.time() - t0

        if not success:
            # Yield a blank frame so the MJPEG stream stays alive
            time.sleep(0.1)
            continue

        if not is_detecting or not models_loaded:
            # Detection paused or models not loaded — stream raw frame
            ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
            if ret:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            time.sleep(0.033)
            continue

        t_enhance_start = time.time()
        frame = enhance_frame(frame)
        t_enhance = time.time() - t_enhance_start

        t_inf_start = time.time()
        results_helmet = model_helmet(frame, verbose=False, iou=NMS_IOU, device=DEVICE)
        results_vest = model_vest(frame, verbose=False, iou=NMS_IOU, device=DEVICE)
        results_chinstrap = model_chinstrap(frame, verbose=False, iou=NMS_IOU, device=DEVICE) if model_chinstrap else None
        t_inf = time.time() - t_inf_start

        t_draw_start = time.time()
        frame, detected_helmet = draw_violations_only(frame, results_helmet)
        frame, detected_vest = draw_violations_only(frame, results_vest)
        frame, detected_chinstrap = draw_violations_only(frame, results_chinstrap, label_prefix="chinstrap_") if results_chinstrap else (frame, [])
        all_detected = detected_helmet + detected_vest + detected_chinstrap
        t_draw = time.time() - t_draw_start

        t_smooth_start = time.time()
        raw_violation_count = sum(1 for d in all_detected if d["violation"])
        violation_count = smooth_violation_count(raw_violation_count)
        t_smooth = time.time() - t_smooth_start

        current_time = time.time()
        fps = 1 / (current_time - prev_time) if current_time != prev_time else 0
        prev_time = current_time

        now = datetime.datetime.now()

        latest_stats = {
            "total_objects": len(all_detected),
            "violations": violation_count,
            "detections": all_detected,
            "fps": round(fps, 1),
            "last_frame_time": now.isoformat(),
        }

        t_record_start = time.time()
        record_detections(all_detected, now)
        t_record = time.time() - t_record_start

        t_encode_start = time.time()
        ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        t_encode = time.time() - t_encode_start

        total_frame_time = time.time() - t0
        if total_frame_time > 0.200:
            print(f"[SLOW FRAME DETECTED] Total: {total_frame_time*1000:.1f}ms | "
                  f"Cam Read: {t_cam*1000:.1f}ms | "
                  f"Enhance: {t_enhance*1000:.1f}ms | "
                  f"YOLO Inference: {t_inf*1000:.1f}ms | "
                  f"Draw: {t_draw*1000:.1f}ms | "
                  f"Smooth: {t_smooth*1000:.1f}ms | "
                  f"Record DB: {t_record*1000:.1f}ms | "
                  f"Encode: {t_encode*1000:.1f}ms", flush=True)

        if ret:
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')


def generate_camera_frames(camera_id, rtsp_url):
    """
    Stateful camera generator that reads from the respective VideoCapture object,
    runs YOLO detection using the correct device parameters, updates metrics,
    and streams raw MJPEG frames.
    """
    entry = get_or_open_camera_capture(camera_id, rtsp_url)
    cap_lock = entry["lock"]
    prev_time = time.time()
    
    while True:
        # Prevent inactive stream timeout by updating last_requested
        with captures_dict_lock:
            if camera_id not in active_captures:
                print(f"[RTSP] Stream for camera_id {camera_id} was removed/deleted.", flush=True)
                break
            entry = active_captures[camera_id]
            if entry["rtsp_url"] != rtsp_url:
                print(f"[RTSP] Stream RTSP URL changed. Closing frame generator.", flush=True)
                break
            entry["last_requested"] = time.time()

        t0 = time.time()
        success = False
        frame = None
        
        with cap_lock:
            cap = entry["cap"]
            if cap is None or not cap.isOpened():
                if cap is not None:
                    try:
                        cap.release()
                    except Exception as e:
                        print(f"[ERROR] Failed to release capture on reopen: {e}", flush=True)
                print(f"[RTSP] Opening stream for camera_id {camera_id}: {rtsp_url}", flush=True)
                cap = safe_open_video_capture(rtsp_url, timeout_ms=None)
                entry["cap"] = cap
                
            if cap.isOpened():
                success, frame = cap.read()
                
        if not success:
            # Yield a blank frame or sleep to keep client connection alive
            time.sleep(0.1)
            continue
            
        if not is_detecting or not models_loaded:
            # Stream raw frame if detection is paused
            ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
            if ret:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            time.sleep(0.033)
            continue

        # Run inference (parameterized by DEVICE and NMS_IOU, exactly like legacy generate_frames)
        enhanced = enhance_frame(frame)
        
        results_helmet = model_helmet(enhanced, verbose=False, iou=NMS_IOU, device=DEVICE)
        results_vest = model_vest(enhanced, verbose=False, iou=NMS_IOU, device=DEVICE)
        results_chinstrap = model_chinstrap(enhanced, verbose=False, iou=NMS_IOU, device=DEVICE) if model_chinstrap else None

        enhanced, detected_helmet = draw_violations_only(enhanced, results_helmet)
        enhanced, detected_vest = draw_violations_only(enhanced, results_vest)
        enhanced, detected_chinstrap = draw_violations_only(enhanced, results_chinstrap, label_prefix="chinstrap_") if results_chinstrap else (enhanced, [])
        all_detected = detected_helmet + detected_vest + detected_chinstrap

        current_time = time.time()
        fps = 1 / (current_time - prev_time) if current_time != prev_time else 0
        prev_time = current_time

        now = datetime.datetime.now()
        
        # Save violations to DB
        record_frame_detections(all_detected, now, camera_id)

        # Update stats
        update_camera_stats(camera_id, all_detected, fps=round(fps, 1))

        ret, buffer = cv2.imencode('.jpg', enhanced, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        if ret:
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        
        time.sleep(0.01)


@app.route('/video_feed/<int:camera_id>')
def video_feed_camera(camera_id):
    token = request.args.get("token")
    if not token:
        token = request.cookies.get("session_token")
        
    if not token:
        return "Unauthorized", 401
        
    if token.startswith("Bearer "):
        token = token[7:]
        
    now = datetime.datetime.utcnow()
    session = DBSession.query.filter_by(token=token).first()
    if not session or session.expires_at < now:
        return "Unauthorized", 401
        
    user_role = session.role
    allowed_permissions = ROLE_PERMISSIONS.get(user_role, set())
    if "live_monitoring" not in allowed_permissions:
        return "Forbidden", 403
        
    # Query the camera row
    cam = Camera.query.get(camera_id)
    if not cam:
        return "Camera not found", 404
        
    # Check permissions: owner or admin
    if cam.owner_user_id != session.user_id and user_role != "admin":
        return "Forbidden", 403
        
    if cam.source_type != "rtsp":
        return "Invalid camera type for server streaming", 400
        
    return Response(
        stream_with_context(generate_camera_frames(camera_id, cam.rtsp_url)),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )


# ==== ROUTES ====

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json(force=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    user = User.query.filter_by(username=username).first()
    if not user or not check_password(password, user.password_hash):
        return jsonify({"success": False, "message": "Username atau password salah."}), 401

    token = str(uuid.uuid4())
    expiry = datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    session = DBSession(
        token=token,
        user_id=user.id,
        role=user.role,
        expires_at=expiry
    )
    db.session.add(session)
    db.session.commit()

    response = jsonify({
        "success": True,
        "token": token,
        "role": user.role,
        "username": user.username
    })
    # Set httpOnly cookie for session token, and standard cookie for user role.
    response.set_cookie(
        "session_token",
        token,
        httponly=True,
        samesite="Lax",
        max_age=86400,
        path="/"
    )
    response.set_cookie(
        "user_role",
        user.role,
        httponly=False,
        samesite="Lax",
        max_age=86400,
        path="/"
    )
    return response


@app.route('/api/logout', methods=['POST'])
def api_logout():
    token = request.headers.get("Authorization")
    if not token:
        token = request.cookies.get("session_token")
    if not token:
        token = request.args.get("token")

    if token:
        if token.startswith("Bearer "):
            token = token[7:]
        session = DBSession.query.filter_by(token=token).first()
        if session:
            db.session.delete(session)
            db.session.commit()
            
    response = jsonify({"success": True, "message": "Logout berhasil."})
    response.delete_cookie("session_token", path="/")
    response.delete_cookie("user_role", path="/")
    return response


@app.route('/api/session/verify')
@require_auth()
def api_session_verify():
    session = request.user_session
    user = User.query.get(session["user_id"])
    if not user:
        return jsonify({"error": "Unauthorized", "message": "User tidak ditemukan."}), 401
    return jsonify({
        "success": True,
        "token": session["token"],
        "role": session["role"],
        "username": user.username
    })


@app.route('/video_feed')
def video_feed():
    token = request.args.get("token")
    if not token:
        token = request.cookies.get("session_token")
        
    if not token:
        return "Unauthorized", 401
        
    if token.startswith("Bearer "):
        token = token[7:]
        
    now = datetime.datetime.utcnow()
    session = DBSession.query.filter_by(token=token).first()
    if not session or session.expires_at < now:
        return "Unauthorized", 401
        
    user_role = session.role
    allowed_permissions = ROLE_PERMISSIONS.get(user_role, set())
    if "live_monitoring" not in allowed_permissions:
        return "Forbidden", 403
        
    return Response(
        stream_with_context(generate_frames()),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )


# Legacy stats endpoint (kept for backward compatibility)
@app.route('/stats')
@require_auth(permission="live_monitoring")
def stats_legacy():
    return jsonify(latest_stats)


# ---- /api/status ----
@app.route('/api/status')
@require_auth(permission="live_monitoring")
def api_status():
    """
    Returns smoothed real-time metrics.
    Supports camera_id parameterization for per-camera stats.
    """
    camera_id = request.args.get("camera_id")
    if camera_id:
        try:
            cid = int(camera_id)
            with camera_stats_lock:
                if cid in camera_stats:
                    stats = camera_stats[cid]
                    return jsonify({
                        "fps": stats["fps"],
                        "total_detected": stats["total_detected"],
                        "violations": stats["violations"],
                        "network_latency_ms": None,
                        "model_load_pct": None,
                        "is_detecting": stats["is_detecting"],
                        "stream_active": stats["stream_active"],
                    })
        except Exception as e:
            print(f"[ERROR] Failed status fetch for camera_id {camera_id}: {e}", flush=True)

    # Fallback to legacy behavior
    stream_active = (camera.isOpened() if camera else False) or (not USE_RTSP)
    return jsonify({
        "fps": latest_stats["fps"],
        "total_detected": latest_stats["total_objects"],
        "violations": latest_stats["violations"],
        "network_latency_ms": None,
        "model_load_pct": None,
        "is_detecting": is_detecting,
        "stream_active": stream_active,
    })


# ---- /health (no auth — liveness probe for service monitors) ----
@app.route('/health')
def health_check():
    """Unauthenticated liveness endpoint. Returns 200 if the server process is up."""
    return jsonify({"status": "ok", "service": "apd-detection-backend"})


# ---- /api/detections/live ----
@app.route('/api/detections/live')
@require_auth(permission="live_monitoring")
def api_detections_live():
    """Returns the detection list from the most recently processed frame."""
    camera_id = request.args.get("camera_id")
    if camera_id:
        try:
            cid = int(camera_id)
            with camera_stats_lock:
                if cid in camera_stats:
                    stats = camera_stats[cid]
                    ts = stats["last_frame_time"]
                    detections = []
                    for d in stats.get("detections", []):
                        detections.append({
                            "label": d["label"],
                            "confidence": d["confidence"],
                            "is_violation": d.get("is_violation", d.get("violation", False)),
                            "timestamp": ts,
                        })
                    return jsonify(detections)
        except Exception as e:
            print(f"[ERROR] Failed live detections for camera_id {camera_id}: {e}", flush=True)

    # Fallback to legacy behavior
    ts = latest_stats.get("last_frame_time") or datetime.datetime.now().isoformat()
    detections = []
    for d in latest_stats.get("detections", []):
        detections.append({
            "label": d["label"],
            "confidence": d["confidence"],
            "is_violation": d.get("is_violation", d.get("violation", False)),
            "timestamp": ts,
        })
    return jsonify(detections)




# ---- /api/cameras ----

def enumerate_local_cameras():
    """
    Probe camera indices 0..4 to find all physically available local cameras.

    Validation is STRICT: a camera is only marked available=True if:
      1. cv2.VideoCapture(index) opens successfully (isOpened() == True), AND
      2. At least one frame can be read (cap.read() returns ret=True)

    Rationale: on macOS, cv2.VideoCapture(index).isOpened() can return True even
    when the app hasn't been granted camera permission yet — the capture opens but
    every cap.read() returns ret=False. Checking frame read ensures we only surface
    cameras the user can actually stream from right now.

    OS-specific backend selection (MUST NOT be removed):
      - Windows: cv2.CAP_DSHOW for DirectShow — required for stable USB webcam on Win
      - macOS/Linux: default backend (AVFoundation on macOS)
    Index numbers themselves are NOT OS-specific; only the backend flag differs.
    """
    results = []
    is_windows = platform.system() == "Windows"

    for idx in range(5):  # probe 0..4 — catches USB cameras at higher indices
        cap = None
        try:
            if is_windows:
                cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
            else:
                cap = cv2.VideoCapture(idx)

            if not cap.isOpened():
                # Device does not exist at this index on this OS
                continue

            # Attempt to read one frame — validates actual access (e.g. macOS permission)
            ret, _ = cap.read()

            if ret:
                hint = ""
                if idx == 0:
                    hint = " (Built-in / Default)"
                elif is_windows:
                    hint = " (USB/External)"
                results.append({
                    "type": "local",
                    "index": idx,
                    "label": f"Kamera Index {idx}{hint}",
                    "available": True,
                    "unavailable_reason": None,
                })
            else:
                # Opened but unreadable — likely a permission issue (macOS) or
                # device in use by another application
                results.append({
                    "type": "local",
                    "index": idx,
                    "label": f"Kamera Index {idx}",
                    "available": False,
                    "unavailable_reason": "Tidak dapat membaca frame — periksa izin kamera atau tutup aplikasi lain yang menggunakan kamera ini.",
                })

        except Exception as exc:
            results.append({
                "type": "local",
                "index": idx,
                "label": f"Kamera Index {idx}",
                "available": False,
                "unavailable_reason": f"Error saat probe: {str(exc)}",
            })
        finally:
            if cap is not None:
                cap.release()

    return results


@app.route('/api/cameras')
@require_auth(permission="camera_control")
def api_cameras():
    """
    Returns all detected camera sources grouped into two sections:
      - local_cameras[]: webcam/USB cameras enumerated in real-time (indices 0..4)
      - rtsp_cameras[]:  saved RTSP entries from current settings

    Enumeration is run fresh on every call — not cached — so newly plugged USB
    cameras or freshly granted permissions are picked up without a server restart.
    The frontend should show a refresh button that re-calls this endpoint.

    See enumerate_local_cameras() docstring for cross-platform notes.
    """
    local_cameras = enumerate_local_cameras()

    rtsp_cameras = []
    if RTSP_URL and RTSP_URL != "rtsp://username:password@camera_ip:port/stream":
        rtsp_cameras.append({
            "id": "rtsp_0",
            "label": "CCTV RTSP (tersimpan)",
            "rtsp_url": RTSP_URL,
            "last_test_status": None,  # populated after user explicitly tests
        })

    return jsonify({
        "local_cameras": local_cameras,
        "rtsp_cameras": rtsp_cameras,
        "os": platform.system(),
    })


# ---- /api/camera/settings ----
@app.route('/api/camera/settings', methods=['GET'])
@require_auth(permission="camera_control")
def api_camera_settings_get():
    # LEGACY - superseded by per-camera_id architecture, kept temporarily
    camera_id_arg = request.args.get("camera_id")
    if camera_id_arg:
        try:
            cid = int(camera_id_arg)
            cam = Camera.query.get(cid)
            if cam:
                # Check permission (owner or admin)
                user_id = request.user_session["user_id"]
                role = request.user_session["role"]
                if cam.owner_user_id == user_id or role == "admin":
                    # Determine active state from active_captures dict
                    is_active = False
                    with captures_dict_lock:
                        if cid in active_captures:
                            entry = active_captures[cid]
                            is_active = (entry["cap"] is not None and entry["cap"].isOpened())
                    
                    return jsonify({
                        "id": cam.id,
                        "label": cam.label,
                        "source_type": cam.source_type,
                        "use_rtsp": cam.source_type == "rtsp",
                        "rtsp_url": cam.rtsp_url,
                        "camera_index": cam.camera_index,
                        "webcam_device_id": cam.webcam_device_id,
                        "connection_status": "connected" if (cam.source_type == "webcam" or is_active) else "disconnected",
                        "selected_camera_id": f"rtsp_{cam.id}" if cam.source_type == "rtsp" else f"webcam_{cam.id}"
                    })
        except Exception as e:
            print(f"[ERROR] failed settings get: {e}", flush=True)

    # Fallback to legacy behavior
    connection_status = "connected" if (USE_RTSP and camera and camera.isOpened()) or (not USE_RTSP) else "disconnected"
    return jsonify({
        "use_rtsp": USE_RTSP,
        "rtsp_url": RTSP_URL,
        "camera_index": CAMERA_INDEX,
        "selected_camera_id": SELECTED_CAMERA_ID,
        "connection_status": connection_status,
        "webcam_device_id": WEBCAM_DEVICE_ID,
    })


@app.route('/api/camera/settings', methods=['POST'])
@require_auth(permission="camera_control")
def api_camera_settings_post():
    # LEGACY - superseded by per-camera_id architecture, kept temporarily
    global USE_RTSP, RTSP_URL, CAMERA_INDEX, SELECTED_CAMERA_ID, WEBCAM_DEVICE_ID, camera

    data = request.get_json(force=True) or {}
    camera_id = data.get("camera_id")
    new_use_rtsp = data.get("use_rtsp", USE_RTSP)
    new_rtsp_url = data.get("rtsp_url", RTSP_URL).strip()
    new_camera_index = int(data.get("camera_index", CAMERA_INDEX or 0))

    # === preview_only: session-only preview update for the "Test" button ===
    # Updates global streaming state so Live Monitoring reflects the tested camera
    # without touching the database or changing the user's saved camera configuration.
    if data.get("preview_only"):
        with camera_lock:
            if camera:
                camera.release()
                camera = None
            USE_RTSP = bool(new_use_rtsp)
            RTSP_URL = new_rtsp_url
            WEBCAM_DEVICE_ID = data.get("webcam_device_id", "")
            SELECTED_CAMERA_ID = "rtsp_preview" if USE_RTSP else "webcam_preview"
            if USE_RTSP:
                camera = open_camera(use_rtsp=True, rtsp_url=RTSP_URL)
        return jsonify({
            "success": True,
            "connection_status": "preview",
            "message": "Preview kamera diperbarui (sesi saja, tidak disimpan ke database).",
        })

    if camera_id is not None:
        try:
            cid = int(camera_id)
            cam = Camera.query.get(cid)
            if cam:
                # Check permission (owner or admin)
                user_id = request.user_session["user_id"]
                role = request.user_session["role"]
                if cam.owner_user_id != user_id and role != "admin":
                    return jsonify({"success": False, "message": "Forbidden"}), 403
                
                # If RTSP, let's open it and verify it
                if cam.source_type == "rtsp":
                    res = _test_rtsp_with_timeout(cam.rtsp_url)
                    if not res["success"]:
                        return jsonify({
                            "success": False,
                            "connection_status": res["connection_status"],
                            "message": f"Gagal terhubung ke RTSP: {res['message']}"
                        }), 422
                    
                    # Pre-heat the capture so it starts streaming faster
                    get_or_open_camera_capture(cam.id, cam.rtsp_url)
                
                # Update legacy globals so that legacy stats endpoint / frontend compatibility
                # won't break if they fetch status without camera_id.
                USE_RTSP = (cam.source_type == "rtsp")
                RTSP_URL = cam.rtsp_url or ""
                CAMERA_INDEX = cam.camera_index or 0
                SELECTED_CAMERA_ID = f"rtsp_{cam.id}" if USE_RTSP else f"webcam_{cam.id}"
                
                # Release legacy server-side webcam if any
                with camera_lock:
                    if camera:
                        camera.release()
                        camera = None
                
                return jsonify({
                    "success": True,
                    "connection_status": "connected",
                    "message": "Kamera berhasil diterapkan dan diaktifkan.",
                    "use_rtsp": USE_RTSP,
                    "rtsp_url": RTSP_URL,
                    "camera_index": CAMERA_INDEX,
                    "camera_id": cam.id
                })
        except Exception as e:
            print(f"[ERROR] Failed settings post for camera_id {camera_id}: {e}", flush=True)

    # Fallback to legacy behavior
    if new_use_rtsp:
        # Check RTSP connection first using test function with timeout
        res = _test_rtsp_with_timeout(new_rtsp_url)
        if not res["success"]:
            return jsonify({
                "success": False,
                "connection_status": res["connection_status"],
                "message": f"Gagal terhubung ke RTSP: {res['message']}"
            }), 422
    else:
        pass

    # If test passed, apply the source
    with camera_lock:
        if camera:
            camera.release()
            camera = None
            # macOS device release delay for the old live camera
            if not new_use_rtsp:
                time.sleep(0.5)
                
        USE_RTSP = new_use_rtsp
        RTSP_URL = new_rtsp_url
        CAMERA_INDEX = new_camera_index
        SELECTED_CAMERA_ID = "rtsp_0" if new_use_rtsp else f"webcam_{new_camera_index}"
        
        # NOTE: camera_index=0 sent here is a dummy value — browser-based webcam mode doesn't 
        # use server-side device index at all. This only exists to safely release any server-held 
        # webcam handle from the old architecture.
        success_open = False
        if new_use_rtsp:
            camera = open_camera()
            success_open = (camera is not None and camera.isOpened())
        else:
            # Browser-side capture is active. Server webcam is released and stays closed.
            success_open = True

    if not success_open:
        return jsonify({
            "success": False,
            "connection_status": "no_frame",
            "message": f"Kamera index {new_camera_index} terbuka tetapi tidak dapat membaca frame. Periksa izin kamera di System Settings atau tutup aplikasi lain yang sedang menggunakan kamera."
        }), 422

    connection_status = "connected" if (USE_RTSP and camera and camera.isOpened()) or (not USE_RTSP) else "disconnected"

    return jsonify({
        "success": True,
        "connection_status": connection_status,
        "message": "Kamera berhasil diterapkan dan aktif streaming.",
        "use_rtsp": USE_RTSP,
        "rtsp_url": RTSP_URL,
        "camera_index": CAMERA_INDEX,
    })



# ---- /api/camera/test ----

RTSP_CONNECT_TIMEOUT_MS = 6000   # 6 detik — cukup untuk CCTV lokal, tidak terlalu lama untuk UI
RTSP_READ_TIMEOUT_MS    = 4000   # timeout baca frame setelah koneksi terbuka


def _test_rtsp_with_timeout(rtsp_url: str) -> dict:
    """
    Test RTSP connection with explicit timeouts via OpenCV CAP_PROP_*_TIMEOUT_MSEC.
    Logs raw OpenCV/FFMPEG diagnostic details to terminal for operator debugging.
    """
    import shutil, subprocess as _sp
    print(f"[RTSP TEST] Testing URL: {rtsp_url}")

    # Quick ffprobe pre-check (distinguishes network failure from codec/auth failure)
    ffprobe_path = shutil.which("ffprobe")
    if ffprobe_path:
        try:
            probe = _sp.run(
                [ffprobe_path, "-v", "error", "-rtsp_transport", "tcp",
                 "-timeout", "5000000", rtsp_url],
                capture_output=True, text=True, timeout=8
            )
            if probe.returncode != 0:
                print(f"[RTSP TEST] ffprobe stderr: {probe.stderr.strip()}")
            else:
                print(f"[RTSP TEST] ffprobe succeeded")
        except Exception as e:
            print(f"[RTSP TEST] ffprobe pre-check error: {e}")
    else:
        print("[RTSP TEST] ffprobe not found — skipping pre-check")

    try:
        cap = safe_open_video_capture(rtsp_url, timeout_ms=5000)
        opened = cap.isOpened()
        print(f"[RTSP TEST] cap.isOpened() = {opened}")

        if not opened:
            # Try TCP transport as fallback (UDP can be silently blocked by firewalls)
            rtsp_tcp = rtsp_url.replace("rtsp://", "rtspt://", 1) if rtsp_url.startswith("rtsp://") else None
            if rtsp_tcp and rtsp_tcp != rtsp_url:
                print(f"[RTSP TEST] Retrying with TCP: {rtsp_tcp}")
                cap2 = safe_open_video_capture(rtsp_tcp, timeout_ms=5000)
                if cap2.isOpened():
                    ret2, _ = cap2.read()
                    cap2.release()
                    if ret2:
                        return {"success": True, "connection_status": "connected",
                                "message": "Koneksi RTSP berhasil via TCP transport. Frame berhasil dibaca."}
                cap2.release()
            return {
                "success": False, "connection_status": "disconnected",
                "message": "Koneksi RTSP gagal dibuka. Cek: (1) URL/IP/port benar, (2) Port tidak diblokir firewall jaringan, (3) Coba buka URL yang sama di VLC untuk konfirmasi network.",
            }

        ret, _ = cap.read()
        print(f"[RTSP TEST] cap.read() ret = {ret}")
        if not ret:
            return {
                "success": False, "connection_status": "no_frame",
                "message": "Koneksi terbuka tetapi tidak ada frame. Cek: (1) Kredensial RTSP (username/password), (2) Stream path/channel, (3) Codec H.264/H.265 didukung.",
            }

        return {"success": True, "connection_status": "connected",
                "message": "Koneksi RTSP berhasil dan frame berhasil dibaca."}
    except Exception as exc:
        import traceback
        traceback_str = traceback.format_exc()
        print(f"[RTSP TEST] Exception occurred: {exc}\n{traceback_str}", flush=True)
        try:
            with open("/tmp/apd-backend.log", "a") as log_file:
                log_file.write(f"\n[RTSP TEST] Exception occurred: {exc}\n{traceback_str}\n")
        except Exception as log_err:
            print(f"[RTSP TEST] Failed to write log: {log_err}", flush=True)
        return {
            "success": False,
            "connection_status": "error",
            "message": f"Exception saat test: {str(exc)}",
        }
    finally:
        try:
            cap.release()
        except Exception:
            pass


def record_frame_detections(all_detected, now, camera_id=None):
    """Logs violation events to database and updates aggregates for client-side uploads."""
    hour_key = now.strftime("%Y-%m-%d %H")
    day_key = now.strftime("%Y-%m-%d")

    # Resolve camera source label for reporting
    camera_source = "Client Webcam"
    if camera_id:
        try:
            cam = Camera.query.get(camera_id)
            if cam:
                camera_source = cam.label
        except Exception as e:
            print(f"[ERROR] Failed to query camera label for ID {camera_id}: {e}")

    with stats_lock:
        # Update hourly/daily stats
        if hour_key not in hourly_buckets:
            hourly_buckets[hour_key] = {"total": 0, "violations": 0}
        if day_key not in daily_summary:
            daily_summary[day_key] = {"total": 0, "violations": 0}

        hourly_buckets[hour_key]["total"] += len(all_detected)
        daily_summary[day_key]["total"] += len(all_detected)

        for d in all_detected:
            if d.get("violation", False):
                label = d["label"]
                
                # Cooldown check to deduplicate violations
                cooldown_key = (camera_source, label)
                current_time = time.time()
                last_logged = last_logged_violations.get(cooldown_key, 0.0)
                if current_time - last_logged < VIOLATION_COOLDOWN_SEC:
                    continue
                    
                last_logged_violations[cooldown_key] = current_time
                
                event_id = str(uuid.uuid4())
                timestamp_str = now.isoformat()
                
                violation_data = {
                    "id": event_id,
                    "timestamp": timestamp_str,
                    "label": label,
                    "confidence": d["confidence"],
                    "camera_source": camera_source
                }
                violation_queue.put(violation_data)
                
                hourly_buckets[hour_key]["violations"] += 1
                daily_summary[day_key]["violations"] += 1


@app.route('/api/detect-frame', methods=['POST'])
def api_detect_frame():
    """
    Receives a single JPEG frame from the browser client, runs 3 YOLO models,
    logs any violations to the DB, and returns structured detection objects.
    """
    if 'image' not in request.files:
        return jsonify({"success": False, "message": "File 'image' tidak ditemukan."}), 400

    file = request.files['image']
    camera_id = request.form.get('camera_id')
    if camera_id:
        try:
            camera_id = int(camera_id)
        except ValueError:
            camera_id = None

    # Read image
    img_bytes = file.read()
    nparr = np.frombuffer(img_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if frame is None:
        return jsonify({"success": False, "message": "Gagal mendekode gambar JPEG."}), 400

    if not is_detecting or not models_loaded:
        return jsonify({
            "success": True,
            "detections": [],
            "violations_count": 0
        })

    # Run inference sequence (same as generate_frames)
    # 1. Enhance frame (auto-contrast/brightness)
    enhanced = enhance_frame(frame)

    # 2. Helmet model
    res_helmet = model_helmet(enhanced, verbose=False, iou=NMS_IOU, device=DEVICE)
    _, det_helmet = draw_violations_only(enhanced, res_helmet, label_prefix="")

    # 3. Vest model
    res_vest = model_vest(enhanced, verbose=False, iou=NMS_IOU, device=DEVICE)
    _, det_vest = draw_violations_only(enhanced, res_vest, label_prefix="")

    # 4. Chinstrap model
    res_chinstrap = model_chinstrap(enhanced, verbose=False, iou=NMS_IOU, device=DEVICE) if model_chinstrap else None
    det_chinstrap = draw_violations_only(enhanced, res_chinstrap, label_prefix="chinstrap_")[1] if res_chinstrap else []

    # Combine detections
    all_detected = det_helmet + det_vest + det_chinstrap
    
    # Save violations to database
    now = datetime.datetime.now()
    record_frame_detections(all_detected, now, camera_id)

    violations_count = sum(1 for d in all_detected if d.get("violation", False))

    # Update camera-specific stats
    if camera_id:
        update_camera_stats(camera_id, all_detected, fps=0)

    # Update latest_stats for active UI polling
    with stats_lock:
        latest_stats["fps"] = 0  # Client-side FPS is not tracked server-side
        latest_stats["total_detected"] = len(all_detected)
        latest_stats["violations"] = violations_count
        latest_stats["last_frame_time"] = now.isoformat()

    return jsonify({
        "success": True,
        "detections": all_detected,
        "violations_count": violations_count
    })


@app.route('/api/camera/test', methods=['POST'])
@require_auth(permission="camera_control")
def api_camera_test():
    """
    Test RTSP or webcam connection without applying it permanently.
    Returns real connection result — never hardcoded success.
    """
    data = request.get_json(force=True) or {}
    use_rtsp = data.get("use_rtsp", False)
    rtsp_url = data.get("rtsp_url", "").strip()
    camera_index = int(data.get("camera_index", 0))

    start = time.time()

    try:
        if use_rtsp:
            if not rtsp_url:
                return jsonify({
                    "success": False,
                    "connection_status": "error",
                    "latency_ms": None,
                    "message": "Alamat RTSP tidak boleh kosong saat mode RTSP aktif.",
                })
            result = _test_rtsp_with_timeout(rtsp_url)
        else:
            # Local camera test — same strict validation as enumerate_local_cameras
            cap = None
            try:
                is_windows = platform.system() == "Windows"
                if is_windows:
                    cap = cv2.VideoCapture(camera_index, cv2.CAP_DSHOW)
                else:
                    cap = cv2.VideoCapture(camera_index)

                if not cap.isOpened():
                    result = {
                        "success": False,
                        "connection_status": "disconnected",
                        "message": f"Kamera index {camera_index} tidak ditemukan pada sistem ini.",
                    }
                else:
                    ret, _ = cap.read()
                    if ret:
                        result = {
                            "success": True,
                            "connection_status": "connected",
                            "message": f"Kamera index {camera_index} berhasil dibuka dan frame berhasil dibaca.",
                        }
                    else:
                        result = {
                            "success": False,
                            "connection_status": "no_frame",
                            "message": f"Kamera index {camera_index} terbuka tetapi tidak dapat membaca frame. Periksa izin kamera di System Settings atau tutup aplikasi lain yang sedang menggunakan kamera.",
                        }
            finally:
                if cap is not None:
                    cap.release()

    except Exception as exc:
        return jsonify({
            "success": False,
            "connection_status": "error",
            "latency_ms": None,
            "message": f"Exception saat test: {str(exc)}",
        })

    latency_ms = round((time.time() - start) * 1000)
    result["latency_ms"] = latency_ms
    return jsonify(result)


# ---- /api/my-cameras ----

@app.route('/api/my-cameras', methods=['GET'])
@require_auth(permission="camera_control")
def api_my_cameras_get():
    user_id = request.user_session["user_id"]
    role = request.user_session["role"]
    
    all_param = request.args.get("all", "false").lower() == "true"
    
    if all_param and role == "admin":
        cameras = db.session.query(Camera, User.username).join(User, Camera.owner_user_id == User.id).all()
        result = []
        for cam, username in cameras:
            result.append({
                "id": cam.id,
                "owner_user_id": cam.owner_user_id,
                "owner_username": username,
                "label": cam.label,
                "source_type": cam.source_type,
                "use_rtsp": cam.use_rtsp,
                "rtsp_url": cam.rtsp_url,
                "camera_index": cam.camera_index,
                "webcam_device_id": cam.webcam_device_id,
                "created_at": cam.created_at.isoformat() if cam.created_at else None,
                "updated_at": cam.updated_at.isoformat() if cam.updated_at else None,
            })
        return jsonify(result)
    else:
        cameras = Camera.query.filter_by(owner_user_id=user_id).all()
        result = []
        for cam in cameras:
            result.append({
                "id": cam.id,
                "owner_user_id": cam.owner_user_id,
                "label": cam.label,
                "source_type": cam.source_type,
                "use_rtsp": cam.use_rtsp,
                "rtsp_url": cam.rtsp_url,
                "camera_index": cam.camera_index,
                "webcam_device_id": cam.webcam_device_id,
                "created_at": cam.created_at.isoformat() if cam.created_at else None,
                "updated_at": cam.updated_at.isoformat() if cam.updated_at else None,
            })
        return jsonify(result)


@app.route('/api/my-cameras', methods=['POST'])
@require_auth(permission="camera_control")
def api_my_cameras_post():
    user_id = request.user_session["user_id"]
    data = request.get_json(force=True) or {}
    
    label = data.get("label", "").strip()
    if not label:
        return jsonify({"success": False, "message": "Label kamera tidak boleh kosong."}), 400
        
    source_type = data.get("source_type", "webcam").lower()
    if source_type not in ["webcam", "rtsp"]:
        return jsonify({"success": False, "message": "Tipe kamera tidak valid."}), 400
        
    if source_type == "rtsp":
        rtsp_url = data.get("rtsp_url", "").strip()
        if not rtsp_url:
            return jsonify({"success": False, "message": "URL RTSP tidak boleh kosong untuk tipe RTSP."}), 400

        # Strict RTSP connectivity check before persisting.
        # Kamera RTSP hanya disimpan jika koneksi berhasil — cegah URL tidak valid masuk DB.
        res = _test_rtsp_with_timeout(rtsp_url)
        if not res["success"]:
            return jsonify({
                "success": False,
                "connection_status": res["connection_status"],
                "message": (
                    f"Kamera tidak disimpan — koneksi RTSP gagal: {res['message']} "
                    "Pastikan URL benar dan kamera dapat dijangkau dari server."
                ),
            }), 422

        camera_index = None
        webcam_device_id = None
        use_rtsp = True
    else:
        rtsp_url = None
        # browser-side webcam does not use integer index, so it stays NULL in DB.
        camera_index = None
        webcam_device_id = data.get("webcam_device_id", "").strip() or None
        use_rtsp = False
        
    new_camera = Camera(
        owner_user_id=user_id,
        label=label,
        source_type=source_type,
        use_rtsp=use_rtsp,
        rtsp_url=rtsp_url,
        camera_index=camera_index,
        webcam_device_id=webcam_device_id
    )
    db.session.add(new_camera)
    db.session.commit()
    
    return jsonify({
        "success": True,
        "message": "Kamera berhasil ditambahkan.",
        "camera": {
            "id": new_camera.id,
            "owner_user_id": new_camera.owner_user_id,
            "label": new_camera.label,
            "source_type": new_camera.source_type,
            "use_rtsp": new_camera.use_rtsp,
            "rtsp_url": new_camera.rtsp_url,
            "camera_index": new_camera.camera_index,
            "webcam_device_id": new_camera.webcam_device_id,
        }
    }), 201


@app.route('/api/my-cameras/<int:id>', methods=['PUT'])
@require_auth(permission="camera_control")
def api_my_cameras_put(id):
    user_id = request.user_session["user_id"]
    role = request.user_session["role"]
    data = request.get_json(force=True) or {}
    
    cam = Camera.query.get(id)
    if not cam:
        return jsonify({"success": False, "message": "Kamera tidak ditemukan."}), 404
        
    if cam.owner_user_id != user_id and role != "admin":
        return jsonify({"success": False, "message": "Akses ditolak. Anda bukan pemilik kamera ini."}), 403

    # ---- Pre-flight RTSP test (before touching DB) ----
    # Resolved source type after this update (if source_type not in payload, keep current).
    resolved_source_type = data["source_type"].lower() if "source_type" in data else cam.source_type
    candidate_rtsp_url = data.get("rtsp_url", "").strip() if "rtsp_url" in data else (cam.rtsp_url or "")

    # Only test if: (a) type will be RTSP, (b) rtsp_url is in the payload and actually changed.
    rtsp_url_changing = (
        resolved_source_type == "rtsp"
        and "rtsp_url" in data
        and candidate_rtsp_url != (cam.rtsp_url or "")
    )
    if rtsp_url_changing and not data.get("force_save", False):
        if not candidate_rtsp_url:
            return jsonify({"success": False, "message": "URL RTSP tidak boleh kosong untuk tipe RTSP."}), 400
        res = _test_rtsp_with_timeout(candidate_rtsp_url)
        if not res["success"]:
            # confirmable=True → frontend dapat menawarkan dialog konfirmasi "Simpan tetap?"
            # Jika user setuju, frontend kirim ulang request dengan force_save=True.
            return jsonify({
                "success": False,
                "confirmable": True,
                "connection_status": res["connection_status"],
                "message": (
                    f"URL RTSP baru tidak dapat dijangkau: {res['message']} "
                    "Ingin tetap menyimpan URL ini?"
                ),
            }), 422

    # ---- Validate & apply fields ----
    if "label" in data:
        label = data.get("label", "").strip()
        if not label:
            return jsonify({"success": False, "message": "Label kamera tidak boleh kosong."}), 400
        cam.label = label
        
    if "source_type" in data:
        source_type = data["source_type"].lower()
        if source_type not in ["webcam", "rtsp"]:
            return jsonify({"success": False, "message": "Tipe kamera tidak valid."}), 400
        cam.source_type = source_type
        
    # Apply based on the resolved/updated source_type
    if cam.source_type == "rtsp":
        cam.use_rtsp = True
        if "rtsp_url" in data:
            rtsp_url = data["rtsp_url"].strip()
            if not rtsp_url:
                return jsonify({"success": False, "message": "URL RTSP tidak boleh kosong untuk tipe RTSP."}), 400
            cam.rtsp_url = rtsp_url
        cam.camera_index = None
        cam.webcam_device_id = None
    else:
        cam.use_rtsp = False
        cam.rtsp_url = None
        cam.camera_index = None  # kept NULL for browser-side webcams
        if "webcam_device_id" in data:
            cam.webcam_device_id = data["webcam_device_id"].strip() or None
            
    db.session.commit()
    
    return jsonify({
        "success": True,
        "message": "Kamera berhasil diperbarui.",
        "camera": {
            "id": cam.id,
            "owner_user_id": cam.owner_user_id,
            "label": cam.label,
            "source_type": cam.source_type,
            "use_rtsp": cam.use_rtsp,
            "rtsp_url": cam.rtsp_url,
            "camera_index": cam.camera_index,
            "webcam_device_id": cam.webcam_device_id,
        }
    })


@app.route('/api/my-cameras/<int:id>', methods=['DELETE'])
@require_auth(permission="camera_control")
def api_my_cameras_delete(id):
    user_id = request.user_session["user_id"]
    role = request.user_session["role"]
    
    cam = Camera.query.get(id)
    if not cam:
        return jsonify({"success": False, "message": "Kamera tidak ditemukan."}), 404
        
    if cam.owner_user_id != user_id and role != "admin":
        return jsonify({"success": False, "message": "Akses ditolak. Anda bukan pemilik kamera ini."}), 403
        
    db.session.delete(cam)
    db.session.commit()
    
    return jsonify({
        "success": True,
        "message": "Kamera berhasil dihapus."
    })


# ---- /api/violations ----
@app.route('/api/violations')
@require_auth(permission="compliance_review")
def api_violations():
    """Paginated violation history from PostgreSQL."""
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 20))
    filter_type = request.args.get("filter_type", "")   # label filter
    filter_date = request.args.get("filter_date", "")   # YYYY-MM-DD
    search = request.args.get("search", "").lower()

    # Query from database under app context
    with app.app_context():
        query = Violation.query
        
        # Apply filters
        if filter_type:
            query = query.filter_by(label=filter_type)
        if filter_date:
            query = query.filter(Violation.timestamp.like(f"{filter_date}%"))
        if search:
            query = query.filter(
                (Violation.label.ilike(f"%{search}%")) |
                (Violation.camera_source.ilike(f"%{search}%"))
            )
            
        # Get all matching violations sorted by timestamp descending
        violations_db = query.order_by(Violation.timestamp.desc()).all()
        
        items = []
        for v in violations_db:
            items.append({
                "id": v.id,
                "timestamp": v.timestamp,
                "label": v.label,
                "confidence": v.confidence,
                "camera_source": v.camera_source,
                "is_violation": v.is_violation
            })

    total_count = len(items)
    start = (page - 1) * per_page
    end = start + per_page
    page_items = items[start:end]

    return jsonify({
        "page": page,
        "per_page": per_page,
        "total_count": total_count,
        "total_pages": (total_count + per_page - 1) // per_page if total_count else 1,
        "data": page_items,
    })


# ---- /api/violations/export ----
@app.route('/api/violations/export')
@require_auth(permission="compliance_review")
def api_violations_export():
    """Export filtered violation history as CSV from database."""
    filter_type = request.args.get("filter_type", "")
    filter_date = request.args.get("filter_date", "")
    search = request.args.get("search", "").lower()

    with app.app_context():
        query = Violation.query
        if filter_type:
            query = query.filter_by(label=filter_type)
        if filter_date:
            query = query.filter(Violation.timestamp.like(f"{filter_date}%"))
        if search:
            query = query.filter(
                (Violation.label.ilike(f"%{search}%")) |
                (Violation.camera_source.ilike(f"%{search}%"))
            )
        violations_db = query.order_by(Violation.timestamp.desc()).all()
        
        items = []
        for v in violations_db:
            items.append({
                "id": v.id,
                "timestamp": v.timestamp,
                "label": v.label,
                "confidence": v.confidence,
                "camera_source": v.camera_source
            })

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["id", "timestamp", "label", "confidence", "camera_source"])
    writer.writeheader()
    for item in items:
        writer.writerow({
            "id": item.get("id", ""),
            "timestamp": item.get("timestamp", ""),
            "label": item.get("label", ""),
            "confidence": item.get("confidence", ""),
            "camera_source": item.get("camera_source", ""),
        })

    output.seek(0)
    filename = f"violations_{datetime.date.today().isoformat()}.csv"
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ---- /api/analytics/summary ----
@app.route('/api/analytics/summary')
@require_auth(permission="analytics")
def api_analytics_summary():
    today = datetime.date.today().isoformat()
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()

    with stats_lock:
        today_data = daily_summary.get(today, {"total": 0, "violations": 0})
        yesterday_data = daily_summary.get(yesterday, {"total": 0, "violations": 0})

    total_today = today_data["total"]
    violations_today = today_data["violations"]
    total_yesterday = yesterday_data["total"]
    violations_yesterday = yesterday_data["violations"]

    compliant_today = total_today - violations_today
    compliance_rate = round((compliant_today / total_today * 100), 1) if total_today > 0 else None

    def calc_trend(today_val, yesterday_val):
        if yesterday_val == 0:
            return None
        return round(((today_val - yesterday_val) / yesterday_val) * 100, 1)

    return jsonify({
        "total_detected_today": total_today,
        "total_violations_today": violations_today,
        "compliance_rate_pct": compliance_rate,
        "trend_total_vs_yesterday": calc_trend(total_today, total_yesterday),
        "trend_violations_vs_yesterday": calc_trend(violations_today, violations_yesterday),
        "trend_compliance_vs_yesterday": None,
    })


# ---- /api/analytics/hourly ----
@app.route('/api/analytics/hourly')
@require_auth(permission="analytics")
def api_analytics_hourly():
    """Returns per-hour activity for today."""
    today = datetime.date.today().isoformat()
    result = []
    for hour in range(24):
        key = f"{today} {hour:02d}"
        with stats_lock:
            bucket = hourly_buckets.get(key, {"total": 0, "violations": 0})
        result.append({
            "hour": hour,
            "label": f"{hour:02d}:00",
            "total_activity": bucket["total"],
            "violations": bucket["violations"],
        })
    return jsonify(result)


# ---- /api/analytics/by-type ----
@app.route('/api/analytics/by-type')
@require_auth(permission="analytics")
def api_analytics_by_type():
    """Returns violation count broken down by label type from database."""
    today = datetime.date.today().isoformat()
    counts = defaultdict(int)

    with app.app_context():
        today_violations = Violation.query.filter(Violation.timestamp.like(f"{today}%")).all()
        for v in today_violations:
            counts[v.label] += 1

    result = [{"type": label, "count": count} for label, count in counts.items()]
    result.sort(key=lambda x: x["count"], reverse=True)
    return jsonify(result)


# ---- /api/detection/toggle ----
@app.route('/api/detection/toggle', methods=['POST'])
@require_auth(permission="detection_control")
def api_detection_toggle():
    """Pause or resume YOLO inference. Camera stream keeps running."""
    global is_detecting
    data = request.get_json(force=True) or {}
    if "is_detecting" in data:
        is_detecting = bool(data["is_detecting"])
    else:
        is_detecting = not is_detecting
    return jsonify({"is_detecting": is_detecting})


# ==== ADMIN USER MANAGEMENT ENDPOINTS ====

@app.route('/api/users', methods=['GET'])
@require_auth(permission="user_management")
def api_users_get():
    users = User.query.order_by(User.id.asc()).all()
    results = []
    for u in users:
        results.append({
            "id": u.id,
            "username": u.username,
            "role": u.role,
            "created_at": u.created_at.isoformat()
        })
    return jsonify(results)


@app.route('/api/users', methods=['POST'])
@require_auth(permission="user_management")
def api_users_post():
    data = request.get_json(force=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    role = data.get("role", "").strip()

    if not username or not password or not role:
        return jsonify({"success": False, "message": "Username, password, dan role wajib diisi."}), 400

    if role not in ["admin", "user"]:
        return jsonify({"success": False, "message": "Role harus 'admin' atau 'user'."}), 400

    existing = User.query.filter_by(username=username).first()
    if existing:
        return jsonify({"success": False, "message": "Username sudah terdaftar."}), 400

    hashed_pw = hash_password(password)
    new_user = User(username=username, password_hash=hashed_pw, role=role)
    db.session.add(new_user)
    db.session.commit()

    return jsonify({"success": True, "message": "User berhasil dibuat."}), 201


@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@require_auth(permission="user_management")
def api_users_delete(user_id):
    current_user_id = request.user_session["user_id"]
    if current_user_id == user_id:
        return jsonify({"success": False, "message": "Anda tidak dapat menghapus akun Anda sendiri."}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"success": False, "message": "User tidak ditemukan."}), 404

    db.session.delete(user)
    db.session.commit()
    return jsonify({"success": True, "message": "User berhasil dihapus."})


@app.route('/api/users/<int:user_id>', methods=['PATCH'])
@require_auth(permission="user_management")
def api_users_patch(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({"success": False, "message": "User tidak ditemukan."}), 404

    data = request.get_json(force=True) or {}
    role = data.get("role")
    password = data.get("password")

    if role:
        if role not in ["admin", "user"]:
            return jsonify({"success": False, "message": "Role harus 'admin' atau 'user'."}), 400
        user.role = role

    if password:
        password = password.strip()
        if not password:
            return jsonify({"success": False, "message": "Password tidak boleh kosong."}), 400
        user.password_hash = hash_password(password)

    db.session.commit()
    return jsonify({"success": True, "message": "User berhasil diperbarui."})


def init_aggregates_from_db():
    """Load historical violation data into in-memory hourly/daily aggregates on startup."""
    print("Pre-populating hourly and daily violation aggregates from database...")
    try:
        with app.app_context():
            violations = Violation.query.all()
            for v in violations:
                try:
                    dt = datetime.datetime.fromisoformat(v.timestamp)
                    hour_key = dt.strftime("%Y-%m-%d %H")
                    day_key = dt.strftime("%Y-%m-%d")
                    
                    hourly_buckets[hour_key]["violations"] += 1
                    hourly_buckets[hour_key]["total"] = max(hourly_buckets[hour_key]["total"], hourly_buckets[hour_key]["violations"])
                    
                    daily_summary[day_key]["violations"] += 1
                    daily_summary[day_key]["total"] = max(daily_summary[day_key]["total"], daily_summary[day_key]["violations"])
                except Exception:
                    pass
            print(f"Pre-populated aggregates for {len(violations)} historical violations.")
    except Exception as e:
        print(f"[WARN] Failed to pre-populate aggregates: {e}")


if __name__ == '__main__':
    # Start the asynchronous database writer thread
    db_writer_thread = threading.Thread(target=db_writer_worker, daemon=True)
    db_writer_thread.start()

    init_aggregates_from_db()
    app.run(debug=True, host='0.0.0.0', port=5001, threaded=True, use_reloader=False)
