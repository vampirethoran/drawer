<script lang="ts">
	import { hud, isRunning } from '$lib/state.svelte';
	import LiveHint from '$lib/components/LiveHint.svelte';
</script>

<div
	class="pointer-events-none fixed inset-x-6 top-4 z-10 flex items-start justify-between text-xs tracking-wide text-muted tabular-nums"
>
	<LiveHint />
	{#if isRunning()}
		<span class="ml-auto">{hud.fps.toFixed(1)} fps &nbsp;</span>
	{/if}
</div>
