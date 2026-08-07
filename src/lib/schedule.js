/**
 * When the price job is next due.
 *
 * Runs happen on weekdays every 15 minutes between the CSE's opening and closing
 * bells. Colombo is a fixed UTC+5:30 with no daylight saving, so shifting by the
 * offset and reading the UTC fields gives Colombo wall-clock time without needing
 * a timezone library.
 */
const OFFSET_MS = 5.5 * 60 * 60 * 1000;
const OPEN_MINUTES = 9 * 60 + 30; // 09:30
const CLOSE_MINUTES = 14 * 60 + 30; // 14:30
const STEP_MINUTES = 15;

/** A Date whose UTC fields read as Colombo wall-clock time. */
function asColombo(date) {
	return new Date(date.getTime() + OFFSET_MS);
}

/** Build a real Date from a Colombo calendar day plus minutes past midnight. */
function slotOn(colombo, minutes) {
	return new Date(
		Date.UTC(colombo.getUTCFullYear(), colombo.getUTCMonth(), colombo.getUTCDate(), 0, minutes) -
			OFFSET_MS
	);
}

/** The next moment the workflow should run, or null if nothing is scheduled. */
export function nextRun(from = new Date()) {
	let cursor = from;

	// A week of lookahead comfortably covers a Friday-evening to Monday gap.
	for (let day = 0; day < 8; day++) {
		const colombo = asColombo(cursor);
		const weekday = colombo.getUTCDay(); // 0 Sunday … 6 Saturday
		const minutes = colombo.getUTCHours() * 60 + colombo.getUTCMinutes();

		if (weekday >= 1 && weekday <= 5) {
			if (minutes < OPEN_MINUTES) return slotOn(colombo, OPEN_MINUTES);

			if (minutes < CLOSE_MINUTES) {
				const next = (Math.floor(minutes / STEP_MINUTES) + 1) * STEP_MINUTES;
				if (next <= CLOSE_MINUTES) return slotOn(colombo, next);
			}
		}

		// Nothing left today - jump to midnight at the start of the next day.
		cursor = slotOn(colombo, 24 * 60);
	}

	return null;
}

/** "2:00 PM" today, "Mon 9:30 AM" otherwise. */
export function formatSlot(date, from = new Date()) {
	if (!date) return '—';

	const sameDay =
		asColombo(date).toISOString().slice(0, 10) === asColombo(from).toISOString().slice(0, 10);

	return new Intl.DateTimeFormat('en-LK', {
		timeZone: 'Asia/Colombo',
		...(sameDay ? {} : { weekday: 'short' }),
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	}).format(date);
}

/** "in 12 min", "in 3 h", or "in 2 days" - enough precision to be useful, no more. */
export function countdown(date, from = new Date()) {
	if (!date) return '';
	const minutes = Math.max(0, Math.round((date - from) / 60000));
	if (minutes < 1) return 'due now';
	if (minutes < 60) return `in ${minutes} min`;
	if (minutes < 60 * 24) {
		const hours = Math.floor(minutes / 60);
		return `in ${hours} h ${minutes % 60 ? `${minutes % 60} min` : ''}`.trim();
	}
	const days = Math.round(minutes / (60 * 24));
	return `in ${days} day${days === 1 ? '' : 's'}`;
}
