from ultralytics import YOLO

model = YOLO('yolov8n-obb.pt')

model.train(
    data='dataset/data.yaml',
    epochs=25,
    imgsz=640,
    batch=16,
    device='mps'
)
