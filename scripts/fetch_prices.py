"""Fetch every CSE quote in one call and write it into data/ for the Svelte site.

The company-profile page on cse.lk is rendered client side, so the <h2>LKR 158.75</h2>
never exists in the served HTML. The same number is available from the JSON API that
the site's own frontend calls, which is what we use here.
"""

import csv
import json
import os
import sys
from datetime import datetime, timedelta, timezone

import requests

COLOMBO = timezone(timedelta(hours=5, minutes=30))
BASE = "https://www.cse.lk/api"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; cse-price-alert/1.0)",
    "Referer": "https://www.cse.lk/",
    "Content-Type": "application/x-www-form-urlencoded",
}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
LATEST = os.path.join(DATA_DIR, "latest.json")
HISTORY = os.path.join(DATA_DIR, "history.csv")

HISTORY_FIELDS = ["date", "symbol", "close", "high", "low", "volume"]


def post(endpoint, **payload):
    """POST to a CSE endpoint, retrying briefly on transient failures."""
    url = f"{BASE}/{endpoint}"
    last_error = None
    for attempt in range(3):
        try:
            response = requests.post(url, data=payload, headers=HEADERS, timeout=30)
            response.raise_for_status()
            return response.json()
        except Exception as error:  # noqa: BLE001 - retry on anything transient
            last_error = error
            print(f"  attempt {attempt + 1} failed for {endpoint}: {error}")
    raise RuntimeError(f"{endpoint} failed after 3 attempts") from last_error


def number(value):
    """CSE sends nulls for illiquid counters; normalise them to 0."""
    return 0.0 if value is None else float(value)


def fetch_quotes():
    raw = post("tradeSummary")["reqTradeSummery"]
    quotes = []

    for row in raw:
        price = number(row.get("price"))
        previous = number(row.get("previousClose"))
        # A counter that has never traded is noise on the dashboard, so skip it.
        if price <= 0:
            continue

        change = price - previous if previous else 0.0
        quotes.append(
            {
                "symbol": row.get("symbol"),
                "name": row.get("name"),
                "price": round(price, 2),
                "previousClose": round(previous, 2),
                "change": round(change, 2),
                "changePct": round(change / previous * 100, 2) if previous else 0.0,
                "high": round(number(row.get("high")), 2),
                "low": round(number(row.get("low")), 2),
                "open": round(number(row.get("open")), 2),
                "volume": int(number(row.get("sharevolume"))),
                "trades": int(number(row.get("tradevolume"))),
                "turnover": round(number(row.get("turnover")), 2),
                "marketCap": round(number(row.get("marketCap")), 2),
            }
        )

    quotes.sort(key=lambda quote: quote["symbol"])
    return quotes


def fetch_market_status():
    try:
        return post("marketStatus").get("status", "Unknown")
    except Exception:  # noqa: BLE001 - status is cosmetic, never fail the run for it
        return "Unknown"


def write_latest(quotes, status, now):
    payload = {
        "updatedAt": now.isoformat(timespec="seconds"),
        "marketStatus": status,
        "count": len(quotes),
        "quotes": quotes,
    }
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(LATEST, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=1)
        handle.write("\n")


def write_history(quotes, now):
    """Keep one row per symbol per trading day, rewriting today's rows each run."""
    today = now.strftime("%Y-%m-%d")
    kept = []

    if os.path.exists(HISTORY):
        with open(HISTORY, newline="", encoding="utf-8") as handle:
            kept = [row for row in csv.DictReader(handle) if row.get("date") != today]

    for quote in quotes:
        kept.append(
            {
                "date": today,
                "symbol": quote["symbol"],
                "close": quote["price"],
                "high": quote["high"],
                "low": quote["low"],
                "volume": quote["volume"],
            }
        )

    kept.sort(key=lambda row: (row["date"], row["symbol"]))
    with open(HISTORY, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=HISTORY_FIELDS)
        writer.writeheader()
        writer.writerows(kept)


def main():
    now = datetime.now(COLOMBO)
    print(f"Fetching CSE quotes at {now.isoformat(timespec='seconds')}")

    quotes = fetch_quotes()
    if not quotes:
        print("No quotes returned - refusing to overwrite existing data.")
        return 1

    status = fetch_market_status()
    write_latest(quotes, status, now)
    write_history(quotes, now)

    print(f"Wrote {len(quotes)} quotes. Market status: {status}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
