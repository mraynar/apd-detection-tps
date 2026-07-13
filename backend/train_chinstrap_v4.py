from ultralytics import YOLO

model = YOLO('yolov8n-obb.pt')

model.train(
    data='datasets/chinstrap/data.yaml',
    epochs=25,
    imgsz=640,
    batch=16,
    device='mps',
    project='runs/obb',
    name='train_chinstrap',
    # Augmentation to improve robustness on dark / angled CCTV footage:
    hsv_v=0.4,          # random brightness variation (helps low-light generalization)
    degrees=10.0,       # random rotation (mild — CCTV mounting angle is fairly fixed,
                        # unlike handheld/webcam shots, so keep this conservative)
    scale=0.5,          # random scale variation (helps distance/zoom invariance)
    perspective=0.0005, # slight perspective distortion (mimics overhead CCTV viewpoint)
)
