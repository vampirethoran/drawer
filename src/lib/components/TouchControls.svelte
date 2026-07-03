<script lang="ts">
	import { isRunning } from '$lib/state.svelte';

	interface Props {
		onsave?: () => void;
		onclear?: () => void;
	}

	let { onsave, onclear }: Props = $props();

	const button =
		'pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-panel/45 text-muted backdrop-blur-sm transition-colors hover:bg-panel/65 hover:text-ink';
</script>

{#if isRunning()}
	<div class="fixed right-6 bottom-5 z-10 flex gap-3 md:hidden">
		<button type="button" aria-label="Save drawing" onclick={onsave} class={button}>
			<svg
				class="h-5 w-5"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M12 3v12" />
				<path d="m7 10 5 5 5-5" />
				<path d="M5 21h14" />
			</svg>
		</button>
		<button type="button" aria-label="Clear drawing" onclick={onclear} class={button}>
			<svg
				class="h-5 w-5"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M4 7h16" />
				<path d="M10 4h4" />
				<path d="M6 7l1 13h10l1-13" />
				<path d="M10 11v6M14 11v6" />
			</svg>
		</button>
	</div>
{/if}
