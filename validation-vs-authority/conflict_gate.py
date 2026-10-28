#!/usr/bin/env python3
"""
conflict_gate — задържа противоречието, вместо да избере удобния източник.

ЗАЩО СЪЩЕСТВУВА
===============
KOMPAS канонът, §19: „Core запазва и подкрепящото, и противоречащото
доказателство. Не избира тихо удобния източник. Ако е неразрешено:
AMBIGUOUS / HOLD."

Това е точно поведението, което един обикновен скрипт НЕ прави. Обикновеният
скрипт взима последния запис, или първия, или „по-новия" — и с това мълчаливо
решава спор, който няма право да реши.

Тук два документа, които твърдят различен SHA-256 за един и същ файл, дават
CONFLICT. CONFLICT не се разрешава от:
    - по-нова дата на документа
    - мнозинство (три документа срещу един)
    - authority на документа (заглавие CANON, VERIFIED, FINAL)
    - реда на подаване на файловете

Единственият изход от CONFLICT е нов факт отвън: реалният файл на диска.
Ако файлът е наличен, инструментът казва кой документ е прав — но пак не
„решава" спора, а го замества с измерване.

КАКВО ТОВА НЕ Е
===============
Това не е „решаване на математически парадокс". Логическите парадокси
(Ръсел, Гьодел) не се решават от код и не се твърди, че се решават. Тук
става дума за едно точно нещо: несъвместими твърдения се удържат живи,
вместо да бъдат смачкани до едно.

    python conflict_gate.py --root . doc_a.md doc_b.md
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

import claim_check as cc

CONFLICT = "CONFLICT"
AGREED = "AGREED"
SINGLE = "SINGLE"

EXIT_OK = 0
EXIT_FAILED = 1
EXIT_CONFLICT = 3


# Само от този detail може да се извади име на файл: `check_sha` го записва
# след двоеточието. Всеки друг UNCHECKABLE detail е изречение, не цел.
_NOT_FOUND_PREFIX = "файлът не е намерен под root:"


def target_of(claim):
    """Името на файла, за който е твърдението — или None, ако няма такова.

    Твърдение без цел НЕ влиза в adjudication. По-ранна версия използваше
    `detail.split(":")[-1]` като резервен ключ; за detail без двоеточие това
    връщаше цялото изречение и събираше несвързани твърдения в една група,
    която после даваше фалшив CONFLICT.
    """
    if claim.target:
        return Path(claim.target).name
    if claim.detail.startswith(_NOT_FOUND_PREFIX):
        name = claim.detail[len(_NOT_FOUND_PREFIX):].strip()
        return Path(name).name if name else None
    return None


def group_sha_claims(claims):
    """Групира SHA-256 твърденията по име на файл, за който се отнасят."""
    by_target = defaultdict(list)
    for c in claims:
        if c.kind != "sha256":
            continue
        key = target_of(c)
        if key is None:
            continue  # няма цел -> няма с какво да се сравнява
        by_target[key].append(c)
    return by_target


def adjudicate(target: str, claims: list, root: Path) -> dict:
    # по пълния отпечатък, не по отрязания за печат `raw` — виж Claim.full
    digests = {c.full for c in claims}
    docs = sorted({f"{c.document}:{c.line_no}" for c in claims})

    if len(claims) == 1:
        return {"target": target, "verdict": SINGLE, "digests": sorted(digests),
                "sources": docs, "resolution": None}

    if len(digests) == 1:
        return {"target": target, "verdict": AGREED, "digests": sorted(digests),
                "sources": docs,
                "resolution": {"note": "съгласие между източници — не е независимо "
                                       "потвърждение, ако произходът им е общ"}}

    # несъгласие. НЕ избираме.
    resolution = None
    path = cc.find_file(root, target)
    if path is not None:
        try:
            resolution = {
                "measured_file": str(path),
                "measured_sha256": cc.sha256_of(path),
                "note": "спорът не е разрешен по документи, а заменен с измерване",
            }
        except OSError as e:
            # Файлът е там, но не се чете. Това НЕ е разрешение на спора —
            # CONFLICT остава отворен, само причината е друга.
            resolution = {"measured_file": str(path), "measured_sha256": None,
                          "note": f"файлът не се чете: {e}"}
    return {"target": target, "verdict": CONFLICT, "digests": sorted(digests),
            "sources": docs, "resolution": resolution}


def main(argv=None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass

    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("docs", nargs="+")
    ap.add_argument("--root", default=".")
    ap.add_argument("--json", dest="json_out")
    args = ap.parse_args(argv)

    root = Path(args.root).resolve()
    claims = []
    for d in args.docs:
        p = Path(d)
        if not p.is_file():
            print(f"[!] няма такъв документ: {d}", file=sys.stderr)
            return 2
        claims.extend(cc.scan(p, root))

    verdicts = [adjudicate(t, cs, root) for t, cs in group_sha_claims(claims).items()]
    conflicts = [v for v in verdicts if v["verdict"] == CONFLICT]
    failed = [c for c in claims if c.status == cc.FAILED]

    for v in sorted(verdicts, key=lambda v: v["target"]):
        mark = {CONFLICT: "!!  ", AGREED: "==  ", SINGLE: "·   "}[v["verdict"]]
        n = len(v["digests"])
        print(f"{mark}{v['target']:<28} {v['verdict']:<9} "
              f"{n} {'отпечатък' if n == 1 else 'различни отпечатъка'} "
              f"от {len(v['sources'])} места")
        for s in v["sources"]:
            print(f"        ← {s}")
        if v["verdict"] == CONFLICT:
            measured = (v["resolution"] or {}).get("measured_sha256")
            if measured:
                print(f"        → измерено на диска: {measured[:16]}…")
                print("        → спорът е ЗАМЕСТЕН с измерване, не разрешен по документи")
            elif v["resolution"]:
                print(f"        → {v['resolution']['note']}. CONFLICT ОСТАВА ОТВОРЕН.")
            else:
                print("        → файлът не е наличен. CONFLICT ОСТАВА ОТВОРЕН.")

    print("-" * 78)
    print(f"CONFLICT {len(conflicts)} · FAILED {len(failed)} · общо цели {len(verdicts)}")

    if args.json_out:
        Path(args.json_out).write_text(json.dumps(
            {"root": str(root), "verdicts": verdicts,
             "note": "CONFLICT не се разрешава по дата, мнозинство или заглавие."},
            ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"JSON отчет: {args.json_out}")

    if conflicts:
        return EXIT_CONFLICT
    return EXIT_FAILED if failed else EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
