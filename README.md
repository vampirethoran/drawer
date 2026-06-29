# Drawer

Webcam hand tracking that lets you draw on screen — two-handed, with a clean
minimal UI.

## Run

```bash
./run.sh
```

That's it. On the first run it creates a virtual environment and installs the
dependencies (`opencv-python`, `mediapipe`, `numpy`, `pillow`); after that it
just launches the app.

## Run in the browser

There's also a pure-browser version in [`web/`](web/) — same hand tracking,
same model, but it runs entirely client-side via MediaPipe Tasks Vision. The
camera feed never leaves the device.

```bash
web/serve.sh        # http://localhost:8000/web/
```

Open the URL, click **Enable camera**, and draw. It needs to be served over
`http://localhost` (or HTTPS) — the camera and ES modules won't work from a
`file://` page. Locally it reuses the `hand_landmarker.task` at the repo root;
when deployed without it (GitHub Pages, Netlify, Vercel) it falls back to
fetching the model from the CDN. Press **c** to clear.

## How it works

- **Right hand — the drawing hand.** Point with your **index finger** (other
  fingers curled) to draw. A **"draw"** chip appears by your fingertip and lights
  up while you're painting. Open or lower your index finger to lift the pen and
  reposition without leaving a line.
- **Left hand — brush width.** Pinch your **thumb and index finger** together for
  a **thin** brush; spread them apart for a **thick** one. The width updates live
  and is shown as a meter + a preview dot next to your left hand. The left hand
  never paints.

Both hands are tracked at once, so you can draw with the right and adjust width
with the left simultaneously.

- `c` — clear the canvas
- `q` — quit (with the video window focused)

If your left/right hands come out swapped on your machine, flip
`SWAP_HANDEDNESS = True` near the top of `hand_tracker.py`.

### Windows

`run.sh` is a bash script, so on Windows run the steps manually:

```bash
python -m venv venv
venv\Scripts\activate
pip install opencv-python mediapipe numpy pillow
python hand_tracker.py
```
