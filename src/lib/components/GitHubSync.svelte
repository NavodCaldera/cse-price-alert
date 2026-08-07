<script>
	import { githubSync } from '$lib/github.svelte.js';

	let { rules } = $props();

	let editing = $state(!githubSync.configured);
	let tokenInput = $state('');
	let repoInput = $state(githubSync.repo);

	// Rules the workflow does not know about yet - the whole point of this panel.
	const pending = $derived(rules.filter((rule) => !githubSync.remoteIds.has(rule.id)));
	const inSync = $derived(
		githubSync.configured &&
			pending.length === 0 &&
			githubSync.remoteIds.size === rules.length &&
			rules.length > 0
	);

	function save() {
		githubSync.saveSettings(tokenInput, repoInput);
		tokenInput = '';
		editing = false;
		githubSync.refresh();
	}

	function disconnect() {
		githubSync.forget();
		editing = true;
	}
</script>

<section class="card sync" class:ready={inSync}>
	<div class="head">
		<h2>Email &amp; phone alerts</h2>
		{#if githubSync.configured && !editing}
			{#if inSync}
				<span class="badge active">all rules synced</span>
			{:else}
				<span class="badge warn">{pending.length} not synced</span>
			{/if}
		{/if}
	</div>

	{#if editing}
		<p class="explain">
			Rules live in this browser, but the scheduled job can only read rules committed to the
			repository. Add a token and this page will commit them for you.
		</p>

		<ol class="steps">
			<li>
				Open
				<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
					github.com/settings/personal-access-tokens/new
				</a>
			</li>
			<li>Repository access: <strong>Only select repositories</strong> → pick this repo</li>
			<li>Permissions → Repository permissions → <strong>Contents: Read and write</strong></li>
			<li>Generate, then paste the token below</li>
		</ol>

		<div class="fields">
			<div>
				<label for="gh-repo">Repository</label>
				<input id="gh-repo" bind:value={repoInput} placeholder="owner/repo" autocomplete="off" />
			</div>
			<div>
				<label for="gh-token">Token</label>
				<input
					id="gh-token"
					type="password"
					bind:value={tokenInput}
					placeholder="github_pat_…"
					autocomplete="off"
				/>
			</div>
		</div>

		<p class="warn-note">
			The token is stored in this browser only and never leaves it except to talk to GitHub. Scope
			it to this one repository so it can do nothing else.
		</p>

		<div class="row">
			<button class="primary" onclick={save} disabled={!tokenInput.trim()}>Save token</button>
			{#if githubSync.configured}
				<button onclick={() => (editing = false)}>Cancel</button>
			{/if}
		</div>
	{:else}
		<p class="explain">
			Connected to <code>{githubSync.repo}</code>. Sync after adding, editing or deleting a rule —
			until you do, the change only exists in this browser.
		</p>

		{#if pending.length > 0}
			<p class="pending">
				Not yet alerting: {pending.map((rule) => rule.symbol).join(', ')}
			</p>
		{/if}

		<div class="row">
			<button
				class="primary"
				onclick={() => githubSync.push(rules)}
				disabled={githubSync.status === 'working' || rules.length === 0}
			>
				{githubSync.status === 'working' ? 'Syncing…' : 'Sync rules to GitHub'}
			</button>
			<button onclick={() => (editing = true)}>Change token</button>
			<button class="danger" onclick={disconnect}>Disconnect</button>
		</div>
	{/if}

	{#if githubSync.message}
		<p class="result" class:bad={githubSync.status === 'error'}>{githubSync.message}</p>
	{/if}
</section>

<style>
	.sync {
		margin-bottom: 1.25rem;
		border-left: 3px solid var(--warn-border);
	}

	.sync.ready {
		border-left-color: var(--up);
	}

	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 0.5rem;
	}

	.head h2 {
		margin: 0;
	}

	.badge.warn {
		color: #b45309;
		border-color: var(--warn-border);
	}

	.explain {
		font-size: 0.85rem;
		color: var(--muted);
		margin: 0 0 0.75rem;
	}

	.steps {
		font-size: 0.82rem;
		color: var(--muted);
		margin: 0 0 1rem;
		padding-left: 1.2rem;
	}

	.steps li {
		margin-bottom: 0.25rem;
	}

	.fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.warn-note {
		font-size: 0.78rem;
		color: var(--muted);
		background: var(--warn-bg);
		border: 1px solid var(--warn-border);
		border-radius: 6px;
		padding: 0.5rem 0.7rem;
		margin: 0 0 0.9rem;
	}

	.pending {
		font-size: 0.82rem;
		margin: 0 0 0.75rem;
		color: var(--down);
	}

	.result {
		font-size: 0.82rem;
		margin: 0.75rem 0 0;
		color: var(--up);
	}

	.result.bad {
		color: var(--down);
	}
</style>
