<script>
	import { base } from '$app/paths';
	import { quoteStore } from '$lib/quotes.svelte.js';
	import { ruleStore } from '$lib/rules.svelte.js';
	import { evaluate, sortByUrgency } from '$lib/evaluate.js';
	import { percent, price, prettyDate, signed } from '$lib/format.js';

	const rows = $derived(sortByUrgency(evaluate(ruleStore.rules, quoteStore.bySymbol)));

	const fired = $derived(rows.filter((row) => row.triggered));
	const watching = $derived(rows.filter((row) => row.status === 'active' && !row.triggered));
	const scheduled = $derived(rows.filter((row) => row.status === 'scheduled'));
	const expired = $derived(rows.filter((row) => row.status === 'expired'));

	function verb(rule) {
		return rule.direction === 'below' ? 'at or below' : 'at or above';
	}

	function periodText(rule) {
		if (!rule.startDate && !rule.endDate) return 'No time limit';
		if (!rule.endDate) return `From ${prettyDate(rule.startDate)}`;
		if (!rule.startDate) return `Until ${prettyDate(rule.endDate)}`;
		return `${prettyDate(rule.startDate)} → ${prettyDate(rule.endDate)}`;
	}

	/** Days left in the rule's window, so an expiring rule is visible at a glance. */
	function daysLeft(rule) {
		if (!rule.endDate) return null;
		const end = new Date(`${rule.endDate}T23:59:59`);
		return Math.ceil((end - new Date()) / 86_400_000);
	}
</script>

<div class="page">
	<h1>Alerts</h1>
	<p class="subtitle">
		Rules whose price condition is met right now, while inside their time period.
	</p>

	{#if ruleStore.rules.length === 0}
		<div class="card empty">
			No rules yet. <a href="{base}/rules/">Add a threshold</a> to start watching a company.
		</div>
	{:else}
		<section>
			<h2>Triggered <span class="badge fired">{fired.length}</span></h2>
			{#if fired.length === 0}
				<div class="card empty">
					Nothing has crossed a threshold. {watching.length} rule{watching.length === 1 ? '' : 's'}
					still watching.
				</div>
			{:else}
				<div class="grid cards">
					{#each fired as row (row.rule.id)}
						<article class="card alert">
							<div class="row head">
								<div>
									<strong>{row.rule.symbol}</strong>
									<span class="muted">{row.rule.name}</span>
								</div>
								<span class="badge fired">Fired</span>
							</div>

							<p class="big">
								{price(row.quote.price)}
								<span class="muted small">
									vs threshold {price(row.rule.threshold)}
								</span>
							</p>

							<p class="line">
								Price is {verb(row.rule)} your threshold by
								<strong class={row.rule.direction === 'below' ? 'down' : 'up'}>
									{signed(row.gap)} ({percent(row.gapPct)})
								</strong>
							</p>

							<p class="line muted small">
								{periodText(row.rule)}
								{#if daysLeft(row.rule) !== null}
									· {daysLeft(row.rule)} day{daysLeft(row.rule) === 1 ? '' : 's'} left
								{/if}
							</p>

							{#if row.rule.note}
								<p class="note">{row.rule.note}</p>
							{/if}
						</article>
					{/each}
				</div>
			{/if}
		</section>

		{#if watching.length > 0}
			<section>
				<h2>Watching <span class="badge active">{watching.length}</span></h2>
				<div class="card table-wrap">
					<table>
						<thead>
							<tr>
								<th>Symbol</th>
								<th>Company</th>
								<th class="num">Price</th>
								<th class="num">Threshold</th>
								<th class="num">Gap</th>
								<th>Period</th>
							</tr>
						</thead>
						<tbody>
							{#each watching as row (row.rule.id)}
								<tr>
									<td><strong>{row.rule.symbol}</strong></td>
									<td class="muted">{row.rule.name}</td>
									<td class="num">{row.quote ? price(row.quote.price) : '—'}</td>
									<td class="num">
										{row.rule.direction === 'below' ? '≤' : '≥'}
										{price(row.rule.threshold)}
									</td>
									<td class="num">{row.gap === null ? '—' : percent(row.gapPct)}</td>
									<td class="muted small">{periodText(row.rule)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}

		{#if scheduled.length > 0}
			<section>
				<h2>Scheduled <span class="badge scheduled">{scheduled.length}</span></h2>
				<div class="card">
					{#each scheduled as row (row.rule.id)}
						<p class="line">
							<strong>{row.rule.symbol}</strong>
							{verb(row.rule)}
							{price(row.rule.threshold)} — starts {prettyDate(row.rule.startDate)}
						</p>
					{/each}
				</div>
			</section>
		{/if}

		{#if expired.length > 0}
			<section>
				<h2>Expired <span class="badge expired">{expired.length}</span></h2>
				<div class="card">
					{#each expired as row (row.rule.id)}
						<p class="line muted">
							<strong>{row.rule.symbol}</strong>
							{verb(row.rule)}
							{price(row.rule.threshold)} — ended {prettyDate(row.rule.endDate)}
						</p>
					{/each}
					<button class="danger" onclick={() => ruleStore.removeExpired(new Date().toISOString().slice(0, 10))}>
						Delete expired rules
					</button>
				</div>
			</section>
		{/if}
	{/if}
</div>

<style>
	section {
		margin-bottom: 2rem;
	}

	.cards {
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
	}

	.alert {
		border-left: 3px solid var(--down);
	}

	.head {
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 0.5rem;
	}

	.head .muted {
		display: block;
		font-size: 0.78rem;
	}

	.big {
		font-size: 1.5rem;
		font-weight: 700;
		margin: 0 0 0.5rem;
	}

	.small {
		font-size: 0.78rem;
		font-weight: 400;
	}

	.line {
		margin: 0 0 0.35rem;
		font-size: 0.85rem;
	}

	.note {
		margin: 0.6rem 0 0;
		padding-top: 0.6rem;
		border-top: 1px solid var(--border);
		font-size: 0.8rem;
		color: var(--muted);
		font-style: italic;
	}
</style>
