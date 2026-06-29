#!/usr/bin/env bash
# Run the hand tracker. Creates the venv and installs deps on first run,
# then launches the app. One command does everything:  ./run.sh
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d venv ]; then
    echo "First run: creating venv and installing dependencies..."
    python3 -m venv venv
    venv/bin/pip install --upgrade pip
    venv/bin/pip install opencv-python mediapipe numpy
fi

exec venv/bin/python hand_tracker.py
