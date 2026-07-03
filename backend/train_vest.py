from ultralytics import YOLO

model = YOLO('yolov8n-obb.pt')

model.train(
    data='VEST-SAFETY/data.yaml',
    epochs=25,
    imgsz=640,
    batch=16,
    device='mps',
    project='runs/obb',
    name='train_vest'
)
