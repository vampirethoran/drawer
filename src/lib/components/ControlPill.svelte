<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label?: string;
		active?: boolean;
		onclick?: () => void;
		children?: Snippet;
	}

	let { label, active = false, onclick, children }: Props = $props();
</script>

<button
	type="button"
	{onclick}
	aria-pressed={active}
	class="pointer-events-auto inline-flex cursor-pointer items-center gap-2 rounded-full border-0 px-3 py-1.5 text-xs backdrop-blur-sm transition-colors
		{active ? 'bg-panel/55 text-accent' : 'bg-panel/45 text-muted hover:bg-panel/65 hover:text-ink'}"
>
	{#if active}
		<span class="h-1.5 w-1.5 rounded-full bg-accent"></span>
	{/if}
	{#if children}{@render children()}{:else}{label}{/if}
</button>
