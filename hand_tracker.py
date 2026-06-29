import os
import sys
import time
import urllib.request

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

MODEL_FILENAME = "hand_landmarker.task"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)

# Standard MediaPipe 21-point hand skeleton: pairs of landmark indices to connect.
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),          # thumb
    (0, 5), (5, 6), (6, 7), (7, 8),          # index
    (5, 9), (9, 10), (10, 11), (11, 12),     # middle
    (9, 13), (13, 14), (14, 15), (15, 16),   # ring
    (13, 17), (17, 18), (18, 19), (19, 20),  # pinky
    (0, 17),                                 # base of palm
]

INDEX_TIP = 8  # the landmark you "paint" with

# Pose detection: a finger is "extended" when its tip is farther from the wrist
# than its PIP joint. This is rotation-invariant, so it works at any hand angle.
WRIST = 0
FINGER_TIPS = {"index": 8, "middle": 12, "ring": 16, "pinky": 20}
FINGER_PIPS = {"index": 6, "middle": 10, "ring": 14, "pinky": 18}

# Brush settings.
BRUSH_COLOR = (0, 0, 255)  # BGR red
BRUSH_SIZE = 6
SMOOTHING = 0.5  # EMA alpha: higher = snappier, lower = smoother


def _finger_extended(landmarks, tip, pip):
    """True if the fingertip is farther from the wrist than its PIP joint."""
    wx, wy = landmarks[WRIST].x, landmarks[WRIST].y
    d = lambda i: (landmarks[i].x - wx) ** 2 + (landmarks[i].y - wy) ** 2
    return d(tip) > d(pip)


def is_pointing(landmarks):
    """True when index is extended and middle/ring/pinky are curled."""
    index_up = _finger_extended(landmarks, 8, 6)
    others_down = not any(
        _finger_extended(landmarks, FINGER_TIPS[f], FINGER_PIPS[f])
        for f in ("middle", "ring", "pinky")
    )
    return index_up and others_down


def ensure_model():
    """Download the hand_landmarker model once if it isn't here yet."""
    if not os.path.exists(MODEL_FILENAME):
        print(f"Downloading model -> ./{MODEL_FILENAME} (first run only)...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_FILENAME)
        print("Model ready.")
    return MODEL_FILENAME


def make_landmarker(model_path):
    """Create a HandLandmarker configured for a live video stream."""
    base_options = mp_python.BaseOptions(model_asset_path=model_path)
    options = vision.HandLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.VIDEO,
        num_hands=1,
        min_hand_detection_confidence=0.6,
        min_tracking_confidence=0.6,
    )
    return vision.HandLandmarker.create_from_options(options)


def draw_hand(frame, landmarks, drawing=False):
    h, w = frame.shape[:2]
    # landmark coords are normalized 0..1 -> scale to pixels
    pts = [(int(lm.x * w), int(lm.y * h)) for lm in landmarks]
    for a, b in HAND_CONNECTIONS:
        cv2.line(frame, pts[a], pts[b], (0, 200, 255), 2)
    for (x, y) in pts:
        cv2.circle(frame, (x, y), 4, (255, 255, 255), -1)
    # highlight the index fingertip: green ring while drawing, red dot otherwise
    if drawing:
        cv2.circle(frame, pts[INDEX_TIP], 11, (0, 255, 0), 2)
    else:
        cv2.circle(frame, pts[INDEX_TIP], 9, (0, 0, 255), -1)


def main():
    model_path = ensure_model()
    landmarker = make_landmarker(model_path)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Could not open the webcam. Try index 1, and check camera "
              "permissions for your terminal / editor.")
        sys.exit(1)

    last_ts = -1
    prev_time = time.time()

    canvas = None          # persistent stroke layer, created on the first frame
    prev_pt = None         # last smoothed pixel point (None == pen up)

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("Dropped a frame, retrying...")
                continue

            frame = cv2.flip(frame, 1)                  # mirror like a selfie cam
            if canvas is None:
                canvas = np.zeros_like(frame)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # MediaPipe wants RGB
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

            ts = int(time.monotonic() * 1000)
            if ts <= last_ts:
                ts = last_ts + 1
            last_ts = ts

            result = landmarker.detect_for_video(mp_image, ts)

            drawing = False
            if result.hand_landmarks:
                hand = result.hand_landmarks[0]
                if is_pointing(hand):
                    drawing = True
                    h, w = frame.shape[:2]
                    raw = (int(hand[INDEX_TIP].x * w), int(hand[INDEX_TIP].y * h))
                    if prev_pt is None:
                        prev_pt = raw            # pen just went down: no line yet
                    else:
                        sm = (int(SMOOTHING * raw[0] + (1 - SMOOTHING) * prev_pt[0]),
                              int(SMOOTHING * raw[1] + (1 - SMOOTHING) * prev_pt[1]))
                        cv2.line(canvas, prev_pt, sm, BRUSH_COLOR, BRUSH_SIZE,
                                 cv2.LINE_AA)
                        prev_pt = sm
                else:
                    prev_pt = None               # pen up: break the stroke
                draw_hand(frame, hand, drawing)
                status = "DRAW" if drawing else "hover"
            else:
                prev_pt = None
                status = "show me a hand"

            # composite strokes opaquely over the video (video shows through gaps)
            mask = canvas.any(axis=2)
            frame[mask] = canvas[mask]

            now = time.time()
            fps = 1.0 / (now - prev_time) if now != prev_time else 0.0
            prev_time = now

            cv2.putText(frame, f"{status}  |  {fps:4.1f} fps  |  c clear  q quit",
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

            cv2.imshow("Hand Tracker - Draw", frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            if key == ord("c"):
                canvas[:] = 0
                prev_pt = None
    finally:
        landmarker.close()
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
