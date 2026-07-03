<script lang="ts">
	import { hud } from '$lib/state.svelte';

	let { onenable }: { onenable: () => void } = $props();

	let busy = $derived(hud.phase === 'loading');
</script>

<div
	class="pointer-events-none fixed inset-0 z-20 grid place-items-center p-6 text-center [background:radial-gradient(transparent,rgba(0,0,0,0.4))]"
>
	<div class="pointer-events-auto max-w-130">
		<button
			type="button"
			onclick={onenable}
			disabled={busy}
			class="mt-4 cursor-pointer rounded-sm border border-accent px-5.5 py-2.5 text-accent transition-colors hover:bg-accent hover:text-bg disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-accent"
		>
			Enable camera
		</button>
	</div>
</div>
