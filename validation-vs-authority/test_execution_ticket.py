"""
Тестове за затварянето на заобикалянето.

Всеки тест е един конкретен опит за байпас. Ако някой мине — периметърът е
препоръка, а не периметър.
"""
from datetime import datetime, timedelta, timezone
import unittest

from execution_ticket import (
    Adapter, ExecutionTicket, TicketIssuer, TicketError, request_digest,
)
from sidecar_validator_v3 import (
    SidecarValidatorV3, ExecutionControl, HumanPermit, RELEASE_TO_ADAPTER,
)

NOW = datetime(2026, 9, 15, 12, 0, tzinfo=timezone.utc)
ASK = dict(target="doc-1", action="write", scope="project-a")


def permit(**over):
    base = dict(target="doc-1", action="write", scope="project-a",
                granted_by="martin", expires_at=NOW + timedelta(hours=1))
    base.update(over)
    return HumanPermit(**base)


def issuer():
    ec = ExecutionControl(SidecarValidatorV3())
    return TicketIssuer(ec, lambda d: d.decision == RELEASE_TO_ADAPTER)


class TestBypassAttempts(unittest.TestCase):

    def setUp(self):
        self.adapter = Adapter()
        self.issuer = issuer()

    # --- байпас 1: извикай adapter директно -----------------------------
    def test_adapter_refuses_call_without_a_ticket(self):
        for junk in (None, True, "TICKET", 1, object(), {"ok": True}):
            with self.subTest(ticket=repr(junk)):
                with self.assertRaises(TicketError):
                    self.adapter.execute(junk, **ASK)
        self.assertEqual(self.adapter.performed, [])

    # --- байпас 2: направи си билет сам ---------------------------------
    def test_ticket_cannot_be_constructed_from_outside(self):
        d = request_digest(**ASK, payload=None)
        with self.assertRaises(TicketError):
            ExecutionTicket(object(), d, "me")
        with self.assertRaises(TicketError):
            ExecutionTicket(None, d, "me")

    # --- байпас 3: използвай валидатора, прескочи ExecutionControl ------
    def test_a_clean_validation_alone_yields_no_ticket(self):
        v = SidecarValidatorV3()
        decision = v.validate(m=0.0)
        self.assertTrue(decision.passed)          # математиката е чиста
        self.assertFalse(hasattr(decision, "ticket"))
        # и няма никакъв път от Decision към adapter
        with self.assertRaises(TicketError):
            self.adapter.execute(decision, **ASK)

    # --- байпас 4: вземи билет и го употреби втори път -------------------
    def test_ticket_is_single_use(self):
        ticket, _ = self.issuer.authorize(**ASK, permit=permit(), now=NOW)
        self.assertIsNotNone(ticket)
        self.adapter.execute(ticket, **ASK)
        with self.assertRaises(TicketError) as cm:
            self.adapter.execute(ticket, **ASK)
        self.assertIn("replay", str(cm.exception))
        self.assertEqual(len(self.adapter.performed), 1)

    # --- байпас 5: вземи билет за X, употреби го за Y --------------------
    def test_ticket_is_bound_to_the_exact_action(self):
        ticket, _ = self.issuer.authorize(**ASK, permit=permit(), now=NOW)
        with self.assertRaises(TicketError) as cm:
            self.adapter.execute(ticket, target="doc-1", action="delete_all",
                                 scope="project-a")
        self.assertIn("друго действие", str(cm.exception))
        self.assertEqual(self.adapter.performed, [])

    def test_ticket_is_bound_to_the_payload_too(self):
        ticket, _ = self.issuer.authorize(**ASK, payload={"n": 1},
                                          permit=permit(), now=NOW)
        with self.assertRaises(TicketError):
            self.adapter.execute(ticket, **ASK, payload={"n": 999})

    # --- байпас 6: без пермит, но с чиста математика ---------------------
    def test_no_permit_means_no_ticket_is_issued_at_all(self):
        ticket, decision = self.issuer.authorize(**ASK, permit=None, now=NOW)
        self.assertIsNone(ticket)
        self.assertIn("no_valid_human_permit", decision.reasons)

    def test_expired_permit_means_no_ticket(self):
        stale = permit(expires_at=NOW - timedelta(seconds=1))
        ticket, _ = self.issuer.authorize(**ASK, permit=stale, now=NOW)
        self.assertIsNone(ticket)

    def test_wrong_scope_permit_means_no_ticket(self):
        ticket, _ = self.issuer.authorize(**ASK, permit=permit(scope="other"), now=NOW)
        self.assertIsNone(ticket)

    # --- байпас 7: изключи валидатора, за да "мине" ----------------------
    def test_disabled_validator_yields_no_ticket(self):
        ec = ExecutionControl(SidecarValidatorV3(enabled=False))
        iss = TicketIssuer(ec, lambda d: d.decision == RELEASE_TO_ADAPTER)
        ticket, _ = iss.authorize(**ASK, permit=permit(), now=NOW)
        self.assertIsNone(ticket)

    # --- байпас 8: лоша математика + валиден пермит ----------------------
    def test_violation_with_valid_permit_yields_no_ticket(self):
        ticket, decision = self.issuer.authorize(**ASK, m=0.9, permit=permit(), now=NOW)
        self.assertIsNone(ticket)


class TestHappyPath(unittest.TestCase):

    def test_clean_math_plus_exact_permit_executes_exactly_once(self):
        adapter = Adapter()
        ticket, decision = issuer().authorize(**ASK, m=0.1, payload={"op": "append"},
                                              permit=permit(), now=NOW)
        self.assertIsNotNone(ticket)
        self.assertEqual(decision.decision, RELEASE_TO_ADAPTER)
        rec = adapter.execute(ticket, **ASK, payload={"op": "append"})
        self.assertEqual(rec["action"], "write")
        self.assertEqual(rec["issuer"], "ExecutionControl")
        self.assertTrue(ticket.consumed)
        self.assertEqual(len(adapter.performed), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
