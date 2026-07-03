// Single source of truth for user actions: the keyboard shortcut, the hint-bar
// text, and the touch-button presentation all derive from this array. Handlers
// live in +page.svelte (they need the Tracker instance), keyed by `id`.

export type ActionId = 'save' | 'clear';

export type ActionDef = {
	id: ActionId;
	key: string; // keyboard shortcut
	label: string; // hint bar text
	aria: string; // touch button aria-label
	icon: string[]; // SVG path `d` strings (24x24 viewBox, stroked)
};

export const actionDefs: ActionDef[] = [
	{
		id: 'save',
		key: 's',
		label: 'save',
		aria: 'Save drawing',
		icon: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14']
	},
	{
		id: 'clear',
		key: 'c',
		label: 'clear',
		aria: 'Clear drawing',
		icon: ['M4 7h16', 'M10 4h4', 'M6 7l1 13h10l1-13', 'M10 11v6M14 11v6']
	}
];
