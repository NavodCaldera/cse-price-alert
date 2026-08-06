/** Turns rules + quotes into the rows the Alerts page renders. */
import { dateKey } from './format.js';

/**
 * Where a rule sits relative to its time period.
 * - scheduled: the start date has not arrived yet
 * - active:    today falls inside the period, so the price is being watched
 * - expired:   the end date has passed
 * Blank dates mean "open ended" on that side.
 */
export function ruleStatus(rule, today = dateKey()) {
	if (rule.startDate && today < rule.startDate) return 'scheduled';
	if (rule.endDate && today > rule.endDate) return 'expired';
	return 'active';
}

export function isTriggered(rule, quote) {
	if (!quote) return false;
	return rule.direction === 'above'
		? quote.price >= rule.threshold
		: quote.price <= rule.threshold;
}

/**
 * Pair each rule with its live quote and work out whether it has fired.
 * `gap` is how far the price still has to move to hit the threshold.
 */
export function evaluate(rules, bySymbol, today = dateKey()) {
	return rules.map((rule) => {
		const quote = bySymbol.get(rule.symbol) ?? null;
		const status = ruleStatus(rule, today);
		const triggered = status === 'active' && isTriggered(rule, quote);

		const gap = quote ? quote.price - rule.threshold : null;
		const gapPct = quote && rule.threshold ? (gap / rule.threshold) * 100 : null;

		return { rule, quote, status, triggered, gap, gapPct };
	});
}

/** Triggered first, then closest to firing, so the urgent rows sit at the top. */
export function sortByUrgency(rows) {
	return [...rows].sort((a, b) => {
		if (a.triggered !== b.triggered) return a.triggered ? -1 : 1;
		if (a.gapPct === null) return 1;
		if (b.gapPct === null) return -1;
		return Math.abs(a.gapPct) - Math.abs(b.gapPct);
	});
}
