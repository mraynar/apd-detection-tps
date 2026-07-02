from flask import Flask, Response, render_template_string, jsonify
from ultralytics import YOLO
import cv2

app = Flask(__name__)

model_helmet = YOLO('runs/obb/train-2/weights/best.pt')
model_vest = YOLO('runs/obb/runs/obb/train_vest/weights/best.pt')

# ==== PENGATURAN SUMBER VIDEO ====
USE_RTSP = False
CAMERA_INDEX = 0
RTSP_URL = "rtsp://username:password@ip_kamera:port/stream"

if USE_RTSP:
    camera = cv2.VideoCapture(RTSP_URL)
else:
    camera = cv2.VideoCapture(CAMERA_INDEX)

CONFIDENCE_THRESHOLD = 0.5

# Class yang dianggap PELANGGARAN (akan ditampilkan kotaknya)
VIOLATION_CLASSES = {"head", "NO-Safety Vest"}

latest_stats = {
    "total_objects": 0,
    "violations": 0,
    "detections": []
}

def draw_violations_only(frame, results):
    names = results[0].names
    detected = []

    obb_data = results[0].obb
    if obb_data is None:
        return frame, detected

    for box in obb_data:
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        label = names[cls_id]

        if conf < CONFIDENCE_THRESHOLD:
            continue

        detected.append({"label": label, "confidence": round(conf, 2), "violation": label in VIOLATION_CLASSES})

        # Cuma gambar kotak kalau ini class pelanggaran
        if label in VIOLATION_CLASSES:
            points = box.xyxyxyxy[0].cpu().numpy().astype(int)
            cv2.polylines(frame, [points], isClosed=True, color=(0, 0, 255), thickness=2)
            text_pos = (int(points[0][0]), int(points[0][1]) - 10)
            cv2.putText(frame, f"{label} {conf:.2f}", text_pos,
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

    return frame, detected

def generate_frames():
    global latest_stats
    while True:
        success, frame = camera.read()
        if not success:
            break

        results_helmet = model_helmet(frame, verbose=False)
        results_vest = model_vest(frame, verbose=False)

        frame, detected_helmet = draw_violations_only(frame, results_helmet)
        frame, detected_vest = draw_violations_only(frame, results_vest)

        all_detected = detected_helmet + detected_vest
        violation_count = sum(1 for d in all_detected if d["violation"])

        latest_stats = {
            "total_objects": len(all_detected),
            "violations": violation_count,
            "detections": all_detected
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
        <title>Sistem Deteksi APD - TPS</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
            body { background-color: #f0f2f5; padding: 20px; }
            .video-box { border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
            .stat-card { border-radius: 10px; box-shadow: 0 2px 6px rgba(0,0,0,0.1); margin-bottom: 15px; }
            .violation-badge { background: #dc3545; color: white; padding: 4px 10px; border-radius: 6px; }
            .safe-badge { background: #198754; color: white; padding: 4px 10px; border-radius: 6px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2 class="mb-4">Sistem Pendeteksi APD - Terminal Petikemas Surabaya</h2>
            <div class="row">
                <div class="col-md-8">
                    <div class="video-box">
                        <img src="/video_feed" width="100%">
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card stat-card p-3">
                        <h5>Status Deteksi</h5>
                        <div id="stats">Memuat...</div>
                    </div>
                </div>
            </div>
        </div>
        <script>
            setInterval(async () => {
                const res = await fetch('/stats');
                const data = await res.json();
                let html = `<p><b>Total Terdeteksi:</b> ${data.total_objects}</p>`;
                html += `<p><b>Pelanggaran:</b> <span class="violation-badge">${data.violations}</span></p>`;
                html += '<ul class="list-group">';
                data.detections.forEach(d => {
                    const badge = d.violation ? 'violation-badge' : 'safe-badge';
                    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
                        ${d.label} <span class="${badge}">${(d.confidence*100).toFixed(0)}%</span>
                    </li>`;
                });
                html += '</ul>';
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
