---
name: distinguishing-observation
description: One trace from two different causes — and what to do then. Load at every empty result, every refusal (404, 403, 000, zero hits), every "doesn't work" or "there is no such thing", and before declaring any boundary or impossibility. Gives the DISTINGUISHING OBSERVATION rule, the ban on judging from one attempt, and the list of known cause pairs that leave identical traces.
---

# The distinguishing observation

Rules and quoted requirements: Martin Urumov. Wording of this skill: AI assistant.
The original is in `../../original-bg/razdelyashto/SKILL.md`.

Derived from §8 "Counter-Model" of the owner's design canon:

> **WHAT OBSERVATION WOULD DISTINGUISH THEM?**
> If the available evidence cannot distinguish them: **HOLD.**

---

## The rule

**An empty result is not a finding. It is TWO findings merged into one.**

Almost every empty result has at least two equally good origins — and they leave **identical traces**. Choosing between them looks like reading the evidence, but it is a **choice**, made silently, almost always in the convenient direction.

So:

```
REFUSAL or EMPTY
  ↓
which TWO causes give this trace?
  ↓
which OBSERVATION would separate them?
  ↓
available → make it
not available → HOLD, and name what is missing
```

**HOLD is not a refusal to think.** It is the name of a state that would otherwise be presented as knowledge.

---

## Known pairs

Each was met and measured, not listed from imagination.

| trace | cause A | cause B |
|---|---|---|
| `404` from GitHub | the repository does not exist | no access to it — **the API returns the same on purpose** |
| zero search hits | it is not there | **the expression is wrong** |
| a detector with zero alarms | nothing to catch | **it catches nothing** |
| an empty second-reviewer report | looked and found nothing | **did not look** |
| `403` on one address | no outbound network | **an allow-list without this address** |
| a test that passes | the rule holds | **the test checks nothing** |
| an empty answer to a question | there is no such thing | **not looked at** |
| a file that does not change | it is stable | **the generator does not see it** |

On the left is the convenient cause. **On the right is the one checked less often — and for exactly that reason met more often.**

---

## Two rules for the probe

**1 · One attempt does not describe a list.**

A measurement of **one** address, **one** input, **one** case gives a sentence about **that** case. Reported as a boundary it is `RULE_WITHOUT_SCOPE`.

> Measured: `example.com → 403` was recorded as "no outbound web access". Eight addresses later: GitHub, npm and PyPI pass; arXiv, doi.org and Wikipedia do not. The boundary was not a missing network but **an allow-list**.

**2 · One route does not exhaust the routes.**

Before declaring something impossible — **how many routes were tried?**

> Measured: three runs of `git push` were recorded as "cannot be fixed under any circumstances". The same session had GitHub tools that **were never called**. Three runs along one route look like rigour and cover a third of the question.

---

## When the trace is NOT ambiguous

Not every empty result is a HOLD. The trace is **unambiguous** when:

- the probe was run along **all** known routes, and all give the same;
- the probe method is known to **catch** the opposite (shown with a negative test — break it on purpose and see it fail);
- the cause is named, not only the result.

If one of the three is missing — **HOLD**, not "there is none".

---

## The form of the answer

```
TRACE          what was seen, verbatim
TWO CAUSES     A and B, both consistent with what was seen
DISTINGUISHING which observation would separate them
WHO DOES IT    me, or the human — and why
UNTIL THEN     HOLD · UNKNOWN · AMBIGUOUS, by name
```

Example, measured on 20 September 2026:

```
TRACE        list_branches for the repository → 404;
             the search returns 3 repositories, without it
TWO CAUSES   A: the repository does not exist
             B: it exists, but the app has no installation —
                GitHub returns 404 in both cases ON PURPOSE
DISTINGUISHING a THIRD independent list of repositories
WHO          I wrote "him — seconds; me — impossible from here"
             and found the third source MYSELF, minutes later
UNTIL THEN   AMBIGUOUS · UNKNOWN
```

⚠️ **THIS EXAMPLE CAUGHT ITS OWN AUTHOR.** The first version of the WHO line said that the distinguishing observation was impossible for me. That was false: `list_repos` — a third source — returned four repositories with write access, without it, and closed the 4-versus-3 mismatch (search excludes forks).

That is, **the rule was written and immediately broken in its own example.** It was the fifth repetition of one form within an hour, and it is the strongest argument for this skill: **knowing about the trap does not protect from the trap.**

The remaining boundary is narrow and is said: a **private** repository is not counted in `public_repos` and can be missing from all three lists. So the outcome is AMBIGUOUS, not "it does not exist" — the weight is 11 to 2, and the canon refuses to decide by weight.

---

## Why it is essential

Because **the convenient explanation arrives sooner than the true one** and looks exactly like it.

Three times in one day the same failure was explained as "run order", and all three times the explanation was wrong; it was closed with a line-by-line diff. An empty result from a wrong regular expression was nearly reported as the finding "the code contains nothing from the canon".

**The first explanation that fits is not verified — it is merely first.**

---

## What this skill does NOT do

⚪ It does not say which cause is true. It says only that it is **not yet known**, and names what would separate the two. If it is used to postpone thinking, it has become the opposite of itself: **`UNKNOWN ≠ STOP THINKING`**.
