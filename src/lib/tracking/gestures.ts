import {
	FINGER_PIPS,
	FINGER_TIPS,
	INDEX_TIP,
	MIDDLE_MCP,
	PINCH_MAX,
	PINCH_MIN,
	SWAP_HANDEDNESS,
	THUMB_TIP,
	WIDTH_MAX,
	WIDTH_MIN,
	WRIST,
	type Hand
} from './landmarks';
import type { Category } from '@mediapipe/tasks-vision';

export const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));

export const mapRange = (inLo: number, inHi: number, outLo: number, outHi: number, v: number) =>
	inHi === inLo ? outLo : outLo + ((v - inLo) / (inHi - inLo)) * (outHi - outLo);

export function fingerExtended(lm: Hand, tip: number, pip: number): boolean {
	const wx = lm[WRIST].x;
	const wy = lm[WRIST].y;
	const d = (i: number) => (lm[i].x - wx) ** 2 + (lm[i].y - wy) ** 2;
	return d(tip) > d(pip);
}

export function isPointing(lm: Hand): boolean {
	const indexUp = fingerExtended(lm, 8, 6);
	const othersDown = !(['middle', 'ring', 'pinky'] as const).some((f) =>
		fingerExtended(lm, FINGER_TIPS[f], FINGER_PIPS[f])
	);
	return indexUp && othersDown;
}

export interface Hands {
	Right: Hand | null;
	Left: Hand | null;
}

export function classifyHands(landmarksList: Hand[], handednessList: Category[][]): Hands {
	const hands: Hands = { Right: null, Left: null };
	for (let i = 0; i < landmarksList.length; i++) {
		let label = handednessList[i][0].categoryName; // "Left" | "Right"
		if (SWAP_HANDEDNESS) label = label === 'Right' ? 'Left' : 'Right';
		hands[label as 'Left' | 'Right'] = landmarksList[i];
	}
	return hands;
}

export function pinchAmount(lm: Hand): number {
	const tx = lm[THUMB_TIP].x;
	const ty = lm[THUMB_TIP].y;
	const ix = lm[INDEX_TIP].x;
	const iy = lm[INDEX_TIP].y;
	const pinch = Math.hypot(tx - ix, ty - iy);

	const wx = lm[WRIST].x;
	const wy = lm[WRIST].y;
	const mx = lm[MIDDLE_MCP].x;
	const my = lm[MIDDLE_MCP].y;
	const scale = Math.hypot(wx - mx, wy - my);
	if (scale < 1e-6) return 0;

	const norm = pinch / scale;
	return clamp(0, 1, mapRange(PINCH_MIN, PINCH_MAX, 0, 1, norm));
}

export const widthFromPinch = (amount: number) => mapRange(0, 1, WIDTH_MIN, WIDTH_MAX, amount);
