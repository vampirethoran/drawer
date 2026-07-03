// The bridge between the imperative tracking loop and the reactive DOM.
// tracker.ts mutates these fields each frame (fps throttled); Svelte components
// read them with `$hud.…` and re-render only the fixed HUD chrome.
import { DEFAULT_WIDTH } from './tracking/landmarks';

export type Phase = 'idle' | 'loading' | 'running' | 'error';

export const hud = $state({
	/** lifecycle of the camera + model pipeline */
	phase: 'idle' as Phase,
	/** human-readable status shown in the start overlay */
	status: '',
	/** smoothed frames-per-second, updated a few times a second */
	fps: 0,
	/** right hand is actively painting */
	drawing: false,
	/** current brush width in pixels (driven by the left-hand pinch) */
	brushWidth: DEFAULT_WIDTH
});

export const isRunning = () => hud.phase === 'running';
