// Canvas drawing — the *pixel* layer only. The hybrid UI split keeps the
// hand-anchored chrome (skeleton, "draw" chip, width meter) painted here where
// it can follow landmarks cheaply every frame; the fixed HUD lives in the DOM.
// Colors come from the shared palette (resolved from CSS tokens at startup).
import { clamp } from './gestures';
import { palette, withAlpha } from './palette';
import {
	FONT_STACK,
	HAND_CONNECTIONS,
	INDEX_TIP,
	PANEL_ALPHA,
	THUMB_TIP,
	type Hand
} from './landmarks';

type Ctx = CanvasRenderingContext2D;
type Point = [number, number];
type Anchor = readonly [number, number];

function frostedPanel(
	ctx: Ctx,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	radius = 16,
	alpha = PANEL_ALPHA
): void {
	if (x2 <= x1 || y2 <= y1) return;
	const r = Math.min(radius, (x2 - x1) / 2, (y2 - y1) / 2);
	ctx.save();
	ctx.fillStyle = withAlpha(palette.panel, alpha);
	ctx.beginPath();
	ctx.roundRect(x1, y1, x2 - x1, y2 - y1, r);
	ctx.fill();
	ctx.restore();
}

function setFont(ctx: Ctx, size: number): void {
	ctx.font = `${size}px ${FONT_STACK}`;
}

function text(
	ctx: Ctx,
	x: number,
	y: number,
	str: string,
	size = 22,
	color = palette.ink,
	anchor: CanvasTextAlign = 'left',
	baseline: CanvasTextBaseline = 'alphabetic'
): void {
	setFont(ctx, size);
	ctx.fillStyle = color;
	ctx.textAlign = anchor;
	ctx.textBaseline = baseline;
	ctx.fillText(str, x, y);
}

export function drawHand(ctx: Ctx, lm: Hand, w: number, h: number, active: boolean): Point[] {
	const pts: Point[] = lm.map((p) => [p.x * w, p.y * h]);
	ctx.lineWidth = 1;
	ctx.strokeStyle = palette.skeleton;
	for (const [a, b] of HAND_CONNECTIONS) {
		ctx.beginPath();
		ctx.moveTo(pts[a][0], pts[a][1]);
		ctx.lineTo(pts[b][0], pts[b][1]);
		ctx.stroke();
	}
	ctx.fillStyle = palette.joint;
	for (const [x, y] of pts) {
		ctx.beginPath();
		ctx.arc(x, y, 2, 0, Math.PI * 2);
		ctx.fill();
	}
	const [tx, ty] = pts[INDEX_TIP];
	ctx.beginPath();
	if (active) {
		ctx.strokeStyle = palette.accent;
		ctx.lineWidth = 2;
		ctx.arc(tx, ty, 9, 0, Math.PI * 2);
		ctx.stroke();
	} else {
		ctx.fillStyle = palette.accent;
		ctx.arc(tx, ty, 5, 0, Math.PI * 2);
		ctx.fill();
	}
	return pts;
}

export function drawPinchLink(
	ctx: Ctx,
	lm: Hand,
	w: number,
	h: number
): { thumb: Point; index: Point } {
	const thumb: Point = [lm[THUMB_TIP].x * w, lm[THUMB_TIP].y * h];
	const index: Point = [lm[INDEX_TIP].x * w, lm[INDEX_TIP].y * h];
	ctx.strokeStyle = palette.accent;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(thumb[0], thumb[1]);
	ctx.lineTo(index[0], index[1]);
	ctx.stroke();
	ctx.fillStyle = palette.accent;
	for (const [x, y] of [thumb, index]) {
		ctx.beginPath();
		ctx.arc(x, y, 5, 0, Math.PI * 2);
		ctx.fill();
	}
	return { thumb, index };
}

export function drawLabelChip(
	ctx: Ctx,
	anchor: Anchor,
	label: string,
	w: number,
	h: number,
	active: boolean
): void {
	const size = 12;
	const padX = 10;
	const padY = 6;
	const dotR = size * 0.33;
	const dotGap = active ? dotR * 2 + 6 : 0; // dot + spacing, only when active
	setFont(ctx, size);
	const textW = ctx.measureText(label).width;
	const tw = Math.round(padX * 2 + dotGap + textW);
	const th = size + padY * 2;
	const x = clamp(0, w - tw, anchor[0] + 16);
	const y = clamp(0, h - th, anchor[1] - th - 8);
	frostedPanel(ctx, x, y, x + tw, y + th, th / 2, active ? 0.55 : 0.4);
	if (active) {
		ctx.fillStyle = palette.accent;
		ctx.beginPath();
		ctx.arc(x + padX + dotR, y + th / 2, dotR, 0, Math.PI * 2);
		ctx.fill();
	}
	text(
		ctx,
		x + padX + dotGap,
		y + th / 2,
		label,
		size,
		active ? palette.accent : palette.muted,
		'left',
		'middle'
	);
}

export function drawWidthMeter(
	ctx: Ctx,
	anchor: Anchor,
	amount: number,
	widthPx: number,
	w: number,
	h: number
): void {
	const panelW = 150;
	const panelH = 58;
	const x = clamp(0, w - panelW, anchor[0] - panelW - 16);
	const y = clamp(0, h - panelH, anchor[1] - panelH / 2);
	frostedPanel(ctx, x, y, x + panelW, y + panelH, 16);

	text(ctx, x + 16, y + 14, 'BRUSH', 10, palette.muted, 'left', 'middle');
	text(
		ctx,
		x + panelW - 16,
		y + 14,
		`${Math.round(widthPx)} px`,
		11,
		palette.ink,
		'right',
		'middle'
	);

	const bx1 = x + 16;
	const bx2 = x + panelW - 16;
	const by = y + 40;
	ctx.lineCap = 'round';
	ctx.strokeStyle = palette.meter;
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(bx1, by);
	ctx.lineTo(bx2, by);
	ctx.stroke();
	const fillX = bx1 + (bx2 - bx1) * clamp(0, 1, amount);
	ctx.strokeStyle = palette.accent;
	ctx.beginPath();
	ctx.moveTo(bx1, by);
	ctx.lineTo(fillX, by);
	ctx.stroke();
	ctx.fillStyle = palette.accent;
	ctx.beginPath();
	ctx.arc(fillX, by, 5, 0, Math.PI * 2);
	ctx.fill();
	ctx.lineCap = 'butt';
}
