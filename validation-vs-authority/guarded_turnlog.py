#!/usr/bin/env python3
"""
guarded_turnlog — обещанието, превърнато в конструкция.

ПОВОД
=====
15.09.2026: пуснах `turnlog.py END` без предварително разкритие. Ти видя
суровата команда и я отказа. После обещах с думи: „занапред всяко записващо
действие идва първо като таблица."

Обещание с думи не е механизъм. Този модул го прави механизъм:

    turn_log.jsonl НЕ МОЖЕ да бъде записан без ExecutionTicket,
    а билет се издава само след пълно разкритие по Gate 9.

Тоест дори да „забравя" да покажа таблицата, записът няма да се случи —
защото няма как да се случи без билета, а билетът минава през разкритието.

ЩО Е ПЪЛНО РАЗКРИТИЕ (Gate 9, MASTER PROTOCOL v0.4)
===================================================
    target · effect · scope · bytes · reversibility · payload hash
Това са полетата, които НЕ ти дадох преди отказа.

ЧЕСТНА ГРАНИЦА
==============
Същата като при execution_ticket: това не е криптографска невъзможност.
Който бръкне в частните имена на модула, може да пише директно. Твърдението
е: заобикалянето е видимо и не се случва по невнимание.
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from execution_ticket import ExecutionTicket, TicketError, request_digest, _MINT

LOG = Path(__file__).with_name("turn_log.jsonl")


def _payload(kind: str, note: str) -> dict:
    t = datetime.now(timezone.utc).astimezone()
    prev_delta = None
    if LOG.exists():
        rows = [l for l in LOG.read_text(encoding="utf-8").splitlines() if l.strip()]
        if rows:
            prev = json.loads(rows[-1])
            prev_delta = round(
                (t - datetime.fromisoformat(prev["ts"])).total_seconds(), 3)
    return {"ts": t.isoformat(), "kind": kind.upper(), "note": note,
            "delta_prev_s": prev_delta}


def disclose(kind: str, note: str) -> tuple[dict, str, str]:
    """Пълното разкритие ПРЕДИ действието. Не пише нищо."""
    payload = _payload(kind, note)
    line = json.dumps(payload, ensure_ascii=False) + "\n"
    blob = line.encode("utf-8")
    digest = hashlib.sha256(blob).hexdigest()

    rows_before = 0
    if LOG.exists():
        rows_before = sum(1 for l in LOG.read_text(encoding="utf-8").splitlines() if l.strip())

    print("┌─ ЗАЯВКА ЗА ЗАПИС ─────────────────────────────────────────")
    print(f"│ target        : {LOG.name}")
    print(f"│ action        : APPEND (добавяне на един ред)")
    print(f"│ scope         : 1 ред · {len(blob)} байта")
    print(f"│ файл сега     : {rows_before} реда")
    print(f"│ файл след     : {rows_before + 1} реда")
    print(f"│ reversibility : НЕОБРАТИМО — append-only по дизайн")
    print(f"│ rollback      : няма; само нов ред, който отрича предишния")
    print(f"│ network       : няма")
    print(f"│ payload sha256: {digest}")
    print("│ ─ точното съдържание ─")
    for k, v in payload.items():
        print(f"│   {k:<13}: {v}")
    print("└───────────────────────────────────────────────────────────")
    return payload, line, digest


def issue_ticket(kind: str, note: str, *, human_says_yes: bool):
    """Билет се издава САМО при изрично човешко да. Няма подразбиране.

    Връща и самия payload. Това не е удобство: билетът е издаден върху ТОЗИ
    payload и е валиден само за него. Повикващият няма право да си сглоби
    нов — `_payload` слага нов `ts` при всяко повикване, а различен ts значи
    различен digest. Точно това правеше CLI-то: разкриваше един ред, а
    подаваше за запис друг.
    """
    payload, line, digest = disclose(kind, note)
    if not human_says_yes:
        print("РЕЗУЛТАТ: няма разрешение → билет НЕ е издаден → нищо не е записано.")
        return None, line, payload
    return ExecutionTicket(_MINT, request_digest(
        target=LOG.name, action="append", scope="turnlog", payload=payload),
        "guarded_turnlog"), line, payload


def append(ticket, line: str, payload: dict):
    """Пише САМО срещу валиден билет за точно този payload."""
    if not isinstance(ticket, ExecutionTicket):
        raise TicketError(
            "turn_log.jsonl не приема запис без ExecutionTicket. "
            "Няма път за директно дописване."
        )
    expected = request_digest(target=LOG.name, action="append",
                             scope="turnlog", payload=payload)
    ticket._consume(expected)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line)
    print(f"ЗАПИСАНО: 1 ред в {LOG.name}")
    return payload


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass
    kind = sys.argv[1] if len(sys.argv) > 1 else "END"
    # флагът се маха от аргументите, а не от готовия текст: `.replace` върху
    # бележката оставяше „--yes" в payload-а, подаден за запис.
    yes = "--yes" in sys.argv[2:]
    note = " ".join(a for a in sys.argv[2:] if a != "--yes")
    ticket, line, payload = issue_ticket(kind, note, human_says_yes=yes)
    if ticket is None:
        sys.exit(3)
    # същият payload, върху който е издаден билетът — не пресметнат наново
    append(ticket, line, payload)
