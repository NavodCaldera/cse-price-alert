/** Shared display formatting, so every page renders numbers and dates the same way. */

const money = new Intl.NumberFormat('en-LK', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
});

const whole = new Intl.NumberFormat('en-LK', { maximumFractionDigits: 0 });

export function lkr(value) {
	if (value === null || value === undefined) return '—';
	return `LKR ${money.format(value)}`;
}

export function price(value) {
	if (value === null || value === undefined) return '—';
	return money.format(value);
}

export function count(value) {
	if (value === null || value === undefined) return '—';
	return whole.format(value);
}

export function signed(value) {
	if (value === null || value === undefined) return '—';
	return `${value > 0 ? '+' : ''}${money.format(value)}`;
}

export function percent(value) {
	if (value === null || value === undefined) return '—';
	return `${value > 0 ? '+' : ''}${money.format(value)}%`;
}

/** Compact market cap, e.g. 87956570340 -> "87.96 B". */
export function compact(value) {
	if (!value) return '—';
	const units = [
		[1e12, 'T'],
		[1e9, 'B'],
		[1e6, 'M'],
		[1e3, 'K']
	];
	for (const [size, suffix] of units) {
		if (value >= size) return `${money.format(value / size)} ${suffix}`;
	}
	return money.format(value);
}

/** "2026-08-06" for a Date, using the browser's local calendar day. */
export function dateKey(date = new Date()) {
	const pad = (n) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "2026-08-06" plus N days, still as a date key. */
export function addDays(days, from = new Date()) {
	const next = new Date(from);
	next.setDate(next.getDate() + days);
	return dateKey(next);
}

export function prettyDate(key) {
	if (!key) return '—';
	const [year, month, day] = key.split('-').map(Number);
	return new Date(year, month - 1, day).toLocaleDateString('en-LK', {
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});
}

export function prettyTimestamp(iso) {
	if (!iso) return 'never';
	return new Date(iso).toLocaleString('en-LK', {
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit'
	});
}
