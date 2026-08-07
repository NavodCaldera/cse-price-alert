<script>
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import RuleForm from '$lib/components/RuleForm.svelte';
	import GitHubSync from '$lib/components/GitHubSync.svelte';
	import { githubSync } from '$lib/github.svelte.js';
	import { quoteStore } from '$lib/quotes.svelte.js';
	import { ruleStore } from '$lib/rules.svelte.js';
	import { ruleStatus } from '$lib/evaluate.js';
	import { price, prettyDate } from '$lib/format.js';

	// The Market page links here as /rules/?symbol=LFIN.N0000 to prefill the form.
	const prefill = $derived(page.url.searchParams.get('symbol') ?? '');

	let editingId = $state(null);
	let message = $state('');
	let fileInput = $state(null);

	// Rule ids the scheduled job can actually alert on. When a GitHub token is set we
	// ask the API directly, since the deployed copy lags behind a fresh commit.
	let deployedIds = $state(new Set());
	const emailedIds = $derived(githubSync.configured ? githubSync.remoteIds : deployedIds);

	onMount(async () => {
		githubSync.refresh();
		try {
			const response = await fetch(`${base}/data/alert-rules.json?t=${Date.now()}`);
			if (!response.ok) return;
			const config = await response.json();
			deployedIds = new Set((config.rules ?? []).map((rule) => rule.id));
		} catch {
			// The file is optional - alerts are opt-in.
		}
	});

	const editing = $derived(ruleStore.rules.find((rule) => rule.id === editingId) ?? null);

	function flash(text) {
		message = text;
		setTimeout(() => (message = ''), 3000);
	}

	function handleSave(values) {
		if (editingId) {
			ruleStore.update(editingId, values);
			editingId = null;
			flash('Rule updated.');
		} else {
			ruleStore.add(values);
			flash(`Watching ${values.symbol}.`);
		}
	}

	function exportRules() {
		const blob = new Blob([ruleStore.export()], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = `cse-alert-rules-${new Date().toISOString().slice(0, 10)}.json`;
		link.click();
		URL.revokeObjectURL(url);
	}

	/** Build the exact contents of alert-rules.json from the rules in this browser. */
	async function copyForEmail() {
		const config = {
			cooldownHours: 24,
			rules: ruleStore.rules.map(({ createdAt, ...rule }) => rule)
		};
		const text = JSON.stringify(config, null, 2);
		try {
			await navigator.clipboard.writeText(text);
			flash('Copied. Paste it into alert-rules.json and push to GitHub.');
		} catch {
			// Clipboard needs a secure context; fall back to a download.
			const blob = new Blob([text], { type: 'application/json' });
			const link = document.createElement('a');
			link.href = URL.createObjectURL(blob);
			link.download = 'alert-rules.json';
			link.click();
			URL.revokeObjectURL(link.href);
			flash('Downloaded alert-rules.json — commit it to your repo.');
		}
	}

	async function importRules(event) {
		const file = event.target.files?.[0];
		if (!file) return;
		try {
			const added = ruleStore.import(await file.text());
			flash(`Imported ${added} rule${added === 1 ? '' : 's'}.`);
		} catch (error) {
			flash(`Import failed: ${error.message}`);
		}
		event.target.value = '';
	}
</script>

<div class="page">
	<h1>Rules</h1>
	<p class="subtitle">
		Set a price threshold and the period it applies to. Rules live in this browser; sync them to
		GitHub below so the scheduled job can email and notify you when one fires.
	</p>

	<GitHubSync rules={ruleStore.rules} />

	{#if message}
		<p class="flash">{message}</p>
	{/if}

	<!-- Re-keying forces a fresh form when the symbol in the URL changes or an edit starts. -->
	{#key editingId ?? prefill}
		<RuleForm
			initial={editing ?? (prefill ? { symbol: prefill } : null)}
			onsave={handleSave}
			oncancel={editingId ? () => (editingId = null) : null}
		/>
	{/key}

	<section>
		<div class="row heading">
			<h2>Your rules ({ruleStore.rules.length})</h2>
			<div class="row">
				<button onclick={copyForEmail} disabled={ruleStore.rules.length === 0}>
					Copy for email alerts
				</button>
				<button onclick={exportRules} disabled={ruleStore.rules.length === 0}>Export</button>
				<button onclick={() => fileInput.click()}>Import</button>
				<input
					bind:this={fileInput}
					type="file"
					accept="application/json"
					onchange={importRules}
					hidden
				/>
			</div>
		</div>

		{#if ruleStore.rules.length === 0}
			<div class="card empty">No rules yet. Add one above.</div>
		{:else}
			<div class="card table-wrap">
				<table>
					<thead>
						<tr>
							<th>Symbol</th>
							<th>Condition</th>
							<th class="num">Now</th>
							<th>Time period</th>
							<th>Status</th>
							<th>Email</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each ruleStore.rules as rule (rule.id)}
							{@const quote = quoteStore.bySymbol.get(rule.symbol)}
							{@const status = ruleStatus(rule)}
							<tr>
								<td>
									<strong>{rule.symbol}</strong>
									<span class="company">{rule.name}</span>
								</td>
								<td>
									{rule.direction === 'below' ? '≤' : '≥'}
									{price(rule.threshold)}
									{#if rule.note}<span class="note">{rule.note}</span>{/if}
								</td>
								<td class="num">{quote ? price(quote.price) : '—'}</td>
								<td class="muted small">
									{rule.startDate ? prettyDate(rule.startDate) : 'any time'}
									→
									{rule.endDate ? prettyDate(rule.endDate) : 'no end'}
								</td>
								<td><span class="badge {status}">{status}</span></td>
								<td>
									{#if emailedIds.has(rule.id)}
										<span class="badge active" title="In alert-rules.json — this rule emails you"
											>on</span
										>
									{:else}
										<span class="badge" title="Browser only — use “Copy for email alerts”">off</span>
									{/if}
								</td>
								<td class="actions">
									<button class="link" onclick={() => (editingId = rule.id)}>Edit</button>
									<button class="link danger" onclick={() => ruleStore.remove(rule.id)}>
										Delete
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

<style>
	section {
		margin-top: 2rem;
	}

	.heading {
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	.heading h2 {
		margin: 0;
	}

	.flash {
		background: var(--accent-soft);
		border: 1px solid var(--accent);
		color: var(--accent);
		padding: 0.5rem 0.8rem;
		border-radius: 7px;
		font-size: 0.85rem;
		margin: 0 0 1rem;
	}

	.company {
		display: block;
		font-size: 0.75rem;
		color: var(--muted);
	}

	.note {
		display: block;
		font-size: 0.75rem;
		color: var(--muted);
		font-style: italic;
	}

	.small {
		font-size: 0.78rem;
	}

	.actions {
		white-space: nowrap;
	}
</style>
