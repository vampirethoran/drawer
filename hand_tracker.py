import os
import sys
import time
import urllib.request
from dataclasses import dataclass, field

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision
from PIL import Image, ImageDraw, ImageFont

MODEL_FILENAME = "hand_landmarker.task"
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)

HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),          # thumb
    (0, 5), (5, 6), (6, 7), (7, 8),          # index
    (5, 9), (9, 10), (10, 11), (11, 12),     # middle
    (9, 13), (13, 14), (14, 15), (15, 16),   # ring
    (13, 17), (17, 18), (18, 19), (19, 20),  # pinky
    (0, 17),                                 # base of palm
]

WRIST = 0
THUMB_TIP = 4
INDEX_TIP = 8        # the landmark you "paint" with
MIDDLE_MCP = 9       # hand-scale reference for pinch normalization
FINGER_TIPS = {"index": 8, "middle": 12, "ring": 16, "pinky": 20}
FINGER_PIPS = {"index": 6, "middle": 10, "ring": 14, "pinky": 18}

# Set True if a given machine reports the left/right hands reversed. We feed
# MediaPipe the already-mirrored (selfie) frame, so labels normally line up
# with the user's real hands.
SWAP_HANDEDNESS = True

INK = (250, 250, 250)          # near-white primary text / strokes-on-skeleton
MUTED = (190, 190, 190)        # secondary text
ACCENT = (120, 110, 90)        # muted slate-blue accent (BGR)
ACCENT_BRIGHT = (255, 230, 180)  # brighter accent for active states
BRUSH_COLOR = (90, 80, 240)    # soft coral-red stroke (BGR)
SKELETON = (150, 140, 120)     # subdued skeleton lines
JOINT = (220, 220, 220)        # subtle joint dots
PANEL_FILL = (35, 30, 28)      # dark frosted panel base
PANEL_ALPHA = 0.45             # panel translucency

# Brush + smoothing
SMOOTHING = 0.2                # stroke EMA: higher = snappier
WIDTH_MIN, WIDTH_MAX = 3, 84   # brush width range (px)
WIDTH_SMOOTHING = 0.35         # width EMA: lower = calmer
DEFAULT_WIDTH = 8

# Pinch: normalized thumb-index distance gets clamped to this window before
# being mapped onto the width range. Tuned for a typical hand on a webcam.
PINCH_MIN, PINCH_MAX = 0.20, 1.30

FONT_CANDIDATES = [
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/Library/Fonts/Arial.ttf",
]


def clamp(lo, hi, v):
    return max(lo, min(hi, v))


def map_range(in_lo, in_hi, out_lo, out_hi, v):
    if in_hi == in_lo:
        return out_lo
    t = (v - in_lo) / (in_hi - in_lo)
    return out_lo + t * (out_hi - out_lo)


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


def classify_hands(result):
    """Map MediaPipe's parallel landmark/handedness lists to {'Right', 'Left'}.

    Returns a dict with both keys; missing hands are None. Honors
    SWAP_HANDEDNESS for machines that report the labels reversed.
    """
    hands = {"Right": None, "Left": None}
    if not result.hand_landmarks:
        return hands
    for landmarks, handedness in zip(result.hand_landmarks, result.handedness):
        label = handedness[0].category_name  # "Left" or "Right"
        if SWAP_HANDEDNESS:
            label = "Left" if label == "Right" else "Right"
        hands[label] = landmarks
    return hands


def pinch_amount(landmarks):
    """Thumb-index pinch as a 0..1 value, normalized by hand size.

    0 == pinched shut (thin brush), 1 == spread apart (thick brush).
    Normalizing by the wrist->middle-MCP distance makes it invariant to how
    close the hand is to the camera.
    """
    tx, ty = landmarks[THUMB_TIP].x, landmarks[THUMB_TIP].y
    ix, iy = landmarks[INDEX_TIP].x, landmarks[INDEX_TIP].y
    pinch = ((tx - ix) ** 2 + (ty - iy) ** 2) ** 0.5

    wx, wy = landmarks[WRIST].x, landmarks[WRIST].y
    mx, my = landmarks[MIDDLE_MCP].x, landmarks[MIDDLE_MCP].y
    scale = ((wx - mx) ** 2 + (wy - my) ** 2) ** 0.5
    if scale < 1e-6:
        return 0.0

    norm = pinch / scale
    return clamp(0.0, 1.0, map_range(PINCH_MIN, PINCH_MAX, 0.0, 1.0, norm))


def width_from_pinch(amount):
    """Map a 0..1 pinch amount to a brush width in pixels."""
    return map_range(0.0, 1.0, WIDTH_MIN, WIDTH_MAX, amount)

