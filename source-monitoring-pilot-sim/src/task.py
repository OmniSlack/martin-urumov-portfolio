"""Source-monitoring task with encoding phase + COUNTERBALANCED item source.

CANDIDATE. Revision (per PILOT_A__INDEPENDENT_CODE_VERIFICATION_v1): item source
is counterbalanced across participants via two inverse lists (A / B). Every item
therefore appears as BOTH perceived_external and imagined_internal across
participants, removing the item/source confound in which a specific word would
always carry one source. Each participant still sees a 50/50 external/internal
split. Assignment list and block-specific seed are locked and recorded on every
trial row.
"""

import random
from . import config


def _item_bank(prefix, n):
    # Placeholder neutral concrete-noun tokens (real study: matched neutral nouns).
    return [f"{prefix}_{i:03d}" for i in range(n)]


TEST_ITEMS = _item_bank("noun_test", config.N_TEST_TRIALS)
PRACTICE_ITEMS = _item_bank("noun_prac", config.N_PRACTICE_TRIALS)


def build_counterbalanced_lists(seed, items):
    """Return {'A': map, 'B': inverse_map} of item_id -> encoding_source.

    List A: group1 -> perceived_external, group2 -> imagined_internal.
    List B: the exact inverse of List A.
    Deterministic under `seed`. Each list keeps a 50/50 source split.
    """
    rng = random.Random(seed)
    shuffled = list(items)
    rng.shuffle(shuffled)
    half = len(shuffled) // 2
    g1 = set(shuffled[:half])
    list_a = {it: ("perceived_external" if it in g1 else "imagined_internal") for it in items}
    list_b = {it: ("imagined_internal" if it in g1 else "perceived_external") for it in items}
    return {"A": list_a, "B": list_b}


def encoding_cue(encoding_source: str) -> str:
    return "SHOW_WORD" if encoding_source == "perceived_external" else "IMAGINE_WORD"


def build_participant_trials(participant_id, condition, list_assignment, hit_p, fa_p,
                             seed, test_source_seed, practice_source_seed):
    """Generate practice + test trials for one participant under a given list.

    list_assignment: "A" or "B" (counterbalancing list).
    test_source_seed / practice_source_seed: block-specific seeds; the seed that
    actually generated each block is recorded on that block's rows.
    """
    rng = random.Random(seed)
    test_map = build_counterbalanced_lists(test_source_seed, TEST_ITEMS)[list_assignment]
    prac_map = build_counterbalanced_lists(practice_source_seed, PRACTICE_ITEMS)[list_assignment]

    rows = []

    def make_block(items, source_of, practice, block_seed):
        order = list(items)
        rng.shuffle(order)
        for idx, item in enumerate(order):
            enc = source_of[item]
            truth_external = 1 if enc == "perceived_external" else 0
            p_ext = hit_p if truth_external == 1 else fa_p
            resp_external = 1 if rng.random() < p_ext else 0
            correct = 1 if resp_external == truth_external else 0
            if correct:
                confidence = rng.choices([1, 2, 3, 4], weights=[10, 20, 35, 35])[0]
            else:
                confidence = rng.choices([1, 2, 3, 4], weights=[35, 35, 20, 10])[0]
            rt = int(round(2.718281828 ** rng.gauss(6.4, 0.30)))
            rows.append({
                "participant_id": participant_id,
                "condition": condition,
                "list_assignment": list_assignment,
                "item_id": item,
                "encoding_source": enc,
                "encoding_cue": encoding_cue(enc),
                "source_truth": truth_external,
                "response_source": "external" if resp_external == 1 else "internal",
                "response_external": resp_external,
                "correct": correct,
                "confidence": confidence,
                "reaction_time_ms": rt,
                "practice_trial": 1 if practice else 0,
                "item_order": idx,
                "source_assignment_seed": block_seed,   # actual block-specific seed
            })

    make_block(PRACTICE_ITEMS, prac_map, practice=True, block_seed=practice_source_seed)
    make_block(TEST_ITEMS, test_map, practice=False, block_seed=test_source_seed)
    return rows
