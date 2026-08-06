// Copies the data the Python fetcher produced into static/, so the built site can
// request it at runtime. Runs automatically before `npm run dev` and `npm run build`.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'data', 'latest.json');
const targetDir = join(root, 'static', 'data');
const target = join(targetDir, 'latest.json');

mkdirSync(targetDir, { recursive: true });

// Also publish the server-side email rules, so the Rules page can mark which of
// your rules will actually email you.
const emailRules = join(root, 'alert-rules.json');
if (existsSync(emailRules)) {
	copyFileSync(emailRules, join(targetDir, 'alert-rules.json'));
} else {
	writeFileSync(join(targetDir, 'alert-rules.json'), JSON.stringify({ rules: [] }));
}

if (existsSync(source)) {
	copyFileSync(source, target);
	console.log('sync-data: copied data/latest.json -> static/data/latest.json');
} else if (!existsSync(target)) {
	// First run before any fetch has happened - write a valid empty payload so the
	// site builds and renders an honest "no data yet" state instead of crashing.
	writeFileSync(
		target,
		JSON.stringify({ updatedAt: null, marketStatus: 'Unknown', count: 0, quotes: [] }, null, 1)
	);
	console.log('sync-data: no data/latest.json found, wrote an empty placeholder');
}
