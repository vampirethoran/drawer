// Landmark indices, hand topology, palette and brush constants.
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

/** A single hand: 21 normalised landmarks in [0,1] image space. */
export type Hand = NormalizedLandmark[];

// --- landmark indices ------------------------------------------------------
export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_TIP = 8; // the landmark you "paint" with
export const MIDDLE_MCP = 9; // hand-scale reference for pinch normalization

export const FINGER_TIPS = { index: 8, middle: 12, ring: 16, pinky: 20 } as const;
export const FINGER_PIPS = { index: 6, middle: 10, ring: 14, pinky: 18 } as const;

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
	[0, 1],
	[1, 2],
	[2, 3],
	[3, 4], // thumb
	[0, 5],
	[5, 6],
	[6, 7],
	[7, 8], // index
	[5, 9],
	[9, 10],
	[10, 11],
	[11, 12], // middle
	[9, 13],
	[13, 14],
	[14, 15],
	[15, 16], // ring
	[13, 17],
	[17, 18],
	[18, 19],
	[19, 20], // pinky
	[0, 17] // base of palm
];

// MediaPipe reports handedness from its own point of view; we feed it the
// already-mirrored (selfie) frame, so flip the labels to match the user.
export const SWAP_HANDEDNESS = true;

// --- panel + brush styling -------------------------------------------------
// Colors live in routes/layout.css (@theme) and are read via
// $lib/tracking/palette; only non-color numerics remain here.
export const PANEL_ALPHA = 0.45; // default frosted-panel opacity

// --- brush + smoothing -----------------------------------------------------
export const SMOOTHING = 0.2; // stroke EMA: higher = snappier
export const WIDTH_MIN = 3;
export const WIDTH_MAX = 84;
export const WIDTH_SMOOTHING = 0.35; // width EMA: lower = calmer
export const DEFAULT_WIDTH = 8;
export const PINCH_MIN = 0.2;
export const PINCH_MAX = 1.3;

export const FONT_STACK =
	'"Funnel Display", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
