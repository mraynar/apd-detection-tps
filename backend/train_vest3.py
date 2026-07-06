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
    # LIGHT augmentation — v2 used aggressive settings (hsv_v=0.4, degrees=10,
    # scale=0.5, perspective=0.0005) and REGRESSED accuracy (mAP50 0.849 -> 0.802)
    # on this small dataset (~500 train images). Small datasets do not tolerate
    # heavy augmentation as well as large ones (compare: helmet dataset has
    # ~6000+ images and benefited from the same aggressive settings).
    # This version uses conservative augmentation as the next controlled experiment.
    hsv_v=0.25,         # reduced brightness variation
    degrees=5.0,        # reduced rotation range
    scale=0.3,          # reduced scale variation
    perspective=0.0,    # disabled — was likely adding noise without benefit on
                        # this small dataset
)
