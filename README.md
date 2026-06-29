# Hand Tracker

Webcam hand tracking that lets you draw on screen with your index finger.

## Run

```bash
./run.sh
```

That's it. On the first run it creates a virtual environment and installs the
dependencies (`opencv-python`, `mediapipe`, `numpy`); after that it just
launches the app.

## Drawing

Point with your **index finger** (other fingers curled) to draw. The fingertip
marker turns into a green ring while drawing. Open or lower your index finger to
lift the pen and reposition without leaving a line.

- `c` — clear the canvas
- `q` — quit (with the video window focused)

### Windows

`run.sh` is a bash script, so on Windows run the steps manually:

```bash
python -m venv venv
venv\Scripts\activate
pip install opencv-python mediapipe numpy
python hand_tracker.py
```
