// Drawer — browser port of hand_tracker.py.
// Same hand_landmarker.task model, same logic, running entirely client-side
// via MediaPipe Tasks Vision (the JS twin of the Python Tasks API).
import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18";

const TASKS_VERSION = "0.10.18";

// --- landmark indices (identical to the Python) ----------------------------
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8; // the landmark you "paint" with
const MIDDLE_MCP = 9; // hand-scale reference for pinch normalization
const FINGER_TIPS = { index: 8, middle: 12, ring: 16, pinky: 20 };
const FINGER_PIPS = { index: 6, middle: 10, ring: 14, pinky: 18 };

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],          // index
  [5, 9], [9, 10], [10, 11], [11, 12],     // middle
  [9, 13], [13, 14], [14, 15], [15, 16],   // ring
  [13, 17], [17, 18], [18, 19], [19, 20],  // pinky
  [0, 17],                                 // base of palm
];

// MediaPipe reports handedness from its own point of view; we feed it the
// already-mirrored (selfie) frame, so flip the labels to match the user.
const SWAP_HANDEDNESS = true;

// --- palette (Python's BGR tuples converted to CSS RGB) --------------------
const INK = "rgb(250,250,250)";
const MUTED = "rgb(190,190,190)";
const ACCENT_BRIGHT = "rgb(180,230,255)";
const BRUSH_COLOR = "rgb(240,80,90)";
const SKELETON = "rgb(120,140,150)";
const JOINT = "rgb(220,220,220)";
const PANEL_FILL = "28,30,35";       // used with rgba()
const PANEL_ALPHA = 0.45;
const METER_BASE = "rgb(80,85,90)";

// --- brush + smoothing -----------------------------------------------------
const SMOOTHING = 0.2;        // stroke EMA: higher = snappier
const WIDTH_MIN = 3, WIDTH_MAX = 84;
const WIDTH_SMOOTHING = 0.35; // width EMA: lower = calmer
const DEFAULT_WIDTH = 8;
const PINCH_MIN = 0.2, PINCH_MAX = 1.3;

const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
const mapRange = (inLo, inHi, outLo, outHi, v) =>
  inHi === inLo ? outLo : outLo + ((v - inLo) / (inHi - inLo)) * (outHi - outLo);

function fingerExtended(lm, tip, pip) {
  const wx = lm[WRIST].x, wy = lm[WRIST].y;
  const d = (i) => (lm[i].x - wx) ** 2 + (lm[i].y - wy) ** 2;
  return d(tip) > d(pip);
}

function isPointing(lm) {
  const indexUp = fingerExtended(lm, 8, 6);
  const othersDown = !["middle", "ring", "pinky"].some((f) =>
    fingerExtended(lm, FINGER_TIPS[f], FINGER_PIPS[f])
  );
  return indexUp && othersDown;
}

function classifyHands(landmarksList, handednessList) {
  const hands = { Right: null, Left: null };
  for (let i = 0; i < landmarksList.length; i++) {
    let label = handednessList[i][0].categoryName; // "Left" | "Right"
    if (SWAP_HANDEDNESS) label = label === "Right" ? "Left" : "Right";
    hands[label] = landmarksList[i];
  }
  return hands;
}

function pinchAmount(lm) {
  const tx = lm[THUMB_TIP].x, ty = lm[THUMB_TIP].y;
  const ix = lm[INDEX_TIP].x, iy = lm[INDEX_TIP].y;
  const pinch = Math.hypot(tx - ix, ty - iy);

  const wx = lm[WRIST].x, wy = lm[WRIST].y;
  const mx = lm[MIDDLE_MCP].x, my = lm[MIDDLE_MCP].y;
  const scale = Math.hypot(wx - mx, wy - my);
  if (scale < 1e-6) return 0;

  const norm = pinch / scale;
  return clamp(0, 1, mapRange(PINCH_MIN, PINCH_MAX, 0, 1, norm));
}

const widthFromPinch = (amount) => mapRange(0, 1, WIDTH_MIN, WIDTH_MAX, amount);

// --- canvas drawing helpers ------------------------------------------------
function frostedPanel(ctx, x1, y1, x2, y2, radius = 16, alpha = PANEL_ALPHA) {
  if (x2 <= x1 || y2 <= y1) return;
  const r = Math.min(radius, (x2 - x1) / 2, (y2 - y1) / 2);
  ctx.save();
  ctx.fillStyle = `rgba(${PANEL_FILL},${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x1, y1, x2 - x1, y2 - y1, r);
  ctx.fill();
  ctx.restore();
}

function text(ctx, x, y, str, size = 22, color = INK, anchor = "left", baseline = "alphabetic") {
  ctx.font = `${size}px "Funnel Display", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = anchor;
  ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
}