class TextRenderer:
    def __init__(self):
        self._cache = {}
        self._path = next((p for p in FONT_CANDIDATES if os.path.exists(p)), None)
        # Buffered calls for the current frame: (pos, text, size, color, anchor)
        self._calls = []

    def _font(self, size):
        if size not in self._cache:
            if self._path:
                try:
                    self._cache[size] = ImageFont.truetype(self._path, size)
                except OSError:
                    self._cache[size] = ImageFont.load_default()
            else:
                self._cache[size] = ImageFont.load_default()
        return self._cache[size]

    def add(self, pos, text, size=22, color=INK, anchor="la"):
        """Queue a text draw. color is BGR; anchor follows PIL's convention."""
        self._calls.append((pos, text, size, color, anchor))

    def flush(self, frame):
        """Render all queued text onto the BGR frame in one round-trip."""
        if not self._calls:
            return frame
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil = Image.fromarray(rgb)
        draw = ImageDraw.Draw(pil)
        for pos, text, size, color, anchor in self._calls:
            rgb_color = (color[2], color[1], color[0])
            draw.text(pos, text, font=self._font(size), fill=rgb_color, anchor=anchor)
        self._calls.clear()
        out = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
        frame[:] = out
        return frame

def frosted_panel(frame, x1, y1, x2, y2, radius=16, fill=PANEL_FILL, alpha=PANEL_ALPHA):
    """Blend a rounded, translucent panel onto the frame in place."""
    x1, y1 = max(0, x1), max(0, y1)
    x2 = min(frame.shape[1] - 1, x2)
    y2 = min(frame.shape[0] - 1, y2)
    if x2 <= x1 or y2 <= y1:
        return
    overlay = frame.copy()
    r = min(radius, (x2 - x1) // 2, (y2 - y1) // 2)
    # rounded rectangle = two crossing rects + four corner circles
    cv2.rectangle(overlay, (x1 + r, y1), (x2 - r, y2), fill, -1)
    cv2.rectangle(overlay, (x1, y1 + r), (x2, y2 - r), fill, -1)
    for cx, cy in ((x1 + r, y1 + r), (x2 - r, y1 + r),
                   (x1 + r, y2 - r), (x2 - r, y2 - r)):
        cv2.circle(overlay, (cx, cy), r, fill, -1)
    cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)


def draw_hand(frame, landmarks, active=False):
    """Thin, restrained skeleton overlay."""
    h, w = frame.shape[:2]
    pts = [(int(lm.x * w), int(lm.y * h)) for lm in landmarks]
    for a, b in HAND_CONNECTIONS:
        cv2.line(frame, pts[a], pts[b], SKELETON, 1, cv2.LINE_AA)
    for (x, y) in pts:
        cv2.circle(frame, (x, y), 2, JOINT, -1, cv2.LINE_AA)
    tip = pts[INDEX_TIP]
    if active:
        cv2.circle(frame, tip, 9, ACCENT_BRIGHT, 2, cv2.LINE_AA)
    else:
        cv2.circle(frame, tip, 5, ACCENT_BRIGHT, -1, cv2.LINE_AA)
    return pts


def draw_pinch_link(frame, landmarks):
    """Left hand: show only the thumb-tip <-> index-tip connection."""
    h, w = frame.shape[:2]
    thumb = (int(landmarks[THUMB_TIP].x * w), int(landmarks[THUMB_TIP].y * h))
    index = (int(landmarks[INDEX_TIP].x * w), int(landmarks[INDEX_TIP].y * h))
    cv2.line(frame, thumb, index, ACCENT_BRIGHT, 2, cv2.LINE_AA)
    cv2.circle(frame, thumb, 5, ACCENT_BRIGHT, -1, cv2.LINE_AA)
    cv2.circle(frame, index, 5, ACCENT_BRIGHT, -1, cv2.LINE_AA)
    return thumb, index


