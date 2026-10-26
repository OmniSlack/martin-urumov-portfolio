# keynes-beauty-contest-sim

**Kind:** simulation (Node.js ≥ 18, zero dependencies) · **Status:** model, not measurement · **Date:** 2026-09-19; English copy with one correction 2026-10-26

## Purpose

Keynes (1936, *The General Theory*, ch. 12) compared professional investment to a newspaper contest: pick the six prettiest faces from a hundred photographs, and the prize goes to whoever comes closest to the average choice. You win by anticipating what the average opinion expects the average opinion to be, not by picking the prettiest faces. Economists made this measurable as the **p-beauty contest**: everyone names a number from 0 to 100, and the winner is the one closest to p × the average (here p = 2/3).

This file asks one question: **how many levels of "they think that I think…" should you reason?** Its answer is that this is not a number. It depends on who the other players are.

## How it works

- **The ladder.** A level-k player names 50·(2/3)^k: level 0 names 50, level 1 names 33.333, level 2 names 22.222, and level 11 names 0.578. The limit of the ladder, the Nash equilibrium, is 0.
- **Crowds.** Five crowds are written down as shares of players at each level. `play()` computes their average and the target (2/3 of the average), then picks the level that misses by the least.
- **Repeated game.** The crowd climbs one level per round for 8 rounds. You pick one level and keep it for all rounds. The file measures your mean error and your worst error, and both winners are reported because they answer different questions.

## How to run

```bash
node keynes_beauty_contest.js     # the full report
node --test                       # 6 tests pinning every number below
```

## Evidence

| Claim | Command | Observed 2026-10-26 (Node v22.23.4) |
|---|---|---|
| Ladder 50 → 33.333 → 22.222 → … → 0.578; Nash 0 | `node --test` | pinned |
| Against the "real people" crowd, the target is 17.593 and level 3 wins (misses by 2.778) | `node keynes_beauty_contest.js` | pinned |
| Winning level per crowd: novices → 1, "real people" → 3, players who have played → 4, theorists → 10, half naive / half deep → 3 | same | pinned |
| Repeated game (8 rounds, climb 1): best mean is level 5.75 (mean 4.248), best worst is level 4.25 (worst 8.669). The "level 3.5 on both counts" that earlier stood in a comment does not survive being computed. | same | pinned |
| The English copy computes exactly what the original computed | `evidence/2026-10-26/BASELINE.txt` vs `AFTER.txt` | all 109 numbers identical |
| 6/6 tests | `node --test` | `evidence/2026-10-26/TESTS.txt` |

## Findings (2026-10-26)

| # | What | Status |
|---|---|---|
| 1 | **A false sentence in the output.** The original printed "equilibrium misses by 17.593 — worse than level 0". Level 0 misses by 32.407, so the equilibrium is *closer* than level 0. It loses to every finite level from 1 to 11. | **Corrected**, in the printed line and in the header comment. The numbers are unchanged. A test now pins the true comparison. |
| 2 | **The "real people (Nagel 1995)" crowd is not Nagel's data.** It is an assumed distribution with mean 26.39 (target 17.593), and 25 % of it sits at level 3 or deeper. Nagel (1995) reports a first-period mean of **36.73** for p = 2/3 (target 24.49). She also reports that only **6–10 %** of choices are at step 3 or higher. Against her reported mean, **level 2 wins**, not level 3. | **Not changed in the code**, so the original numbers stay comparable. It is recorded here and pinned by a test ("with Nagel's reported first-period mean level 2 wins"). The label in the code is kept for byte-identical output; read it as "assumed, after Nagel". |
| 3 | **An uncomputed claim was dropped.** The original header also said that a 27-configuration sweep (3 crowds × 3 lengths × 3 learning rates) gave a fractional best-worst level in 14 of 27. No code for that sweep exists, so the claim is not carried here. | Removed from the header and noted. |
| 4 | The original said that writing "3" would lose "by nine levels" against theorists. Theorists' winning level is 10, so the gap is seven. | Corrected in the header comment. |

Findings 1–4 were made by the AI assistant during the 2026-10-26 reproduction. The literature check used Nagel (1995), *American Economic Review* 85(5), "Unraveling in Guessing Games" (first-period means 27.05 / 36.73 / 60.12 for p = 1/2, 2/3, 4/3), and the chapter-12 passage of Keynes (1936).

## Limitations

- **This is a model, not a measurement.** The crowds are assumed distributions. The repeated-game rule (everyone climbs exactly one level per round, capped at 11) is an assumption. Change the climb rate or the number of rounds and the winning level moves. The functions take both as parameters for that reason.
- The level-k ladder starts at 50 (a uniform level-0 player). Other anchors give other ladders.
- No real participant data is used.

## Provenance

See [`PROVENANCE.md`](PROVENANCE.md). Source: `verify/keynes.js` in OmniSlack/omniecho-core at `848ae1a`. The Bulgarian comments are translated. Brand references are removed. Numbers and logic are unchanged except Finding 1, which changes text only.

## Contribution

- Martin Urumov: posed the question, and proposed "3.5, after the game turns over", which the repeated-game model then tested and did not confirm.
- AI assistants: the model, the code, the tests, the translation, and the findings above.
