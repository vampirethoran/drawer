<script lang="ts">
	import { isRunning } from '$lib/state.svelte';
	import { actionDefs, type ActionId } from '$lib/actions';

	interface Props {
		onaction?: (id: ActionId) => void;
	}

	let { onaction }: Props = $props();

	const button =
		'pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-panel/45 text-muted backdrop-blur-sm transition-colors hover:bg-panel/65 hover:text-ink';
</script>

{#if isRunning()}
	<div class="fixed right-6 bottom-5 z-10 flex gap-3 md:hidden">
		{#each actionDefs as action (action.id)}
			<button
				type="button"
				aria-label={action.aria}
				onclick={() => onaction?.(action.id)}
				class={button}
			>
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
					{#each action.icon as d (d)}
						<path {d} />
					{/each}
				</svg>
			</button>
		{/each}
	</div>
{/if}
