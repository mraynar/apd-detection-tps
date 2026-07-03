
from flask import Flask, Response, render_template_string, jsonify
from ultralytics import YOLO
from collections import deque
import cv2
import platform
import time

app = Flask(__name__)

# ==== AI MODELS ====
model_helmet = YOLO('runs/obb/train-2/weights/best.pt')
model_vest = YOLO('runs/obb/runs/obb/train_vest/weights/best.pt')

# ==== VIDEO SOURCE SETTINGS ====
# USE_RTSP = False -> use laptop webcam (for testing)
# USE_RTSP = True  -> use CCTV camera via RTSP (for field deployment)
USE_RTSP = False
CAMERA_INDEX = 0
RTSP_URL = "rtsp://username:password@camera_ip:port/stream"

if USE_RTSP:
    camera = cv2.VideoCapture(RTSP_URL)
else:
    if platform.system() == "Windows":
        camera = cv2.VideoCapture(CAMERA_INDEX, cv2.CAP_DSHOW)
    else:
        camera = cv2.VideoCapture(CAMERA_INDEX)

# ==== DETECTION SETTINGS ====
# "helmet" and "head" thresholds are deliberately conservative (higher) because
# these two classes are the most prone to confusion in the current model.
# Lowering them increases false positives (bare head misread as helmet).
CONFIDENCE_THRESHOLDS = {
    "head": 0.5,
    "helmet": 0.65,
    "Safety Vest": 0.4,
    "NO-Safety Vest": 0.45,
}
DEFAULT_THRESHOLD = 0.5

NMS_IOU = 0.4
VIOLATION_CLASSES = {"head", "NO-Safety Vest"}

# Temporal smoothing: use the median violation count over recent frames
# to avoid the number flickering between values on a per-frame basis.
HISTORY_LENGTH = 5
detection_history = deque(maxlen=HISTORY_LENGTH)

latest_stats = {
    "total_objects": 0,
    "violations": 0,
    "detections": [],
    "fps": 0
}

def enhance_frame(frame):
    """
    Improve frame lighting and contrast before detection using CLAHE.
    Sharpening was tested and removed: it introduced visible artifacts on
    complex textures (hair, fabric edges) that made detection less reliable.
    """
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    enhanced = cv2.merge((l, a, b))
    enhanced = cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)
    return enhanced


def get_threshold(label):
    return CONFIDENCE_THRESHOLDS.get(label, DEFAULT_THRESHOLD)


def draw_violations_only(frame, results):
    """Draw bounding boxes ONLY for classes considered a violation."""
    names = results[0].names
    detected = []

    obb_data = results[0].obb
    if obb_data is None:
        return frame, detected

    for box in obb_data:
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        label = names[cls_id]

        if conf < get_threshold(label):
            continue

        is_violation = label in VIOLATION_CLASSES
        detected.append({
            "label": label,
            "confidence": round(conf, 2),
            "violation": is_violation
        })

        if is_violation:
            points = box.xyxyxyxy[0].cpu().numpy().astype(int)
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


def generate_frames():
    global latest_stats
    prev_time = time.time()

    while True:
        success, frame = camera.read()
        if not success:
            break

        frame = enhance_frame(frame)

        results_helmet = model_helmet(frame, verbose=False, iou=NMS_IOU)
        results_vest = model_vest(frame, verbose=False, iou=NMS_IOU)

        frame, detected_helmet = draw_violations_only(frame, results_helmet)
        frame, detected_vest = draw_violations_only(frame, results_vest)

        all_detected = detected_helmet + detected_vest
        raw_violation_count = sum(1 for d in all_detected if d["violation"])
        violation_count = smooth_violation_count(raw_violation_count)

        current_time = time.time()
        fps = 1 / (current_time - prev_time) if current_time != prev_time else 0
        prev_time = current_time

        latest_stats = {
            "total_objects": len(all_detected),
            "violations": violation_count,
            "detections": all_detected,
            "fps": round(fps, 1)
        }

        ret, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')


@app.route('/')
def index():
    return render_template_string('''
    <!DOCTYPE html>
    <html>
    <head>
        <title>PPE Detection System - TPS</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            body {
                background-color: #f0f2f5;
                padding: 20px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }
            h2 { font-weight: 700; color: #1a1a1a; }
            .video-box {
                border-radius: 10px;
                overflow: hidden;
                box-shadow: 0 4px 10px rgba(0,0,0,0.1);
                background: #000;
                min-height: 400px;
            }
            .stat-card {
                border-radius: 10px;
                box-shadow: 0 2px 6px rgba(0,0,0,0.1);
                margin-bottom: 15px;
                border: none;
            }
            .metric-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 0;
                border-bottom: 1px solid #eee;
            }
            .metric-row:last-child { border-bottom: none; }
            .metric-label { color: #555; font-size: 0.95rem; }
            .metric-value {
                font-size: 1rem;
                font-weight: 700;
                min-width: 44px;
                text-align: center;
                padding: 4px 10px;
                border-radius: 6px;
                color: white;
            }
            .metric-value.fps { background: #0d6efd; }
            .metric-value.total { background: #6c757d; }
            .metric-value.violations { background: #dc3545; }
            .detection-badge {
                font-size: 0.85rem;
                font-weight: 600;
                min-width: 44px;
                text-align: center;
                padding: 4px 10px;
                border-radius: 6px;
                color: white;
            }
            .detection-badge.violation { background: #dc3545; }
            .detection-badge.safe { background: #198754; }
            .detection-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 0;
                border-bottom: 1px solid #f0f0f0;
            }
            .detection-item:last-child { border-bottom: none; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2 class="mb-4">PPE Detection System - Terminal Petikemas Surabaya</h2>
            <div class="row">
                <div class="col-md-8">
                    <div class="video-box">
                        <img src="/video_feed" width="100%">
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card stat-card p-3">
                        <h5 class="mb-2">Real-time Status</h5>
                        <div class="metric-row">
                            <span class="metric-label">FPS</span>
                            <span class="metric-value fps" id="fps">-</span>
                        </div>
                        <div class="metric-row">
                            <span class="metric-label">Total Detected</span>
                            <span class="metric-value total" id="total">-</span>
                        </div>
                        <div class="metric-row">
                            <span class="metric-label">Violations</span>
                            <span class="metric-value violations" id="violations">-</span>
                        </div>
                    </div>
                    <div class="card stat-card p-3">
                        <h6 class="mb-2 text-muted">Detection Detail</h6>
                        <div id="stats">Loading...</div>
                    </div>
                </div>
            </div>
        </div>
        <script>
            setInterval(async () => {
                const res = await fetch('/stats');
                const data = await res.json();

                document.getElementById('fps').innerText = data.fps;
                document.getElementById('total').innerText = data.total_objects;
                document.getElementById('violations').innerText = data.violations;

                let html = '';
                if (data.detections.length === 0) {
                    html = '<p class="text-muted small mb-0">No objects detected</p>';
                } else {
                    data.detections.forEach(d => {
                        const badgeClass = d.violation ? 'violation' : 'safe';
                        html += `<div class="detection-item">
                            <span>${d.label}</span>
                            <span class="detection-badge ${badgeClass}">${(d.confidence*100).toFixed(0)}%</span>
                        </div>`;
                    });
                }
                document.getElementById('stats').innerHTML = html;
            }, 1000);
        </script>
    </body>
    </html>
    ''')


@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/stats')
def stats():
    return jsonify(latest_stats)


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
