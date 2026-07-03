<script lang="ts">
	import { hud } from '$lib/state.svelte';
	import { fly } from 'svelte/transition';
</script>

{#if hud.status}
	<span
		class="text-xs tracking-wide {hud.phase === 'error' ? 'text-error' : 'text-muted'}"
		role="status"
		aria-live="polite"
		transition:fly={{ y: -6, duration: 200 }}
	>
		{hud.status}
	</span>
{/if}
