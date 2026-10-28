"""
execution_ticket — затваря заобикалянето на периметъра.

ДЕФЕКТЪТ, КОЙТО ТОВА ПОПРАВЯ
============================
Във `sidecar_validator_v3` ExecutionControl изискваше пермит — но нищо не
задължаваше повикващия да мине през него:

    d = validator.validate(...)      # заобикаля ExecutionControl изцяло
    if d.passed: adapter.run(...)    # и действа

Портата гледаше само това, което някой доброволно ѝ подаде. Това не е периметър,
а препоръка. Същият клас дефект като `.allowed` във v2, само едно ниво по-нагоре:
кой решава кои действия минават през портата.

ПОПРАВКАТА
==========
Adapter не приема аргументи, а БИЛЕТ. Билетът:
  - може да бъде издаден единствено от ExecutionControl (частен ключ на модула)
  - е вързан към точното действие (target+action+scope+payload дайджест)
  - е еднократен; втора употреба е отказана
  - не може да бъде конструиран отвън — публичният конструктор отказва

Така „извикай adapter-а директно" не е път, защото adapter-ът няма какво да
приеме.

ЧЕСТНА ГРАНИЦА НА ТВЪРДЕНИЕТО
=============================
Това НЕ е криптографска невъзможност. Повикващ в същия процес, който умишлено
бърка в частните имена на модула или monkey-patch-ва класа, може да фабрикува
билет. Твърдението, което издържа, е по-слабо и точно:

    заобикалянето изисква умишлено пипане на частни имена,
    което е видимо при преглед на кода и не се случва по невнимание.

Разликата между „невъзможно" и „невъзможно по невнимание" е реална и я пазя.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field

# Частен ключ на модула. Няма публичен път до него.
_MINT = object()


class TicketError(Exception):
    pass


def request_digest(*, target: str, action: str, scope: str, payload=None) -> str:
    blob = json.dumps(
        {"target": target, "action": action, "scope": scope, "payload": payload},
        sort_keys=True, ensure_ascii=False, default=str,
    )
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


class ExecutionTicket:
    """Неподправяем (по невнимание) еднократен билет за точно едно действие."""

    __slots__ = ("_digest", "_consumed", "_issuer")

    def __init__(self, _mint, digest: str, issuer: str):
        if _mint is not _MINT:
            raise TicketError(
                "ExecutionTicket не може да бъде конструиран отвън. "
                "Билети се издават единствено от ExecutionControl."
            )
        self._digest = digest
        self._consumed = False
        self._issuer = issuer

    @property
    def digest(self) -> str:
        return self._digest

    @property
    def consumed(self) -> bool:
        return self._consumed

    def _consume(self, expected_digest: str) -> None:
        if self._consumed:
            raise TicketError("билетът вече е използван (replay)")
        if self._digest != expected_digest:
            raise TicketError(
                f"билетът е издаден за друго действие: "
                f"{self._digest[:12]}… ≠ {expected_digest[:12]}…"
            )
        self._consumed = True

    def __repr__(self):
        state = "consumed" if self._consumed else "valid"
        return f"<ExecutionTicket {self._digest[:12]}… {state} by={self._issuer}>"


@dataclass
class Adapter:
    """Изпълнителят. Не приема нищо освен билет."""

    performed: list = field(default_factory=list)

    def execute(self, ticket, *, target: str, action: str, scope: str, payload=None):
        if not isinstance(ticket, ExecutionTicket):
            raise TicketError(
                "adapter приема само ExecutionTicket. "
                "Няма път за директно изпълнение без билет."
            )
        expected = request_digest(target=target, action=action, scope=scope, payload=payload)
        ticket._consume(expected)          # вдига при replay или несъответствие
        record = {"target": target, "action": action, "scope": scope,
                  "digest": expected, "issuer": ticket._issuer}
        self.performed.append(record)
        return record


class TicketIssuer:
    """Обвивка около произволен gate, която превръща 'разрешено' в билет.

    Подава се готовото решение на ExecutionControl. Ако решението не е
    освобождаващо, билет НЕ се издава — няма частичен билет, няма билет
    „с предупреждение".
    """

    def __init__(self, execution_control, released_predicate, name="ExecutionControl"):
        self._ec = execution_control
        self._released = released_predicate
        self._name = name

    def authorize(self, *, target: str, action: str, scope: str, payload=None, **kw):
        decision = self._ec.request(target=target, action=action, scope=scope,
                                    payload=payload, **kw)
        if not self._released(decision):
            return None, decision
        digest = request_digest(target=target, action=action, scope=scope, payload=payload)
        return ExecutionTicket(_MINT, digest, self._name), decision
