"""Send an email when a repo-side rule crosses its threshold.

The website's rules live in the browser's localStorage, which a GitHub Actions
runner cannot read. So email alerts use a second copy of the rules committed to
the repo as alert-rules.json - the Rules page has a "Copy for email alerts"
button that produces exactly that file.

Run with --dry-run to print the email instead of sending it.
"""

import json
import os
import smtplib
import sys
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

COLOMBO = timezone(timedelta(hours=5, minutes=30))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Overridable so you can dry-run against a scratch rules file without touching the real one.
RULES_FILE = os.environ.get("ALERT_RULES_FILE") or os.path.join(ROOT, "alert-rules.json")
LATEST_FILE = os.path.join(ROOT, "data", "latest.json")
STATE_FILE = os.path.join(ROOT, "data", "alert-state.json")


def load_json(path, fallback):
    if not os.path.exists(path):
        return fallback
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError) as error:
        print(f"::warning::Could not read {os.path.basename(path)}: {error}")
        return fallback


def rule_status(rule, today):
    """Mirrors ruleStatus() in src/lib/evaluate.js - keep the two in step."""
    if rule.get("startDate") and today < rule["startDate"]:
        return "scheduled"
    if rule.get("endDate") and today > rule["endDate"]:
        return "expired"
    return "active"


def is_triggered(rule, quote):
    if not quote:
        return False
    if rule.get("direction") == "above":
        return quote["price"] >= rule["threshold"]
    return quote["price"] <= rule["threshold"]


def find_due_alerts(rules, quotes_by_symbol, state, now, cooldown_hours):
    """Return the rules to email about, and the pruned state to write back.

    A rule emails when it *starts* being triggered, not on every run - otherwise a
    price sitting below your threshold would mail you every 15 minutes all day.
    While it stays triggered, a reminder goes out once per cooldown window.
    """
    today = now.strftime("%Y-%m-%d")
    cooldown = timedelta(hours=cooldown_hours)
    due = []
    next_state = {}

    for rule in rules:
        rule_id = rule_key(rule)
        quote = quotes_by_symbol.get(rule.get("symbol"))

        if rule_status(rule, today) != "active" or not is_triggered(rule, quote):
            # Dropping the entry means a fresh crossing later will notify again.
            continue

        previous = state.get(rule_id)
        next_state[rule_id] = {
            "triggeredSince": (previous or {}).get("triggeredSince") or now.isoformat(timespec="seconds"),
            "lastNotified": (previous or {}).get("lastNotified"),
            "lastPrice": quote["price"],
        }

        if previous is None:
            due.append((rule, quote, "crossed"))
        else:
            last = previous.get("lastNotified")
            stale = not last or datetime.fromisoformat(last) + cooldown <= now
            if stale:
                due.append((rule, quote, "reminder"))

    return due, next_state


def rule_key(rule):
    return rule.get("id") or f"{rule.get('symbol')}-{rule.get('threshold')}"


def mark_notified(state, due, now):
    """Stamp the rules we just emailed about, so the cooldown starts now.

    Only called after a successful send - if delivery fails the stamp is left
    alone and the next run retries.
    """
    stamp = now.isoformat(timespec="seconds")
    for rule, _, _ in due:
        entry = state.get(rule_key(rule))
        if entry is not None:
            entry["lastNotified"] = stamp
    return state


