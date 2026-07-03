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
			class="mt-4 cursor-pointer rounded-full border-0 bg-accent px-5.5 py-2.5 text-bg disabled:cursor-default disabled:opacity-50"
		>
			Enable camera
		</button>
		{#if hud.status}
			<p class="mt-2 {hud.phase === 'error' ? 'text-error' : 'text-muted'}">
				{hud.status}
			</p>
		{/if}
	</div>
</div>
