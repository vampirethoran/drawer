# Drawer

Webcam hand tracking that lets you draw on screen — two-handed, with a clean
minimal UI. A [SvelteKit](https://svelte.dev/docs/kit) app that runs entirely
client-side via MediaPipe Tasks Vision, deployed on Cloudflare Workers. The
camera feed never leaves the device.

Live at **[draw.thoran.art](https://draw.thoran.art)**.

## Develop

```bash
pnpm install
pnpm dev            # http://localhost:5173
```

Open the URL, click **Enable camera**, and draw. The camera needs a secure
context, so use `http://localhost` (or HTTPS). The hand-landmark model and the
MediaPipe WASM runtime are fetched from a CDN — nothing to download by hand.

## Deploy

```bash
pnpm release        # builds, then wrangler deploy → draw.thoran.art
```

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
