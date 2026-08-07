<script>
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import { quoteStore } from '$lib/quotes.svelte.js';
	import { ruleStore } from '$lib/rules.svelte.js';
	import { evaluate } from '$lib/evaluate.js';
	import { prettyTimestamp } from '$lib/format.js';
	import { countdown, formatSlot, nextRun } from '$lib/schedule.js';
	import '../app.css';

	let { children } = $props();

	// Ticks so the countdown to the next run stays honest without a page reload.
	let now = $state(new Date());

	onMount(() => {
		quoteStore.load();
		const timer = setInterval(() => (now = new Date()), 30_000);
		return () => clearInterval(timer);
	});

	const next = $derived(nextRun(now));

	const firedCount = $derived(
		evaluate(ruleStore.rules, quoteStore.bySymbol).filter((row) => row.triggered).length
	);

	const links = [
		{ href: `${base}/`, label: 'Market' },
		{ href: `${base}/alerts/`, label: 'Alerts' },
		{ href: `${base}/rules/`, label: 'Rules' }
	];

	function isCurrent(href) {
		const path = page.url.pathname.replace(/\/$/, '');
		return path === href.replace(/\/$/, '');
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>CSE Price Alert</title>
</svelte:head>

<header>
	<div class="inner">
		<a class="brand" href="{base}/">CSE Price Alert</a>

		<nav>
			{#each links as link (link.href)}
				<a href={link.href} class:current={isCurrent(link.href)}>
					{link.label}
					{#if link.label === 'Alerts' && firedCount > 0}
						<span class="count">{firedCount}</span>
					{/if}
				</a>
			{/each}
		</nav>

		<div class="status">
			<span class="dot" class:open={quoteStore.marketStatus.toLowerCase().includes('open')}></span>
			<span>{quoteStore.marketStatus}</span>
			<span class="sep">·</span>
			<span title="When the scheduled job last fetched prices from the CSE">
				Updated {prettyTimestamp(quoteStore.updatedAt)}
			</span>
			<span class="sep">·</span>
			<span class="next" title="Runs every 15 minutes, weekdays 9:30 AM - 2:30 PM Colombo time">
				Next {formatSlot(next, now)}
				<span class="in">{countdown(next, now)}</span>
			</span>
			<button class="link" onclick={() => quoteStore.refresh()} disabled={quoteStore.loading}>
				{quoteStore.loading ? 'Refreshing…' : 'Refresh'}
			</button>
		</div>
	</div>
</header>

{@render children()}

<style>
	header {
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.inner {
		max-width: 1100px;
		margin: 0 auto;
		padding: 0.7rem 1rem;
		display: flex;
		align-items: center;
		gap: 1.25rem;
		flex-wrap: wrap;
	}

	.brand {
		font-weight: 700;
		text-decoration: none;
		color: var(--text);
	}

	nav {
		display: flex;
		gap: 0.35rem;
	}

	nav a {
		text-decoration: none;
		color: var(--muted);
		font-size: 0.875rem;
		font-weight: 600;
		padding: 0.3rem 0.7rem;
		border-radius: 999px;
	}

	nav a:hover {
		color: var(--text);
	}

	nav a.current {
		background: var(--accent-soft);
		color: var(--accent);
	}

	.count {
		display: inline-block;
		background: var(--down);
		color: #fff;
		border-radius: 999px;
		font-size: 0.68rem;
		padding: 0 0.35rem;
		margin-left: 0.25rem;
		vertical-align: middle;
	}

	.status {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.78rem;
		color: var(--muted);
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--muted);
	}

	.dot.open {
		background: var(--up);
	}

	.sep {
		opacity: 0.5;
	}

	.next {
		white-space: nowrap;
	}

	.next .in {
		opacity: 0.65;
	}
</style>
