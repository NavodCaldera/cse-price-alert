# CSE Price Alert

A price dashboard for the Colombo Stock Exchange that runs entirely on GitHub — a
scheduled Action pulls prices during trading hours, and a SvelteKit site published on
GitHub Pages shows which of your watched companies have crossed a price threshold.

## How it works

```
GitHub Actions cron (weekdays 09:30-14:30 SLT)
        |
        |- scripts/fetch_prices.py  ->  https://www.cse.lk/api/tradeSummary
        |                               all ~280 companies in one request
        |- commits data/latest.json + data/history.csv
        |
        `- builds the SvelteKit site  ->  GitHub Pages
                                            |
                                            `- browser fetches data/latest.json
                                               and compares it to your rules,
                                               which live in localStorage
```

### Why the API instead of scraping the page

The price on `cse.lk/company-profile?symbol=LFIN.N0000` sits in a
`<h2>LKR 158.75</h2>`, but that element does not exist in the HTML the server sends —
the page renders it with JavaScript after loading. Scraping it would need a headless
browser. The site's own frontend gets the number from `POST /api/tradeSummary`, which
returns every listed company as JSON in a single 86 KB request, so that is what this
project uses.

### Why thresholds live in the browser

GitHub Pages serves static files and has no backend, so there is nowhere on the server
to store per-user settings. Rules are kept in `localStorage`: instant to edit, private
to your browser, and no commit needed to change one. Use **Export** on the Rules page
to back them up or move them to another device.

## Pages

| Page | What it does |
| --- | --- |
| **Market** | Every company, searchable and sortable. `+ Alert` prefills a rule. |
| **Alerts** | Rules grouped as Triggered, Watching, Scheduled and Expired. |
| **Rules** | Create and edit thresholds with their time period. Export/import. |

A rule is **threshold + direction + time period**. It only fires when today falls inside
the period, so you can set a buy target that is only relevant for the next month and
forget about it afterwards.

## Running it locally

```bash
pip install -r scripts/requirements.txt
python scripts/fetch_prices.py     # writes data/latest.json and data/history.csv

npm install
npm run dev                        # http://localhost:5173
```

`npm run dev` and `npm run build` both copy `data/latest.json` into `static/data/`
first, via `scripts/sync-data.mjs`.

## Publishing to GitHub

1. Create a repository on GitHub and push this folder to the `main` branch.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. In **Settings → Actions → General**, set workflow permissions to
   **Read and write** so the job can commit refreshed prices.
4. Open the **Actions** tab, pick *Update prices and deploy*, and click
   **Run workflow** to publish immediately instead of waiting for the schedule.

The site lands at `https://<user>.github.io/<repo>/`. The workflow sets `BASE_PATH`
from the repo name automatically, so no config edit is needed.

## Email alerts

The website's rules live in your browser, which the GitHub runner cannot read. So
email uses a second copy of the rules committed to the repo as `alert-rules.json`.

**Setting it up:**

1. Create your rules on the Rules page, then press **Copy for email alerts**.
2. Paste the result into `alert-rules.json` and push. Rules with email enabled show
   an `on` badge in the Email column.
3. Turn on 2-step verification for your Google account, then create an
   [App Password](https://myaccount.google.com/apppasswords) — Gmail rejects your
   normal password over SMTP.
4. Add three repository secrets under **Settings → Secrets and variables → Actions**:

   | Secret | Value |
   | --- | --- |
   | `SMTP_USER` | your Gmail address |
   | `SMTP_PASSWORD` | the 16-character App Password |
   | `ALERT_EMAIL_TO` | where to send alerts (comma-separate for several) |

Not on Gmail? Set the repository *variables* `SMTP_HOST` and `SMTP_PORT` to your
provider's SSL details; everything else is the same.

**How often it mails you.** A rule emails when it *starts* being triggered, not on
every run — otherwise a price sitting below your threshold would mail you every 15
minutes. While it stays triggered you get one reminder per `cooldownHours`, currently
168 (weekly). If the price recovers and crosses again later, that counts as a fresh
alert and mails you straight away, regardless of the cooldown. State lives in
`data/alert-state.json`, committed alongside the prices.

Useful values for `cooldownHours`: `24` daily, `168` weekly, `9999` to alert only on
genuine crossings and never repeat.

Preview an email without sending anything:

```bash
python scripts/check_alerts.py --dry-run
```

A mail failure annotates the workflow run but does not block the site deploy, and the
alert is retried on the next run rather than being marked as delivered.

## The schedule

GitHub cron runs on UTC, and Sri Lanka is UTC+5:30 year round (no daylight saving), so
trading hours 09:30-14:30 SLT are 04:00-09:00 UTC:

```yaml
- cron: '*/15 4-8 * * 1-5'   # every 15 minutes, 09:30-14:15 SLT
- cron: '0 9 * * 1-5'        # the 14:30 SLT close
```

Change `*/15` to `*/5` for five-minute updates — Actions minutes are free on public
repositories.

## Things worth knowing

- **Cron is best effort.** GitHub delays scheduled runs when its queues are busy,
  sometimes by 5-20 minutes. Treat the timestamp in the header as the truth rather
  than assuming a run happened exactly on the quarter hour.
- **Holidays.** The schedule cannot know CSE holidays. On a closed day the API returns
  the previous close, the committed file is unchanged, and the commit step is skipped.
- **The 60-day rule.** GitHub disables scheduled workflows in repos with no activity
  for 60 days. This one commits on most trading days, which keeps itself alive.
- **`data/history.csv`** holds one row per company per trading day (today's rows are
  rewritten on each run), about 280 rows a day — roughly 4 MB a year.
- **The API is unofficial.** It is the endpoint cse.lk's own site calls, so it is
  stable in practice, but there is no compatibility guarantee.
- **Two rule sets, on purpose.** The browser rules drive the website; `alert-rules.json`
  drives email. Editing one does not change the other — re-run **Copy for email alerts**
  after changing a threshold you care about being emailed on.
- **Email only fires while the workflow runs**, so alerts land during trading hours
  (plus whenever you trigger the workflow manually), not overnight.
