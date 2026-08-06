/**
 * Threshold rules, owned by the browser.
 *
 * GitHub Pages serves static files only - there is no backend to store per-user
 * settings in - so rules live in localStorage. They survive reloads, stay private
 * to this browser, and can be moved between devices with the export/import buttons
 * on the Rules page.
 */
import { browser } from '$app/environment';

const STORAGE_KEY = 'cse-price-alert:rules:v1';

function readStorage() {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed.map(normalise).filter(Boolean) : [];
	} catch {
		// Corrupt or unreadable storage should not take the whole page down.
		return [];
	}
}

/** Accept anything roughly rule-shaped (including imported files) or reject it. */
function normalise(input) {
	if (!input || typeof input.symbol !== 'string') return null;
	const threshold = Number(input.threshold);
	if (!Number.isFinite(threshold) || threshold <= 0) return null;

	return {
		id: typeof input.id === 'string' ? input.id : crypto.randomUUID(),
		symbol: input.symbol,
		name: typeof input.name === 'string' ? input.name : input.symbol,
		threshold,
		direction: input.direction === 'above' ? 'above' : 'below',
		startDate: typeof input.startDate === 'string' ? input.startDate : '',
		endDate: typeof input.endDate === 'string' ? input.endDate : '',
		note: typeof input.note === 'string' ? input.note : '',
		createdAt: typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString()
	};
}

class RuleStore {
	rules = $state(readStorage());

	#persist() {
		if (!browser) return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(this.rules));
	}

	add(rule) {
		const clean = normalise({ ...rule, id: crypto.randomUUID() });
		if (!clean) return null;
		this.rules = [...this.rules, clean];
		this.#persist();
		return clean;
	}

	update(id, patch) {
		this.rules = this.rules.map((rule) => {
			if (rule.id !== id) return rule;
			return normalise({ ...rule, ...patch, id }) ?? rule;
		});
		this.#persist();
	}

	remove(id) {
		this.rules = this.rules.filter((rule) => rule.id !== id);
		this.#persist();
	}

	/** Drop rules whose end date has already passed. */
	removeExpired(today) {
		this.rules = this.rules.filter((rule) => !rule.endDate || rule.endDate >= today);
		this.#persist();
	}

	clear() {
		this.rules = [];
		this.#persist();
	}

	export() {
		return JSON.stringify({ version: 1, rules: this.rules }, null, 2);
	}

	/** Merge an exported file back in. Returns how many rules were accepted. */
	import(json) {
		const parsed = JSON.parse(json);
		const incoming = Array.isArray(parsed) ? parsed : parsed?.rules;
		if (!Array.isArray(incoming)) throw new Error('That file does not contain a rules array.');

		const accepted = incoming.map(normalise).filter(Boolean);
		const seen = new Set(this.rules.map((rule) => rule.id));
		this.rules = [...this.rules, ...accepted.filter((rule) => !seen.has(rule.id))];
		this.#persist();
		return accepted.length;
	}
}

export const ruleStore = new RuleStore();
