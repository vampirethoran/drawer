#!/usr/bin/env bash
# Serve the browser version of Drawer. getUserMedia + ES modules need a real
# origin (http://localhost counts as secure), so we can't just open the file.
set -euo pipefail
# Serve the repo root so the app (web/) and the local hand_landmarker.task
# (root) are both reachable; the app lives under /web/.
cd "$(dirname "$0")/.."

PORT="${1:-8000}"
echo "Drawer (web) -> http://localhost:${PORT}/web/"
exec python3 -m http.server "$PORT"
