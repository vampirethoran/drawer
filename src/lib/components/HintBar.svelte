<script lang="ts">
	import { hud, isRunning } from '$lib/state.svelte';
	import LiveHint from '$lib/components/LiveHint.svelte';

	type Shortcut = { key: string; label: string };

	const shortcuts: Shortcut[] = [
		{ key: 's', label: 'save' },
		{ key: 'c', label: 'clear' }
	];
</script>

{#snippet shortcutHints(items: Shortcut[])}
	<div class="flex gap-3">
		{#each items as { key, label } (key)}
			<span class="flex items-center gap-1.5">
				<kbd class="rounded-sm border border-muted/40 px-1.5 py-0.5 uppercase">{key}</kbd>
				{label}
			</span>
		{/each}
	</div>
{/snippet}

<div
	class="pointer-events-none fixed inset-x-6 top-4 z-10 flex items-center text-xs tracking-wide text-muted tabular-nums"
>
	<div class="flex-1"><LiveHint /></div>
	<div class="flex flex-1 justify-center">
		{#if isRunning()}
			{@render shortcutHints(shortcuts)}
		{/if}
	</div>
	<div class="flex-1 text-right">
		{#if isRunning()}
			<span>{hud.fps.toFixed(1)} fps &nbsp;</span>
		{/if}
	</div>
</div>
