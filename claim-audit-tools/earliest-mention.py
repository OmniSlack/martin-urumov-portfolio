#!/usr/bin/env python3
"""
Earliest dated occurrence of each term, across every archive you have.

WHAT IT ANSWERS

"When did I first write this?" — for each term you care about, across
conversation exports and mail, using the timestamps the archives carry rather
than file dates on disk, which you can change and which therefore prove
nothing.

WHAT IT RUNS ON

  conversations.json   Claude export (Settings -> Privacy -> Export data)
                       or ChatGPT export. Both layouts are handled.
  *.mbox               Gmail via Google Takeout. The Date: header is the
                       server's, not yours.

Nothing is uploaded anywhere. Standard library only. Works in Colab, or on a
fifteen-year-old machine, in seconds.

    python3 earliest-mention.py <folder-with-archives> [--terms=t1,t2,...]

COLAB

    from google.colab import files
    up = files.upload()            # drop conversations.json / takeout .mbox
    !python3 earliest-mention.py .

WHAT IT DOES NOT DO, so nobody builds on more than it carries:

  It finds the earliest occurrence IN WHAT YOU GIVE IT. An archive that is
  missing, truncated or was never exported cannot be searched, and its absence
  is not evidence that nothing existed — the same fail-closed rule the rest of
  this project runs on.

  A date inside an archive is only as good as the archive. A mail Date: header
  written by a sending server is strong. A field inside an export you produced
  is weaker. The output marks which is which and does not average them.
"""

import json
import os
import re
import sys
import email
import mailbox
from datetime import datetime, timezone

# Terms to trace. Override with --terms=t1,t2,... (the original carried the
# owner's own project vocabulary here, partly in Bulgarian; this copy ships a
# neutral default and expects --terms for real use).
DEFAULT_TERMS = [
    "reaction gap", "delta t", "observer",
    "STOP", "HOLD", "CLEAR",
]

STRONG = "server-stamped"      # a header written by a machine that is not yours
WEAK = "self-reported"         # a field inside an export you generated


def norm(ts):
    """Anything date-shaped -> an aware UTC datetime, or None."""
    if ts is None:
        return None
    if isinstance(ts, (int, float)):
        # seconds or milliseconds since epoch
        v = float(ts)
        if v > 1e11:
            v /= 1000.0
        try:
            return datetime.fromtimestamp(v, tz=timezone.utc)
        except (ValueError, OSError):
            return None
    if isinstance(ts, str):
        s = ts.strip().replace("Z", "+00:00")
        try:
            d = datetime.fromisoformat(s)
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
        try:
            d = email.utils.parsedate_to_datetime(ts)
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            return None
    return None


def walk(obj, path=""):
    """Every (text, timestamp, path) triple anywhere in a nested export."""
    if isinstance(obj, dict):
        text = None
        for k in ("text", "content", "body", "message", "parts"):
            v = obj.get(k)
            if isinstance(v, str) and v.strip():
                text = v
                break
            if isinstance(v, list) and v and isinstance(v[0], str):
                text = "\n".join(x for x in v if isinstance(x, str))
                break
        ts = None
        for k in ("created_at", "create_time", "timestamp", "date", "updated_at"):
            ts = norm(obj.get(k))
            if ts:
                break
        if text and ts:
            yield text, ts, path
        for k, v in obj.items():
            yield from walk(v, f"{path}/{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk(v, f"{path}[{i}]")


def scan_json(p):
    try:
        with open(p, encoding="utf8", errors="replace") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"  ! {os.path.basename(p)}: {e}")
        return
    n = 0
    for text, ts, path in walk(data):
        n += 1
        yield text, ts, os.path.basename(p), WEAK
    print(f"  {os.path.basename(p)}: {n} dated records")


def scan_mbox(p):
    try:
        mb = mailbox.mbox(p)
    except Exception as e:                                   # noqa: BLE001
        print(f"  ! {os.path.basename(p)}: {e}")
        return
    n = 0
    for msg in mb:
        ts = norm(msg.get("Date"))
        if not ts:
            continue
        parts = [msg.get("Subject") or ""]
        if msg.is_multipart():
            for sub in msg.walk():
                if sub.get_content_type() == "text/plain":
                    try:
                        parts.append(sub.get_payload(decode=True).decode("utf8", "replace"))
                    except Exception:                        # noqa: BLE001
                        pass
        else:
            try:
                parts.append(msg.get_payload(decode=True).decode("utf8", "replace"))
            except Exception:                                # noqa: BLE001
                pass
        n += 1
        yield "\n".join(parts), ts, os.path.basename(p), STRONG
    print(f"  {os.path.basename(p)}: {n} dated messages")


def main():
    root = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else "."
    terms = DEFAULT_TERMS
    for a in sys.argv:
        if a.startswith("--terms="):
            terms = [t.strip() for t in a.split("=", 1)[1].split(",") if t.strip()]

    files = []
    for dirpath, _, names in os.walk(root):
        for name in names:
            if name.endswith(".json") or name.endswith(".mbox"):
                files.append(os.path.join(dirpath, name))

    if not files:
        print(f"No .json or .mbox under {root!r}.")
        print("Export first: claude.ai Settings -> Privacy -> Export data,")
        print("and Gmail via takeout.google.com (Mail, .mbox).")
        return 2

    print(f"ARCHIVES ({len(files)})")
    records = []
    for p in sorted(files):
        gen = scan_mbox(p) if p.endswith(".mbox") else scan_json(p)
        records.extend(gen)
    print(f"\n{len(records)} dated records in total\n")

    pats = {t: re.compile(re.escape(t), re.IGNORECASE) for t in terms}
    earliest = {}
    for text, ts, src, strength in records:
        for t, pat in pats.items():
            if pat.search(text):
                cur = earliest.get(t)
                if cur is None or ts < cur[0]:
                    earliest[t] = (ts, src, strength, text.strip()[:90])

    print("EARLIEST DATED OCCURRENCE\n")
    w = max(len(t) for t in terms)
    found = 0
    for t in terms:
        if t in earliest:
            ts, src, strength, snip = earliest[t]
            found += 1
            print(f"{t.ljust(w)}  {ts.date()}  {strength:<14}  {src}")
            print(f"{' ' * w}  {snip}")
        else:
            print(f"{t.ljust(w)}  not found in these archives")
    print(f"\n{found} of {len(terms)} terms located.")
    print()
    print("A term not found here was not necessarily absent then. It means it")
    print("is not in the archives you supplied — nothing more. And a")
    print(f"'{STRONG}' date is stronger evidence than a '{WEAK}' one,")
    print("because you could not have written it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
