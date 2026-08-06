<script>
	import { quoteStore } from '$lib/quotes.svelte.js';
	import { addDays, dateKey, price } from '$lib/format.js';

	let { onsave, initial = null, oncancel = null } = $props();

	const today = dateKey();

	let symbol = $state(initial?.symbol ?? '');
	let direction = $state(initial?.direction ?? 'below');
	let threshold = $state(initial?.threshold ?? '');
	let startDate = $state(initial?.startDate ?? today);
	let endDate = $state(initial?.endDate ?? addDays(30));
	let note = $state(initial?.note ?? '');
	let error = $state('');

	// The quote for whatever symbol is currently typed, used for the live hints below.
	const selected = $derived(quoteStore.bySymbol.get(symbol) ?? null);

	const periodPresets = [
		{ label: '1 week', days: 7 },
		{ label: '1 month', days: 30 },
		{ label: '3 months', days: 90 },
		{ label: '1 year', days: 365 }
	];

	function applyPreset(days) {
		startDate = today;
		endDate = addDays(days);
	}

	/** Set the threshold to a percentage away from the live price. */
	function applyOffset(percentOff) {
		if (!selected) return;
		const factor = direction === 'below' ? 1 - percentOff / 100 : 1 + percentOff / 100;
		threshold = Math.round(selected.price * factor * 100) / 100;
	}

	function submit(event) {
		event.preventDefault();
		error = '';

		const value = Number(threshold);
		if (!symbol) return (error = 'Pick a company.');
		if (!quoteStore.bySymbol.has(symbol))
			return (error = `"${symbol}" is not a symbol on the CSE list.`);
		if (!Number.isFinite(value) || value <= 0)
			return (error = 'Threshold must be a number above zero.');
		if (startDate && endDate && endDate < startDate)
			return (error = 'The end date cannot come before the start date.');

		onsave({
			symbol,
			name: quoteStore.bySymbol.get(symbol)?.name ?? symbol,
			threshold: value,
			direction,
			startDate,
			endDate,
			note: note.trim()
		});

		// Keep the dates and direction so adding several rules in a row is quick.
		if (!initial) {
			symbol = '';
			threshold = '';
			note = '';
		}
	}
</script>

<form onsubmit={submit} class="card">
	<h2>{initial ? 'Edit rule' : 'New threshold rule'}</h2>

	<div class="fields">
		<div class="field wide">
			<label for="symbol">Company</label>
			<input
				id="symbol"
				list="symbol-options"
				bind:value={symbol}
				placeholder="LFIN.N0000"
				autocomplete="off"
			/>
			<datalist id="symbol-options">
				{#each quoteStore.quotes as quote (quote.symbol)}
					<option value={quote.symbol}>{quote.name}</option>
				{/each}
			</datalist>
			<p class="hint">
				{#if selected}
					{selected.name} — trading at <strong>{price(selected.price)}</strong>
				{:else}
					Type a symbol or company name — {quoteStore.quotes.length} listed.
				{/if}
			</p>
		</div>

		<div class="field">
			<label for="direction">Alert me when price is</label>
			<select id="direction" bind:value={direction}>
				<option value="below">At or below threshold</option>
				<option value="above">At or above threshold</option>
			</select>
		</div>

		<div class="field">
			<label for="threshold">Threshold (LKR)</label>
			<input id="threshold" type="number" step="0.01" min="0" bind:value={threshold} placeholder="150.00" />
			{#if selected}
				<div class="chips">
					{#each [3, 5, 10] as off (off)}
						<button type="button" onclick={() => applyOffset(off)}>
							{direction === 'below' ? '−' : '+'}{off}%
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<fieldset class="period">
		<legend>Time period — the rule is only checked between these dates</legend>

		<div class="fields">
			<div class="field">
				<label for="start">Start date</label>
				<input id="start" type="date" bind:value={startDate} />
			</div>

			<div class="field">
				<label for="end">End date</label>
				<input id="end" type="date" bind:value={endDate} />
			</div>

			<div class="field wide">
				<label for="presets">Quick periods</label>
				<div class="chips" id="presets">
					{#each periodPresets as preset (preset.days)}
						<button type="button" onclick={() => applyPreset(preset.days)}>{preset.label}</button>
					{/each}
					<button type="button" onclick={() => (endDate = '')}>No end date</button>
				</div>
			</div>
		</div>
	</fieldset>

	<div class="field">
		<label for="note">Note (optional)</label>
		<input id="note" bind:value={note} placeholder="Buy target after Q3 results" />
	</div>

	{#if error}
		<p class="error">{error}</p>
	{/if}

	<div class="actions">
		<button type="submit" class="primary">{initial ? 'Save changes' : 'Add rule'}</button>
		{#if oncancel}
			<button type="button" onclick={oncancel}>Cancel</button>
		{/if}
	</div>
</form>

<style>
	.fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 0.9rem;
		margin-bottom: 1rem;
	}

	.field.wide {
		grid-column: 1 / -1;
	}

	.hint {
		font-size: 0.78rem;
		color: var(--muted);
		margin: 0.35rem 0 0;
	}

	.chips {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
		margin-top: 0.35rem;
	}

	.chips button {
		padding: 0.3rem 0.6rem;
		font-size: 0.78rem;
	}

	.period {
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.9rem;
		margin: 0 0 1rem;
	}

	legend {
		font-size: 0.78rem;
		color: var(--muted);
		padding: 0 0.4rem;
	}

	.period .fields {
		margin-bottom: 0;
	}

	.error {
		color: var(--down);
		font-size: 0.85rem;
		margin: 0 0 0.75rem;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
	}
</style>
