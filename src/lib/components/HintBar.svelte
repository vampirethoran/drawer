<script lang="ts">
	import { hud } from '$lib/state.svelte';
</script>

<div
	class="pointer-events-none fixed top-4 right-6 z-10 text-xs tracking-wide text-muted tabular-nums"
>
	{hud.fps.toFixed(1)} fps &nbsp;
</div>
