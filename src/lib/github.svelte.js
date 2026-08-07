/**
 * Writes alert-rules.json straight to GitHub from the browser.
 *
 * The workflow can only notify you about rules that live in the repo, but the site
 * is a static page with no backend to commit on its behalf. A fine-grained token,
 * kept in this browser, lets the Rules page do it directly - so the rules you see
 * are the rules that actually alert you.
 *
 * The token needs Contents: read and write on this one repository, nothing else.
 */
import { browser } from '$app/environment';

const TOKEN_KEY = 'cse-price-alert:gh-token';
const REPO_KEY = 'cse-price-alert:gh-repo';
const DEFAULT_REPO = 'NavodCaldera/cse-price-alert';
const FILE = 'alert-rules.json';
const API = 'https://api.github.com';

function read(key, fallback) {
	if (!browser) return fallback;
	return localStorage.getItem(key) ?? fallback;
}

/** btoa() only handles latin-1, so encode to UTF-8 bytes first. */
function toBase64(text) {
	const bytes = new TextEncoder().encode(text);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function fromBase64(encoded) {
	const binary = atob(encoded.replace(/\s/g, ''));
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

class GitHubSync {
	token = $state(read(TOKEN_KEY, ''));
	repo = $state(read(REPO_KEY, DEFAULT_REPO));

	status = $state('idle'); // idle | working | ok | error
	message = $state('');
	/** Rule ids currently committed, so the UI can show which rules really alert. */
	remoteIds = $state(new Set());

	configured = $derived(this.token.trim().length > 0 && this.repo.includes('/'));

	saveSettings(token, repo) {
		this.token = token.trim();
		this.repo = repo.trim() || DEFAULT_REPO;
		if (!browser) return;
		if (this.token) localStorage.setItem(TOKEN_KEY, this.token);
		else localStorage.removeItem(TOKEN_KEY);
		localStorage.setItem(REPO_KEY, this.repo);
	}

	forget() {
		this.token = '';
		this.remoteIds = new Set();
		this.status = 'idle';
		this.message = '';
		if (browser) localStorage.removeItem(TOKEN_KEY);
	}

	#headers() {
		return {
			Authorization: `Bearer ${this.token.trim()}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28'
		};
	}

	/** Current committed file, or null when it does not exist yet. */
	async read() {
		const response = await fetch(`${API}/repos/${this.repo}/contents/${FILE}`, {
			headers: this.#headers(),
			cache: 'no-store'
		});

		if (response.status === 404) return null;
		if (response.status === 401) throw new Error('Token rejected - check it has not expired.');
		if (response.status === 403)
			throw new Error('Token lacks permission. It needs Contents: read and write on this repo.');
		if (!response.ok) throw new Error(`GitHub returned ${response.status}`);

		const payload = await response.json();
		return { sha: payload.sha, config: JSON.parse(fromBase64(payload.content)) };
	}

	/** Refresh which rule ids are committed, without changing anything. */
	async refresh() {
		if (!this.configured) return;
		try {
			const current = await this.read();
			this.remoteIds = new Set((current?.config?.rules ?? []).map((rule) => rule.id));
		} catch {
			// A failed refresh should not block the page; the sync button reports properly.
		}
	}

	/**
	 * Commit `rules` as the new alert-rules.json.
	 * Existing settings such as cooldownHours are preserved.
	 */
	async push(rules) {
		if (!this.configured) throw new Error('Add a GitHub token first.');

		this.status = 'working';
		this.message = 'Reading current file…';

		try {
			const current = await this.read();

			const config = {
				cooldownHours: current?.config?.cooldownHours ?? 168,
				// createdAt is browser bookkeeping and only creates commit noise.
				rules: rules.map(({ createdAt, ...rule }) => rule)
			};

			const body = {
				message: `Update alert rules (${rules.length} rule${rules.length === 1 ? '' : 's'})`,
				content: toBase64(`${JSON.stringify(config, null, 2)}\n`)
			};
			if (current) body.sha = current.sha;

			this.message = 'Committing…';
			const response = await fetch(`${API}/repos/${this.repo}/contents/${FILE}`, {
				method: 'PUT',
				headers: { ...this.#headers(), 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				const detail = await response.json().catch(() => ({}));
				throw new Error(detail.message ?? `GitHub returned ${response.status}`);
			}

			this.remoteIds = new Set(config.rules.map((rule) => rule.id));
			this.status = 'ok';
			this.message = `Synced ${rules.length} rule${rules.length === 1 ? '' : 's'} to GitHub.`;
			return true;
		} catch (error) {
			this.status = 'error';
			this.message = error instanceof Error ? error.message : String(error);
			return false;
		}
	}
}

export const githubSync = new GitHubSync();