def draw_label_chip(frame, text_renderer, anchor_xy, text, active=False):
    """Small frosted chip with a label, anchored near a fingertip."""
    size = 20
    pad_x, pad_y = 12, 7
    tw = int(len(text) * size * 0.58) + pad_x * 2
    th = size + pad_y * 2
    x = clamp(0, frame.shape[1] - tw, anchor_xy[0] + 16)
    y = clamp(0, frame.shape[0] - th, anchor_xy[1] - th - 8)
    frosted_panel(frame, x, y, x + tw, y + th, radius=th // 2,
                  alpha=0.55 if active else 0.4)
    if active:
        cv2.circle(frame, (x + pad_x // 2 + 4, y + th // 2), 4, ACCENT_BRIGHT, -1,
                   cv2.LINE_AA)
    color = ACCENT_BRIGHT if active else MUTED
    text_renderer.add((x + pad_x + (10 if active else 0), y + th // 2), text,
                      size=size, color=color, anchor="lm")


def draw_width_meter(frame, text_renderer, anchor_xy, amount, width_px):
    """Slim width readout near the left hand: meter + px."""
    panel_w, panel_h = 150, 58
    x = clamp(0, frame.shape[1] - panel_w, anchor_xy[0] - panel_w - 16)
    y = clamp(0, frame.shape[0] - panel_h, anchor_xy[1] - panel_h // 2)
    frosted_panel(frame, x, y, x + panel_w, y + panel_h, radius=16)

    text_renderer.add((x + 16, y + 14), "BRUSH", size=14, color=MUTED, anchor="lm")
    text_renderer.add((x + panel_w - 16, y + 14), f"{int(round(width_px))} px",
                      size=16, color=INK, anchor="rm")

    # thin proportional meter
    bx1, bx2 = x + 16, x + panel_w - 16
    by = y + 40
    cv2.line(frame, (bx1, by), (bx2, by), (90, 85, 80), 3, cv2.LINE_AA)
    fill_x = int(bx1 + (bx2 - bx1) * clamp(0.0, 1.0, amount))
    cv2.line(frame, (bx1, by), (fill_x, by), ACCENT_BRIGHT, 3, cv2.LINE_AA)
    cv2.circle(frame, (fill_x, by), 5, ACCENT_BRIGHT, -1, cv2.LINE_AA)


def draw_hud(frame, text_renderer, fps):
    w = frame.shape[1]
    text_renderer.add((w - 30, 35), f"{fps:4.1f} fps   ·   c clear   ·   q quit",
                      size=14, color=MUTED, anchor="rm")


@dataclass
class AppState:
    canvas: np.ndarray = None      # persistent stroke layer
    prev_pt: tuple = None          # last smoothed pixel point (None == pen up)
    brush_width: float = DEFAULT_WIDTH
    last_ts: int = -1
    prev_time: float = field(default_factory=time.time)

def ensure_model():
    if not os.path.exists(MODEL_FILENAME):
        print(f"Downloading model -> ./{MODEL_FILENAME} (first run only)...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_FILENAME)
        print("Model ready.")
    return MODEL_FILENAME


def make_landmarker(model_path):
    base_options = mp_python.BaseOptions(model_asset_path=model_path)
    options = vision.HandLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.VIDEO,
        num_hands=2,
        min_hand_detection_confidence=0.6,
        min_tracking_confidence=0.6,
    )
    return vision.HandLandmarker.create_from_options(options)

def main():
    model_path = ensure_model()
    landmarker = make_landmarker(model_path)
    text = TextRenderer()

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Could not open the webcam. Try index 1, and check camera "
              "permissions for your terminal / editor.")
        sys.exit(1)

    state = AppState()

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("Dropped a frame, retrying...")
                continue

            frame = cv2.flip(frame, 1)                    # mirror like a selfie cam
            h, w = frame.shape[:2]
            if state.canvas is None:
                state.canvas = np.zeros_like(frame)

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # MediaPipe wants RGB
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

            ts = int(time.monotonic() * 1000)
            if ts <= state.last_ts:
                ts = state.last_ts + 1
            state.last_ts = ts

            result = landmarker.detect_for_video(mp_image, ts)
            hands = classify_hands(result)
            left, right = hands["Left"], hands["Right"]

            # --- dim the video so strokes and UI read clearly (clean look) ---
            frame = (frame * 0.55).astype(np.uint8)

            # --- left hand: live brush width via pinch (never draws) ----------
            if left is not None:
                amount = pinch_amount(left)
                target = width_from_pinch(amount)
                state.brush_width += WIDTH_SMOOTHING * (target - state.brush_width)
            else:
                amount = clamp(0.0, 1.0,
                               map_range(WIDTH_MIN, WIDTH_MAX, 0.0, 1.0,
                                         state.brush_width))

            # --- right hand: drawing -----------------------------------------
            drawing = False
            if right is not None and is_pointing(right):
                drawing = True
                raw = (int(right[INDEX_TIP].x * w), int(right[INDEX_TIP].y * h))
                if state.prev_pt is None:
                    state.prev_pt = raw                    # pen down: no line yet
                else:
                    sm = (int(SMOOTHING * raw[0] + (1 - SMOOTHING) * state.prev_pt[0]),
                          int(SMOOTHING * raw[1] + (1 - SMOOTHING) * state.prev_pt[1]))
                    cv2.line(state.canvas, state.prev_pt, sm, BRUSH_COLOR,
                             max(1, int(round(state.brush_width))), cv2.LINE_AA)
                    state.prev_pt = sm
            else:
                state.prev_pt = None                       # pen up: break stroke

            # --- composite strokes over the (dimmed) video -------------------
            mask = state.canvas.any(axis=2)
            frame[mask] = state.canvas[mask]

            # --- skeletons + per-hand UI -------------------------------------
            if left is not None:
                thumb, index = draw_pinch_link(frame, left)
                draw_width_meter(frame, text, index, amount, state.brush_width)
            if right is not None:
                pts = draw_hand(frame, right, active=drawing)
                draw_label_chip(frame, text, pts[INDEX_TIP], "draw", active=drawing)

            # --- HUD ----------------------------------------------------------
            now = time.time()
            fps = 1.0 / (now - state.prev_time) if now != state.prev_time else 0.0
            state.prev_time = now

            draw_hud(frame, text, fps)

            text.flush(frame)

            cv2.imshow("Drawer", frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            if key == ord("c"):
                state.canvas[:] = 0
                state.prev_pt = None
    finally:
        landmarker.close()
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
