// The imperative core: owns the canvases, camera stream, MediaPipe landmarker and the requestAnimationFrame loop
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { hud } from '$lib/state.svelte';
import {
	classifyHands,
	clamp,
	isPointing,
	mapRange,
	pinchAmount,
	widthFromPinch
} from './gestures';
import { drawHand, drawLabelChip, drawPinchLink, drawWidthMeter } from './render';
import { palette, resolvePalette } from './palette';
import {
	DEFAULT_WIDTH,
	FONT_STACK,
	INDEX_TIP,
	SMOOTHING,
	WIDTH_MAX,
	WIDTH_MIN,
	WIDTH_SMOOTHING
} from './landmarks';

const TASKS_VERSION = '0.10.35'; // keep in sync with the installed @mediapipe/tasks-vision
const WASM_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`;
const MODEL_CDN =
	'https://storage.googleapis.com/mediapipe-models/hand_landmarker/' +
	'hand_landmarker/float16/1/hand_landmarker.task';

const FPS_UPDATE_MS = 750; // throttle DOM fps writes so the readout doesn't strobe

async function createLandmarker(): Promise<HandLandmarker> {
	const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
	return HandLandmarker.createFromOptions(vision, {
		baseOptions: { modelAssetPath: MODEL_CDN, delegate: 'GPU' },
		runningMode: 'VIDEO',
		numHands: 2,
		minHandDetectionConfidence: 0.6,
		minTrackingConfidence: 0.6
	});
}

export class Tracker {
	private readonly view: HTMLCanvasElement;
	private readonly ctx: CanvasRenderingContext2D;

	// offscreen: clean mirrored frame fed to the detector + persistent stroke layer
	private readonly proc = document.createElement('canvas');
	private readonly procCtx: CanvasRenderingContext2D;
	private readonly strokes = document.createElement('canvas');
	private readonly strokeCtx: CanvasRenderingContext2D;

	private landmarker: HandLandmarker | null = null;
	private video: HTMLVideoElement | null = null;
	private stream: MediaStream | null = null;
	private raf = 0;

	// per-stroke smoothing state
	private prevPt: [number, number] | null = null; // last smoothed point, or null == pen up
	private brushWidth = DEFAULT_WIDTH;
	private lastTs = -1;
	private prevTime = 0;

	// fps throttling
	private fpsSample = 0;
	private lastFpsWrite = 0;

	constructor(view: HTMLCanvasElement) {
		this.view = view;
		this.ctx = mustCtx(view);
		this.procCtx = mustCtx(this.proc, { willReadFrequently: false });
		this.strokeCtx = mustCtx(this.strokes);
	}

	/** Load the model, open the camera, size the canvases and begin the loop. */
	async enable(): Promise<void> {
		resolvePalette(); // pull canvas colors from the shared CSS tokens
		hud.phase = 'loading';
		hud.status = 'Loading model…';
		try {
			this.landmarker = await createLandmarker();
		} catch (e) {
			this.fail('Couldn’t load the model', e);
			return;
		}

		hud.status = 'Requesting camera…';
		try {
			this.stream = await navigator.mediaDevices.getUserMedia({
				video: { width: { ideal: 1280 }, height: { ideal: 720 } },
				audio: false
			});
			const video = document.createElement('video');
			video.srcObject = this.stream;
			video.playsInline = true;
			await video.play();
			this.video = video;
		} catch (e) {
			this.fail('Camera access failed', e);
			return;
		}

		const w = this.video.videoWidth;
		const h = this.video.videoHeight;
		for (const c of [this.view, this.proc, this.strokes]) {
			c.width = w;
			c.height = h;
		}

		// make sure the canvas UI renders in Funnel Display from the first frame
		try {
			await document.fonts.load(`600 16px ${FONT_STACK}`);
		} catch {
			/* font is a nicety, not a blocker */
		}

		hud.status = '';
		hud.phase = 'running';
		this.prevTime = performance.now();
		this.lastFpsWrite = this.prevTime;
		this.raf = requestAnimationFrame(this.loop);
	}

	/** Clear the persistent stroke layer and lift the pen. */
	clear(): void {
		this.strokeCtx.clearRect(0, 0, this.strokes.width, this.strokes.height);
		this.prevPt = null;
	}

	/** Stop the loop, release the camera and free the model. */
	stop(): void {
		cancelAnimationFrame(this.raf);
		this.raf = 0;
		this.stream?.getTracks().forEach((t) => t.stop());
		this.stream = null;
		this.video = null;
		this.landmarker?.close();
		this.landmarker = null;
	}

	private fail(message: string, e: unknown): void {
		const detail = e instanceof Error ? e.message : String(e);
		hud.phase = 'error';
		hud.status = `${message}: ${detail}`;
	}

	private readonly loop = (): void => {
		const { video, landmarker } = this;
		if (!video || !landmarker) return;
		const w = this.view.width;
		const h = this.view.height;

		// mirror the frame (selfie view) onto the offscreen canvas, then detect.
		this.procCtx.save();
		this.procCtx.setTransform(-1, 0, 0, 1, w, 0);
		this.procCtx.drawImage(video, 0, 0, w, h);
		this.procCtx.restore();

		let ts = Math.round(performance.now());
		if (ts <= this.lastTs) ts = this.lastTs + 1;
		this.lastTs = ts;

		const result = landmarker.detectForVideo(this.proc, ts);
		const { Left: left, Right: right } = classifyHands(result.landmarks, result.handednesses);

		// dimmed video backdrop so strokes + UI read clearly
		this.ctx.drawImage(this.proc, 0, 0);
		this.ctx.fillStyle = 'rgba(0,0,0,0.45)';
		this.ctx.fillRect(0, 0, w, h);

		// left hand: live brush width via pinch (never draws)
		let amount = clamp(0, 1, mapRange(WIDTH_MIN, WIDTH_MAX, 0, 1, this.brushWidth));
		if (left) {
			amount = pinchAmount(left);
			this.brushWidth += WIDTH_SMOOTHING * (widthFromPinch(amount) - this.brushWidth);
		}

		// right hand: drawing
		let drawing = false;
		if (right && isPointing(right)) {
			drawing = true;
			const raw: [number, number] = [right[INDEX_TIP].x * w, right[INDEX_TIP].y * h];
			if (!this.prevPt) {
				this.prevPt = raw; // pen down: no line yet
			} else {
				const sm: [number, number] = [
					SMOOTHING * raw[0] + (1 - SMOOTHING) * this.prevPt[0],
					SMOOTHING * raw[1] + (1 - SMOOTHING) * this.prevPt[1]
				];
				this.strokeCtx.strokeStyle = palette.brush;
				this.strokeCtx.lineWidth = Math.max(1, Math.round(this.brushWidth));
				this.strokeCtx.lineCap = 'round';
				this.strokeCtx.lineJoin = 'round';
				this.strokeCtx.beginPath();
				this.strokeCtx.moveTo(this.prevPt[0], this.prevPt[1]);
				this.strokeCtx.lineTo(sm[0], sm[1]);
				this.strokeCtx.stroke();
				this.prevPt = sm;
			}
		} else {
			this.prevPt = null; // pen up: break stroke
		}

		// composite strokes over the dimmed video
		this.ctx.drawImage(this.strokes, 0, 0);

		// hand-anchored chrome stays on the canvas (hybrid split)
		if (left) {
			const { index } = drawPinchLink(this.ctx, left, w, h);
			drawWidthMeter(this.ctx, index, amount, this.brushWidth, w, h);
		}
		if (right) {
			const pts = drawHand(this.ctx, right, w, h, drawing);
			drawLabelChip(this.ctx, pts[INDEX_TIP], 'draw', w, h, drawing);
		}

		// publish facts to the DOM overlay
		const now = performance.now();
		this.fpsSample = now !== this.prevTime ? 1000 / (now - this.prevTime) : 0;
		this.prevTime = now;
		if (now - this.lastFpsWrite >= FPS_UPDATE_MS) {
			hud.fps = this.fpsSample;
			this.lastFpsWrite = now;
		}
		hud.drawing = drawing;
		hud.brushWidth = this.brushWidth;

		this.raf = requestAnimationFrame(this.loop);
	};
}

function mustCtx(
	canvas: HTMLCanvasElement,
	opts?: CanvasRenderingContext2DSettings
): CanvasRenderingContext2D {
	const ctx = canvas.getContext('2d', opts);
	if (!ctx) throw new Error('2D canvas context unavailable');
	return ctx;
}
