# Hand Tracker

Webcam hand tracking that draws the 21-point hand skeleton.

## Run

```bash
./run.sh
```

That's it. On the first run it creates a virtual environment and installs the
dependencies (`opencv-python`, `mediapipe`, `numpy`); after that it just
launches the app.

Press `q` (with the video window focused) to quit.

### Windows

`run.sh` is a bash script, so on Windows run the steps manually:

```bash
python -m venv venv
venv\Scripts\activate
pip install opencv-python mediapipe numpy
python hand_tracker.py
```
