<script lang="ts">
	import { onMount } from 'svelte';
	import { Tracker } from '$lib/tracking/tracker';
	import { hud } from '$lib/state.svelte';
	import StartOverlay from '$lib/components/StartOverlay.svelte';
	import HintBar from '$lib/components/HintBar.svelte';
	import ControlPill from '$lib/components/ControlPill.svelte';

	let view: HTMLCanvasElement;
	let tracker: Tracker | null = null;

	onMount(() => {
		tracker = new Tracker(view);
		return () => tracker?.stop();
	});

	function enable() {
		tracker?.enable();
	}

	function clear() {
		tracker?.clear();
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'c') clear();
	}
</script>

<svelte:window on:keydown={onKey} />

<svelte:head>
	<title>Drawer</title>
</svelte:head>

<div class="fixed inset-0 grid place-items-center">
	<canvas bind:this={view} class="h-screen w-screen bg-black object-cover"></canvas>
</div>

{#if hud.phase !== 'running'}
	<StartOverlay onenable={enable} />
{:else}
	<HintBar />
	<div class="pointer-events-none fixed bottom-6 left-1/2 z-10 -translate-x-1/2">
		<ControlPill label="clear" onclick={clear} />
	</div>
{/if}