function drawHand(ctx, lm, w, h, active) {
  const pts = lm.map((p) => [p.x * w, p.y * h]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = SKELETON;
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(pts[a][0], pts[a][1]);
    ctx.lineTo(pts[b][0], pts[b][1]);
    ctx.stroke();
  }
  ctx.fillStyle = JOINT;
  for (const [x, y] of pts) {
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  const [tx, ty] = pts[INDEX_TIP];
  ctx.beginPath();
  if (active) {
    ctx.strokeStyle = ACCENT_BRIGHT;
    ctx.lineWidth = 2;
    ctx.arc(tx, ty, 9, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = ACCENT_BRIGHT;
    ctx.arc(tx, ty, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  return pts;
}

function drawPinchLink(ctx, lm, w, h) {
  const thumb = [lm[THUMB_TIP].x * w, lm[THUMB_TIP].y * h];
  const index = [lm[INDEX_TIP].x * w, lm[INDEX_TIP].y * h];
  ctx.strokeStyle = ACCENT_BRIGHT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(thumb[0], thumb[1]);
  ctx.lineTo(index[0], index[1]);
  ctx.stroke();
  ctx.fillStyle = ACCENT_BRIGHT;
  for (const [x, y] of [thumb, index]) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  return { thumb, index };
}

function drawLabelChip(ctx, anchor, label, w, h, active) {
  const size = 16, padX = 12, padY = 7;
  const tw = Math.round(label.length * size * 0.58) + padX * 2;
  const th = size + padY * 2;
  const x = clamp(0, w - tw, anchor[0] + 16);
  const y = clamp(0, h - th, anchor[1] - th - 8);
  frostedPanel(ctx, x, y, x + tw, y + th, th / 2, active ? 0.55 : 0.4);
  if (active) {
    ctx.fillStyle = ACCENT_BRIGHT;
    ctx.beginPath();
    ctx.arc(x + padX / 2 + 4, y + th / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  text(ctx, x + padX + (active ? 10 : 0), y + th / 2, label, size,
       active ? ACCENT_BRIGHT : MUTED, "left", "middle");
}

function drawWidthMeter(ctx, anchor, amount, widthPx, w, h) {
  const panelW = 150, panelH = 58;
  const x = clamp(0, w - panelW, anchor[0] - panelW - 16);
  const y = clamp(0, h - panelH, anchor[1] - panelH / 2);
  frostedPanel(ctx, x, y, x + panelW, y + panelH, 16);

  text(ctx, x + 16, y + 14, "BRUSH", 12, MUTED, "left", "middle");
  text(ctx, x + panelW - 16, y + 14, `${Math.round(widthPx)} px`, 13, INK, "right", "middle");

  const bx1 = x + 16, bx2 = x + panelW - 16, by = y + 40;
  ctx.lineCap = "round";
  ctx.strokeStyle = METER_BASE;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(bx1, by); ctx.lineTo(bx2, by); ctx.stroke();
  const fillX = bx1 + (bx2 - bx1) * clamp(0, 1, amount);
  ctx.strokeStyle = ACCENT_BRIGHT;
  ctx.beginPath(); ctx.moveTo(bx1, by); ctx.lineTo(fillX, by); ctx.stroke();
  ctx.fillStyle = ACCENT_BRIGHT;
  ctx.beginPath(); ctx.arc(fillX, by, 5, 0, Math.PI * 2); ctx.fill();
  ctx.lineCap = "butt";
}

function drawHud(ctx, fps, w) {
  text(ctx, w - 30, 35, `${fps.toFixed(1)} fps   ·   c clear`, 12, MUTED, "right", "middle");
}

// --- app -------------------------------------------------------------------
const startBtn = document.getElementById("start");
const statusEl = document.getElementById("status");
const overlay = document.getElementById("overlay");
const view = document.getElementById("view");
const ctx = view.getContext("2d");

// offscreen: clean mirrored frame fed to the detector + persistent stroke layer
const proc = document.createElement("canvas");
const procCtx = proc.getContext("2d", { willReadFrequently: false });
const strokes = document.createElement("canvas");
const strokeCtx = strokes.getContext("2d");

const state = {
  prevPt: null,        // last smoothed pixel point ([x,y]) or null == pen up
  brushWidth: DEFAULT_WIDTH,
  lastTs: -1,
  prevTime: performance.now(),
};

let landmarker = null;
let video = null;

const MODEL_LOCAL = "../hand_landmarker.task";
const MODEL_CDN =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/" +
  "hand_landmarker/float16/1/hand_landmarker.task";

async function createLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`
  );
  const build = (modelAssetPath) =>
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
  try {
    // use the model already in this repo when it's served alongside the app
    return await build(MODEL_LOCAL);
  } catch {
    // otherwise pull the same float16 model the Python downloads
    return build(MODEL_CDN);
  }
}

async function start() {
  startBtn.disabled = true;
  statusEl.textContent = "Loading model…";
  try {
    landmarker = await createLandmarker();
  } catch (e) {
    statusEl.innerHTML = `<span class="err">Couldn't load the model: ${e.message}</span>`;
    startBtn.disabled = false;
    return;
  }

  statusEl.textContent = "Requesting camera…";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video = document.createElement("video");
    video.srcObject = stream;
    video.playsInline = true;
    await video.play();
  } catch (e) {
    statusEl.innerHTML = `<span class="err">Camera access failed: ${e.message}</span>`;
    startBtn.disabled = false;
    return;
  }

  const w = video.videoWidth, h = video.videoHeight;
  for (const c of [view, proc, strokes]) { c.width = w; c.height = h; }

  // make sure the canvas UI renders in Funnel Display from the first frame
  try { await document.fonts.load('600 16px "Funnel Display"'); } catch {}

  overlay.classList.add("hidden");
  requestAnimationFrame(loop);
}

function loop() {
  if (!video) return;
  const w = view.width, h = view.height;

  // mirror the frame (selfie view) onto the offscreen canvas, then detect.
  procCtx.save();
  procCtx.setTransform(-1, 0, 0, 1, w, 0);
  procCtx.drawImage(video, 0, 0, w, h);
  procCtx.restore();

  let ts = Math.round(performance.now());
  if (ts <= state.lastTs) ts = state.lastTs + 1;
  state.lastTs = ts;

  const result = landmarker.detectForVideo(proc, ts);
  const hands = classifyHands(result.landmarks, result.handednesses);
  const { Left: left, Right: right } = hands;

  // dimmed video backdrop so strokes + UI read clearly
  ctx.drawImage(proc, 0, 0);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, w, h);

  // left hand: live brush width via pinch (never draws)
  let amount = clamp(0, 1, mapRange(WIDTH_MIN, WIDTH_MAX, 0, 1, state.brushWidth));
  if (left) {
    amount = pinchAmount(left);
    state.brushWidth += WIDTH_SMOOTHING * (widthFromPinch(amount) - state.brushWidth);
  }

  // right hand: drawing
  let drawing = false;
  if (right && isPointing(right)) {
    drawing = true;
    const raw = [right[INDEX_TIP].x * w, right[INDEX_TIP].y * h];
    if (!state.prevPt) {
      state.prevPt = raw; // pen down: no line yet
    } else {
      const sm = [
        SMOOTHING * raw[0] + (1 - SMOOTHING) * state.prevPt[0],
        SMOOTHING * raw[1] + (1 - SMOOTHING) * state.prevPt[1],
      ];
      strokeCtx.strokeStyle = BRUSH_COLOR;
      strokeCtx.lineWidth = Math.max(1, Math.round(state.brushWidth));
      strokeCtx.lineCap = "round";
      strokeCtx.lineJoin = "round";
      strokeCtx.beginPath();
      strokeCtx.moveTo(state.prevPt[0], state.prevPt[1]);
      strokeCtx.lineTo(sm[0], sm[1]);
      strokeCtx.stroke();
      state.prevPt = sm;
    }
  } else {
    state.prevPt = null; // pen up: break stroke
  }

  // composite strokes over the dimmed video
  ctx.drawImage(strokes, 0, 0);

  // skeletons + per-hand UI
  if (left) {
    const { index } = drawPinchLink(ctx, left, w, h);
    drawWidthMeter(ctx, index, amount, state.brushWidth, w, h);
  }
  if (right) {
    const pts = drawHand(ctx, right, w, h, drawing);
    drawLabelChip(ctx, pts[INDEX_TIP], "draw", w, h, drawing);
  }

  const now = performance.now();
  const fps = now !== state.prevTime ? 1000 / (now - state.prevTime) : 0;
  state.prevTime = now;
  drawHud(ctx, fps, w);

  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (e) => {
  if (e.key === "c") {
    strokeCtx.clearRect(0, 0, strokes.width, strokes.height);
    state.prevPt = null;
  }
});

startBtn.addEventListener("click", start);
