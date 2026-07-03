<script lang="ts">
	import { hud } from '$lib/state.svelte';
	import { fly } from 'svelte/transition';

	let message = $derived.by(() => {
		if (hud.status) return hud.status;
		if (hud.phase === 'idle') return 'Enable access to your camera to begin.';
		if (hud.phase === 'running')
			return hud.drawing ? 'Drawing…' : 'Right hand to draw. Left hand to control stroke.';
		return '';
	});
</script>

{#if message}
	<span
		class={hud.phase === 'error' ? 'text-error' : 'text-muted'}
		role="status"
		aria-live="polite"
		transition:fly={{ y: -6, duration: 200 }}
	>
		{message}
	</span>
{/if}
