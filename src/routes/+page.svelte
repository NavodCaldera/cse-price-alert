<script>
	import { base } from '$app/paths';
	import { quoteStore } from '$lib/quotes.svelte.js';
	import { ruleStore } from '$lib/rules.svelte.js';
	import { count, compact, percent, price, signed } from '$lib/format.js';

	let search = $state('');
	let sortKey = $state('symbol');
	let sortAsc = $state(true);

	// Symbols that already have at least one rule, so the table can mark them.
	const watched = $derived(new Set(ruleStore.rules.map((rule) => rule.symbol)));

	const visible = $derived.by(() => {
		const term = search.trim().toLowerCase();
		const rows = term
			? quoteStore.quotes.filter(
					(quote) =>
						quote.symbol.toLowerCase().includes(term) || quote.name.toLowerCase().includes(term)
				)
			: quoteStore.quotes;

		return [...rows].sort((a, b) => {
			const left = a[sortKey];
			const right = b[sortKey];
			const result =
				typeof left === 'string' ? left.localeCompare(right) : (left ?? 0) - (right ?? 0);
			return sortAsc ? result : -result;
		});
	});

	function sortBy(key) {
		if (sortKey === key) sortAsc = !sortAsc;
		else {
			sortKey = key;
			// Numbers are most useful biggest-first; names read better A-Z.
			sortAsc = key === 'symbol' || key === 'name';
		}
	}

	const columns = [
		{ key: 'symbol', label: 'Symbol', numeric: false },
		{ key: 'name', label: 'Company', numeric: false },
		{ key: 'price', label: 'Price', numeric: true },
		{ key: 'change', label: 'Change', numeric: true },
		{ key: 'changePct', label: '%', numeric: true },
		{ key: 'high', label: 'High', numeric: true },
		{ key: 'low', label: 'Low', numeric: true },
		{ key: 'volume', label: 'Volume', numeric: true },
		{ key: 'marketCap', label: 'Mkt cap', numeric: true }
	];
</script>

<div class="page">
	<h1>Market</h1>
	<p class="subtitle">
		Every company trading on the Colombo Stock Exchange, from the latest snapshot.
	</p>

	<div class="toolbar">
		<input
			type="search"
			bind:value={search}
			placeholder="Search by symbol or company name…"
			aria-label="Search companies"
		/>
		<span class="muted">{visible.length} of {quoteStore.quotes.length}</span>
	</div>

	{#if quoteStore.error}
		<div class="card empty">Could not load prices: {quoteStore.error}</div>
	{:else if quoteStore.loading && !quoteStore.loaded}
		<div class="card empty">Loading prices…</div>
	{:else if quoteStore.quotes.length === 0}
		<div class="card empty">
			No price data yet. Run <code>python scripts/fetch_prices.py</code> or wait for the scheduled
			GitHub Action.
		</div>
	{:else}
		<div class="card table-wrap">
			<table>
				<thead>
					<tr>
						{#each columns as column (column.key)}
							<th class:num={column.numeric}>
								<button class="sort" onclick={() => sortBy(column.key)}>
									{column.label}{#if sortKey === column.key}<span>{sortAsc ? '▲' : '▼'}</span>{/if}
								</button>
							</th>
						{/each}
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each visible as quote (quote.symbol)}
						<tr>
							<td>
								<strong>{quote.symbol}</strong>
								{#if watched.has(quote.symbol)}
									<span class="watch" title="You have a rule for this company">●</span>
								{/if}
							</td>
							<td class="company">{quote.name}</td>
							<td class="num"><strong>{price(quote.price)}</strong></td>
							<td class="num" class:up={quote.change > 0} class:down={quote.change < 0}>
								{signed(quote.change)}
							</td>
							<td class="num" class:up={quote.change > 0} class:down={quote.change < 0}>
								{percent(quote.changePct)}
							</td>
							<td class="num muted">{price(quote.high)}</td>
							<td class="num muted">{price(quote.low)}</td>
							<td class="num muted">{count(quote.volume)}</td>
							<td class="num muted">{compact(quote.marketCap)}</td>
							<td>
								<a class="add" href="{base}/rules/?symbol={quote.symbol}">+ Alert</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.toolbar input {
		max-width: 340px;
	}

	.toolbar .muted {
		font-size: 0.8rem;
	}

	.sort {
		border: none;
		background: none;
		padding: 0;
		font: inherit;
		color: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
		cursor: pointer;
	}

	.sort span {
		font-size: 0.6rem;
		margin-left: 0.15rem;
	}

	.company {
		white-space: normal;
		min-width: 180px;
		color: var(--muted);
	}

	.watch {
		color: var(--accent);
		font-size: 0.6rem;
		vertical-align: middle;
	}

	.add {
		text-decoration: none;
		font-size: 0.78rem;
		font-weight: 600;
		white-space: nowrap;
	}
</style>
