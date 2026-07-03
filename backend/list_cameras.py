"""
list_cameras.py — Headless camera enumeration diagnostic for APD Detection System.

Run this script to see which camera indices are available and readable on
the current machine/OS. Useful for troubleshooting before configuring
CAMERA_INDEX in app.py.

Usage:
    cd backend
    source ../venv/bin/activate   # macOS/Linux
    python list_cameras.py

    # Windows (in venv terminal):
    python list_cameras.py

Cross-platform notes:
  - macOS: uses default AVFoundation backend (no extra flag needed)
  - Windows: uses cv2.CAP_DSHOW (DirectShow) for better USB webcam compatibility
  - CAMERA_INDEX numbers refer to the OS's physical device enumeration order,
    which can differ across devices even with the same OS.

macOS Continuity Camera warning:
  If an iPhone is nearby and Continuity Camera is enabled, the iPhone may appear
  as an extra camera and shift the indices of other cameras. Disable it temporarily
  at System Settings > General > AirPlay & Handoff if you get unexpected results.
"""

import cv2
import platform
import sys


MAX_INDEX_TO_PROBE = 5  # probe 0..4; increase if you have many capture devices
IS_WINDOWS = platform.system() == "Windows"


def probe_camera(index: int) -> dict:
    """
    Open camera at the given index and attempt to read one frame.
    Returns a result dict with keys: index, opened, readable, error.
    """
    cap = None
    try:
        if IS_WINDOWS:
            cap = cv2.VideoCapture(index, cv2.CAP_DSHOW)
        else:
            cap = cv2.VideoCapture(index)

        if not cap.isOpened():
            return {"index": index, "opened": False, "readable": False, "error": None}

        ret, frame = cap.read()
        if not ret:
            return {
                "index": index,
                "opened": True,
                "readable": False,
                "error": "cap.isOpened()=True but cap.read() returned False — "
                         "likely a permission issue (macOS) or device in use by another app.",
            }

        h, w = frame.shape[:2] if frame is not None else (0, 0)
        return {
            "index": index,
            "opened": True,
            "readable": True,
            "resolution": f"{w}x{h}",
            "error": None,
        }

    except Exception as exc:
        return {"index": index, "opened": False, "readable": False, "error": str(exc)}
    finally:
        if cap is not None:
            cap.release()


def main():
    print(f"\n{'='*55}")
    print(f" Camera Enumeration Diagnostic — APD Detection System")
    print(f"{'='*55}")
    print(f" OS detected : {platform.system()} {platform.release()}")
    print(f" OpenCV backend : {'CAP_DSHOW (DirectShow)' if IS_WINDOWS else 'default (AVFoundation/V4L2)'}")
    print(f" Probing indices: 0 to {MAX_INDEX_TO_PROBE - 1}")
    print(f"{'='*55}\n")

    found_any = False
    for idx in range(MAX_INDEX_TO_PROBE):
        print(f"  Probing index {idx}...", end=" ", flush=True)
        result = probe_camera(idx)

        if not result["opened"]:
            print("✗ Not found (no device at this index)")
        elif not result["readable"]:
            print(f"⚠ Opened but unreadable")
            if result.get("error"):
                print(f"     Reason: {result['error']}")
        else:
            found_any = True
            res = result.get("resolution", "?")
            print(f"✓ Available  [{res}]  ← use CAMERA_INDEX = {idx}")

    print()
    if not found_any:
        print("  No readable cameras found.")
        print("  Possible causes:")
        print("  - No webcam connected")
        print("  - macOS camera permission not granted (grant in System Settings > Privacy > Camera)")
        print("  - Device in use by another app (close Zoom, FaceTime, etc.)")
        print("  - macOS Continuity Camera changing device order (disable in AirPlay & Handoff settings)")
        sys.exit(1)
    else:
        print("  Set CAMERA_INDEX in backend/app.py to one of the '✓ Available' indices above.")

    print(f"\n{'='*55}\n")


if __name__ == "__main__":
    main()