def build_email(due, now):
    lines = []
    rows = []

    for rule, quote, kind in due:
        arrow = "at or below" if rule.get("direction") == "below" else "at or above"
        gap = quote["price"] - rule["threshold"]
        tag = " (still triggered)" if kind == "reminder" else ""

        lines.append(
            f"{rule['symbol']} - {quote['name']}\n"
            f"  LKR {quote['price']:,.2f} is {arrow} your threshold of "
            f"LKR {rule['threshold']:,.2f} (gap {gap:+,.2f}){tag}\n"
            f"  Day range: {quote['low']:,.2f} - {quote['high']:,.2f} | "
            f"Change: {quote['change']:+,.2f} ({quote['changePct']:+.2f}%)"
            + (f"\n  Note: {rule['note']}" if rule.get("note") else "")
        )

        colour = "#d02b2b" if rule.get("direction") == "below" else "#0f8a4d"
        rows.append(
            f"<tr>"
            f"<td style='padding:8px;border-bottom:1px solid #e2e5ea'>"
            f"<strong>{rule['symbol']}</strong><br>"
            f"<span style='color:#6b7280;font-size:12px'>{quote['name']}</span></td>"
            f"<td style='padding:8px;border-bottom:1px solid #e2e5ea;text-align:right;"
            f"font-weight:700;color:{colour}'>LKR {quote['price']:,.2f}</td>"
            f"<td style='padding:8px;border-bottom:1px solid #e2e5ea;text-align:right'>"
            f"{'&le;' if rule.get('direction') == 'below' else '&ge;'} "
            f"LKR {rule['threshold']:,.2f}</td>"
            f"<td style='padding:8px;border-bottom:1px solid #e2e5ea;text-align:right'>"
            f"{quote['change']:+,.2f} ({quote['changePct']:+.2f}%)</td>"
            f"</tr>"
        )

    if len(due) == 1:
        rule, quote, _ = due[0]
        subject = f"CSE alert: {rule['symbol']} at LKR {quote['price']:,.2f}"
    else:
        subject = f"CSE alert: {len(due)} thresholds triggered"

    stamp = now.strftime("%d %b %Y, %H:%M")
    text = f"{len(due)} threshold(s) triggered at {stamp} SLT\n\n" + "\n\n".join(lines)

    html = (
        f"<div style='font-family:Segoe UI,system-ui,sans-serif;max-width:640px'>"
        f"<h2 style='margin:0 0 4px'>CSE Price Alert</h2>"
        f"<p style='color:#6b7280;margin:0 0 16px;font-size:13px'>"
        f"{len(due)} threshold(s) triggered at {stamp} SLT</p>"
        f"<table style='width:100%;border-collapse:collapse;font-size:14px'>"
        f"<tr style='text-align:left;color:#6b7280;font-size:11px;text-transform:uppercase'>"
        f"<th style='padding:8px'>Company</th><th style='padding:8px;text-align:right'>Price</th>"
        f"<th style='padding:8px;text-align:right'>Threshold</th>"
        f"<th style='padding:8px;text-align:right'>Change</th></tr>"
        f"{''.join(rows)}</table></div>"
    )

    return subject, text, html


def send_email(subject, text, html, dry_run):
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    port = int(os.environ.get("SMTP_PORT", "465"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASSWORD", "")
    recipients = [r.strip() for r in os.environ.get("ALERT_EMAIL_TO", "").split(",") if r.strip()]

    if dry_run or not (user and password and recipients):
        reason = "--dry-run" if dry_run else "SMTP_USER / SMTP_PASSWORD / ALERT_EMAIL_TO not set"
        print(f"\n--- email not sent ({reason}) ---")
        print(f"Subject: {subject}\n")
        print(text)
        print("--- end ---\n")
        return dry_run  # a dry run is a success; missing config is not

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"CSE Price Alert <{user}>"
    message["To"] = ", ".join(recipients)
    message.set_content(text)
    message.add_alternative(html, subtype="html")

    with smtplib.SMTP_SSL(host, port, timeout=30) as server:
        server.login(user, password)
        server.send_message(message)

    print(f"Emailed {len(recipients)} recipient(s): {subject}")
    return True


def main():
    dry_run = "--dry-run" in sys.argv
    now = datetime.now(COLOMBO)

    config = load_json(RULES_FILE, {})
    rules = config.get("rules", [])
    cooldown_hours = float(config.get("cooldownHours", 24))

    if not rules:
        print("No rules in alert-rules.json - nothing to check.")
        return 0

    snapshot = load_json(LATEST_FILE, {})
    quotes_by_symbol = {q["symbol"]: q for q in snapshot.get("quotes", [])}
    if not quotes_by_symbol:
        print("::warning::No quotes in data/latest.json - skipping the alert check.")
        return 0

    state = load_json(STATE_FILE, {}).get("rules", {})
    due, next_state = find_due_alerts(rules, quotes_by_symbol, state, now, cooldown_hours)

    print(f"Checked {len(rules)} rule(s): {len(next_state)} triggered, {len(due)} to notify.")

    sent = True
    if due:
        subject, text, html = build_email(due, now)
        try:
            sent = send_email(subject, text, html, dry_run)
        except Exception as error:  # noqa: BLE001 - never lose the price update over email
            print(f"::error::Could not send the alert email: {error}")
            sent = False

        if sent:
            mark_notified(next_state, due, now)

    # Written either way, so an unsent alert is retried on the next run rather
    # than being silently marked as delivered.
    if not dry_run:
        with open(STATE_FILE, "w", encoding="utf-8") as handle:
            json.dump({"updatedAt": now.isoformat(timespec="seconds"), "rules": next_state}, handle, indent=1)
            handle.write("\n")

    return 0 if sent else 1


if __name__ == "__main__":
    sys.exit(main())
