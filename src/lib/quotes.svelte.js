/**
 * Loads the snapshot that the GitHub Actions cron job commits.
 *
 * Fetched at runtime rather than imported at build time, so a page left open can
 * pick up a newer snapshot by calling refresh() without needing a rebuild.
 */
import { base } from '$app/paths';

class QuoteStore {
	quotes = $state([]);
	updatedAt = $state(null);
	marketStatus = $state('Unknown');
	loading = $state(false);
	error = $state(null);
	loaded = $state(false);

	/** Symbol -> quote, for O(1) lookups when matching rules. */
	bySymbol = $derived(new Map(this.quotes.map((quote) => [quote.symbol, quote])));

	async load({ force = false } = {}) {
		if (this.loading || (this.loaded && !force)) return;

		this.loading = true;
		this.error = null;
		try {
			// Cache-buster: GitHub Pages caches aggressively, and a stale price is
			// worse than a slow one for an alerting tool.
			const response = await fetch(`${base}/data/latest.json?t=${Date.now()}`);
			if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

			const payload = await response.json();
			this.quotes = payload.quotes ?? [];
			this.updatedAt = payload.updatedAt ?? null;
			this.marketStatus = payload.marketStatus ?? 'Unknown';
			this.loaded = true;
		} catch (error) {
			this.error = error instanceof Error ? error.message : String(error);
		} finally {
			this.loading = false;
		}
	}

	refresh() {
		return this.load({ force: true });
	}
}

export const quoteStore = new QuoteStore();
