import cv2
import time

INDEX_TO_TEST = 0

cap = cv2.VideoCapture(INDEX_TO_TEST)
time.sleep(1)  # kasih waktu kamera siap-siap

if not cap.isOpened():
    print("Kamera tidak bisa dibuka")
else:
    print(f"Menampilkan kamera index {INDEX_TO_TEST}. Tekan 'q' untuk keluar.")
    frame_count = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            print(f"Gagal baca frame ke-{frame_count}")
            frame_count += 1
            if frame_count > 10:
                print("Terlalu banyak gagal, keluar.")
                break
            continue
        cv2.imshow(f'Kamera Index {INDEX_TO_TEST}', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
