<script lang="ts">
	import { onMount } from 'svelte';
	import { Tracker } from '$lib/tracking/tracker';
	import { downloadBlob } from '$lib/download';
	import { actionDefs, type ActionId } from '$lib/actions';
	import { hud } from '$lib/state.svelte';
	import StartOverlay from '$lib/components/StartOverlay.svelte';
	import HintBar from '$lib/components/HintBar.svelte';
	import TouchControls from '$lib/components/TouchControls.svelte';

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

	async function exportDrawing() {
		const blob = await tracker?.capture();
		if (blob) downloadBlob(blob, `drawer-${timestamp()}.png`);
	}

	function timestamp(): string {
		const d = new Date();
		const p = (n: number) => String(n).padStart(2, '0');
		return (
			`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-` +
			`${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
		);
	}

	const run: Record<ActionId, () => void> = {
		save: exportDrawing,
		clear
	};

	function onKey(e: KeyboardEvent) {
		const action = actionDefs.find((a) => a.key === e.key);
		if (action) run[action.id]();
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
{/if}

<HintBar />
<TouchControls onaction={(id) => run[id]()} />
