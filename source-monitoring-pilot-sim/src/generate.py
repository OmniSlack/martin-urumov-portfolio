"""Synthetic data generator for the five scenarios.

CANDIDATE / SYNTHETIC DATA ONLY. No real or personal participant data is ever
produced. Participant ids follow the synthetic pattern 'SYN-...'. Output is
trial-level, model-ready data plus participant-level manipulation-check fields.
"""

import random
import zlib
from . import config, task, sdt, manipulation_check as mc

DATA_PROVENANCE = "SYNTHETIC"


def _participant_id(scenario, condition, i):
    tag = "D" if condition == "decentering" else "C"
    return f"SYN-{scenario}-{tag}{i:03d}"


def generate_scenario(scenario_name, master_seed=None):
    """Return (trial_rows, mc_rows) for one scenario.

    trial_rows: list of trial dicts (with participant-level condition).
    mc_rows: list of (participant_id, condition, mc_fields_dict).
    """
    cfg = config.SCENARIOS[scenario_name]
    # Deterministic across processes: zlib.crc32 is stable (unlike hash() on str,
    # which is per-process randomized). Reproducibility is a hard requirement.
    base_seed = (master_seed or config.MASTER_SEED) ^ zlib.crc32(scenario_name.encode())
    meta_rng = random.Random(base_seed)
    # Block-specific counterbalancing seeds (identical lists across conditions).
    test_source_seed = base_seed
    practice_source_seed = base_seed + 1

    trial_rows = []
    mc_rows = []

    for condition in config.CONDITIONS:
        d_dp = cfg["d_dprime"] if condition == "decentering" else 0.0
        d_c = cfg["d_c"] if condition == "decentering" else 0.0
        for i in range(config.N_PER_GROUP):
            pid = _participant_id(scenario_name, condition, i)
            # counterbalancing list, balanced A/B within each condition
            list_assignment = "A" if i % 2 == 0 else "B"
            # latent per-participant SDT parameters (random intercept analogue)
            dprime_i = max(0.05, meta_rng.gauss(config.BASE_DPRIME + d_dp, config.SD_DPRIME))
            c_i = meta_rng.gauss(config.BASE_C + d_c, config.SD_C)
            hit_p, fa_p = sdt.latent_hit_fa(dprime_i, c_i)
            p_seed = meta_rng.randint(1, 2_000_000_000)
            rows = task.build_participant_trials(
                pid, condition, list_assignment, hit_p, fa_p, p_seed,
                test_source_seed, practice_source_seed
            )
            trial_rows.extend(rows)
            # manipulation-check fields
            mc_fields = mc.generate_participant_mc(condition, cfg, meta_rng)
            mc_rows.append((pid, condition, mc_fields))

    return trial_rows, mc_rows
