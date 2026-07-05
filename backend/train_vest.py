from ultralytics import YOLO

model = YOLO('yolov8n-obb.pt')

model.train(
    data='VEST-SAFETY/data.yaml',
    epochs=25,
    imgsz=640,
    batch=16,
    device='mps',
    project='runs/obb',
    name='train_vest',
    # Augmented options to address vest under-detection / low accuracy:
    # hsv_v=0.4,          # Adjust brightness randomly by up to 40% (useful for low-light/night conditions)
    # degrees=15.0,       # Rotate images randomly by up to 15 degrees (handles camera angle variations)
    # scale=0.5,          # Scale images randomly by up to 50% (improves scale invariance / distance detection)
    # perspective=0.001,  # Apply slight perspective distortions (models overhead CCTV angles)
)
