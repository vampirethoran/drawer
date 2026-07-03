// Canvas-side view of the shared palette. from routes/layout.css (@theme)

export interface Palette {
	ink: string;
	muted: string;
	accent: string;
	brush: string;
	skeleton: string;
	joint: string;
	panel: string;
	meter: string;
}

const TOKENS: Record<keyof Palette, string> = {
	ink: '--color-ink',
	muted: '--color-muted',
	accent: '--color-accent',
	brush: '--color-brush',
	skeleton: '--color-skeleton',
	joint: '--color-joint',
	panel: '--color-panel',
	meter: '--color-meter'
};

// Fallbacks mirror layout.css, used only if a variable can't be read.
export const palette: Palette = {
	ink: 'rgb(250 250 250)',
	muted: 'rgb(190 190 190)',
	accent: 'rgb(180 230 255)',
	brush: 'rgb(240 80 90)',
	skeleton: 'rgb(120 140 150)',
	joint: 'rgb(220 220 220)',
	panel: 'rgb(28 30 35)',
	meter: 'rgb(80 85 90)'
};

/** Populate `palette` from the CSS custom properties on the given root. */
export function resolvePalette(root: Element = document.documentElement): void {
	const cs = getComputedStyle(root);
	for (const key of Object.keys(TOKENS) as (keyof Palette)[]) {
		const value = cs.getPropertyValue(TOKENS[key]).trim();
		if (value) palette[key] = value;
	}
}

/** Apply an alpha to an `rgb(r g b)` / `rgb(r,g,b)` string → `rgb(r g b / a)`. */
export function withAlpha(color: string, alpha: number): string {
	const channels = color
		.replace(/^rgba?\(/, '')
		.replace(/\).*$/, '')
		.replace(/\/.*$/, '') // drop any existing alpha
		.replace(/,/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return `rgb(${channels} / ${alpha})`;
}
