# Authority model

Who may do what. "Human" is the person who owns the goal; the other names are software components of this package.

- **Human** owns the goal, preferences, constraints, the final YES/NO, and the exact permit.
- **Human** and the **Core** (the proposal evaluator) analyse evidence, alternatives, risks and plans.
- A current, matching **Core CLEAR** is mandatory before any permit.
- Human YES with Core **HOLD** or **UNKNOWN** means **no action**.
- Core CLEAR without an exact Human permit means **no action**.
- A **Navigator** (planner) candidate analysis is not an accepted plan; Navigator coordination is not authority.
- **Execution Control** permits an action only when the exact permit, the current matching Core CLEAR and the current state all agree.
- The **Adapter** performs only the precisely permitted action.
- An **independent Verifier** checks the real result. `VERIFIED` is reachable only from `COMPLETED`, never from a report.

Severity of gate states: **STOP > HOLD > OPEN**. STOP is terminal; a later HOLD, or the resolution of a HOLD, cannot demote it.

Rewritten from the package's `CORE_REFERENCE.md` (2026-08-17) with the owner's name replaced by "Human" and the project's rule-set name replaced by "Core"; the rules are unchanged.
