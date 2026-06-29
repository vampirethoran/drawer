r"""
Air-Drawing Starter - Phase 0-2 (MediaPipe Tasks API, "Path B")
================================================================
Opens your webcam, detects one hand, and draws the 21-landmark skeleton.
This is the known-good base; gestures and painting (Phase 3+) build on top.

Run (mac/linux):
    ./run.sh        # creates the venv + installs deps on first run, then launches

Or manually:
    python -m venv venv
    source venv/bin/activate            # windows: venv\Scripts\activate
    pip install opencv-python mediapipe numpy
    python hand_tracker.py

The first run auto-downloads the model file (~7 MB) into this folder.
Press 'q' (with the video window focused) to quit.
"""

import os
import sys
import time
import urllib.request

import cv2
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

INDEX_TIP = 8  # the landmark you'll "paint" with in later phases


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


def draw_hand(frame, landmarks):
    """Draw the skeleton for one hand onto the (already-mirrored) frame."""
    h, w = frame.shape[:2]
    # landmark coords are normalized 0..1 -> scale to pixels
    pts = [(int(lm.x * w), int(lm.y * h)) for lm in landmarks]
    for a, b in HAND_CONNECTIONS:
        cv2.line(frame, pts[a], pts[b], (0, 200, 255), 2)
    for (x, y) in pts:
        cv2.circle(frame, (x, y), 4, (255, 255, 255), -1)
    # highlight the index fingertip - this becomes your brush tip later
    cv2.circle(frame, pts[INDEX_TIP], 9, (0, 0, 255), -1)


def main():
    model_path = ensure_model()
    landmarker = make_landmarker(model_path)

    cap = cv2.VideoCapture(0)
    # Windows tip: if the window is black or startup is slow, use:
    #   cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    # If nothing opens, try index 1 instead of 0.
    if not cap.isOpened():
        print("Could not open the webcam. Try index 1, and check camera "
              "permissions for your terminal / editor.")
        sys.exit(1)

    last_ts = -1          # detect_for_video needs strictly increasing timestamps
    prev_time = time.time()

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("Dropped a frame, retrying...")
                continue

            frame = cv2.flip(frame, 1)                  # mirror like a selfie cam
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # MediaPipe wants RGB
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

            ts = int(time.monotonic() * 1000)
            if ts <= last_ts:
                ts = last_ts + 1
            last_ts = ts

            result = landmarker.detect_for_video(mp_image, ts)

            if result.hand_landmarks:
                for hand in result.hand_landmarks:
                    draw_hand(frame, hand)
                status = "hand detected"
            else:
                status = "show me a hand"

            now = time.time()
            fps = 1.0 / (now - prev_time) if now != prev_time else 0.0
            prev_time = now

            cv2.putText(frame, f"{status}  |  {fps:4.1f} fps  |  press q to quit",
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

            cv2.imshow("Hand Tracker - Phase 0-2", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        landmarker.close()
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
