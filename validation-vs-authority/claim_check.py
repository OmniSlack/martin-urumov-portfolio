#!/usr/bin/env python3
"""
claim_check — проверява твърденията В документите срещу файловата система.

ЧЕТИРИТЕ ВЪПРОСА, ОТГОВОРЕНИ ОТ САМИЯ ИНСТРУМЕНТ
=================================================

КОЙ СЪМ:
    Скрипт. Нямам памет, нямам мнение, нямам власт. Чета текст и файлове,
    смятам хешове, броя редове. Това е всичко, което съм.

КАК РАБОТЯ:
    Изваждам от markdown само твърдения, които МОГАТ да бъдат проверени
    механично:
      - SHA-256 отпечатък до име на файл
      - препратка `път:ред` или `път:ред-ред`
    После отивам на диска и проверявам всяко поотделно.

КАК ПРОЦЕДИРАМ:
    Три статуса, никога слети:
      VERIFIED     — проверих и е вярно
      FAILED       — проверих и не е вярно
      UNCHECKABLE  — НЕ МОГА да проверя това статично
    Броят тестове ("77 pass") винаги е UNCHECKABLE. Документ, който твърди,
    че тестове минават, не е доказателство, че минават. Само повторно
    изпълнение е.

КАКВО VERIFIED НЕ ЗНАЧИ:
    Значи „отпечатъкът съвпада". И нищо повече. Файл от чисти нули има
    напълно валиден SHA-256 — манифест на унищожени файлове минава ред по ред
    със зелено, и всеки ред е верен. Затова има втора, отделна ос:
      HOLLOW      — хешът съвпада, но файлът е празен от информация
      MISLABELED  — сигнатурата противоречи на разширението
    Флагът не сменя статуса. Двата отговора са на различни въпроси и се
    държат разделени, както VERIFIED и UNCHECKABLE се държат разделени.

КАК СЕ ДЪРЖА НА ПОЛЕ:
    Exit 0 — няма FAILED.
    Exit 1 — има поне едно FAILED.
    UNCHECKABLE никога не вдига exit код, но винаги се брои и се показва.
    HOLLOW и MISLABELED също не вдигат exit код по подразбиране — твърдението
    за хеша си е вярно. С `--strict-content` вдигат.
    Не поправям документи. Не пиша никъде освен в JSON отчета, който сам
    си поискал. Никакво мрежово действие.

Без външни зависимости. Стандартна библиотека.

    python claim_check.py --root . --json report.json 12_SOURCE.md
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

VERIFIED = "VERIFIED"
FAILED = "FAILED"
UNCHECKABLE = "UNCHECKABLE"

# ─────────────────────────────────────────────────────────────────────────────
# КАКВО ХЕШЪТ НЕ КАЗВА
# ─────────────────────────────────────────────────────────────────────────────
# Файл от чисти нули има напълно валиден SHA-256. Ако манифест твърди точно
# този отпечатък, сравнението е вярно и статусът VERIFIED е верен. Хешът
# отговаря на „файлът е това, което манифестът обявява" — и на нищо повече.
# Не отговаря на „файлът съдържа каквото и да било".
#
# Затова манифест на унищожени файлове минава ред по ред със зелено.
# Срещнато на практика: Recovery-2026-08-24, три възстановени chunk файла от
# чисти нули с един и същ отпечатък.
#
# Поправката НЕ е да се смени статусът. VERIFIED си остава верен и смяната му
# на FAILED би била втора невярност в обратната посока. Поправката е втора,
# отделна ос: какво Е файлът, независимо дали хешът съвпада. Двата отговора
# се държат разделени, както VERIFIED и UNCHECKABLE се държат разделени.
HOLLOW = "HOLLOW"          # хешът съвпада, но вътре няма информация
MISLABELED = "MISLABELED"  # сигнатурата противоречи на разширението

# Сигнатури — редът има значение, по-дългите първи.
_MAGIC = [
    (b"\x89PNG\r\n\x1a\n", "png"), (b"SQLite format 3\x00", "sqlite"),
    (b"\xff\xd8\xff", "jpg"), (b"GIF8", "gif"), (b"%PDF-", "pdf"),
    (b"PK\x03\x04", "zip"), (b"\x1f\x8b", "gz"), (b"\x00asm", "wasm"),
    (b"OggS", "ogg"), (b"RIFF", "riff"), (b"fLaC", "flac"),
    (b"ID3", "mp3"), (b"MZ", "exe"), (b"\x7fELF", "elf"),
    (b"\x00\x01\x00\x00", "ttf"), (b"OTTO", "otf"), (b"wOFF", "woff"),
    (b"\x37\x7f\x06\x82", "sqlite-wal"), (b"\x37\x7f\x06\x83", "sqlite-wal"),
]
# Разширения, за които сигнатурата е задължителна. Формати без стабилен magic
# (txt, md, json, js, py, css, html, toml, br …) нарочно липсват: липсата на
# сигнатура там не е дефект и не бива да вдига MISLABELED.
_EXT_EXPECTS = {
    "png": {"png"}, "jpg": {"jpg"}, "jpeg": {"jpg"}, "gif": {"gif"},
    "pdf": {"pdf"}, "zip": {"zip"}, "gz": {"gz"}, "wasm": {"wasm"},
    "sqlite": {"sqlite"}, "db": {"sqlite"}, "exe": {"exe"}, "dll": {"exe"},
    "ttf": {"ttf"}, "otf": {"otf"}, "woff": {"woff"},
    "ogg": {"ogg"}, "flac": {"flac"}, "mp3": {"mp3"},
}

_SNIFF = 1 << 16  # колко байта стигат за сигнатура и за преценка за празнота


def sniff(path: Path) -> tuple[str, str | None]:
    """Какво Е файлът: (етикет, флаг HOLLOW/MISLABELED или None).

    Не отваря въпроса дали хешът съвпада — това е другата ос.
    """
    try:
        with path.open("rb") as f:
            head = f.read(_SNIFF)
        size = path.stat().st_size
    except OSError as e:
        return f"не се чете: {e}", None

    if size == 0:
        return "празен файл", HOLLOW
    if not head.strip(b"\x00"):
        # прочетеното е само нули; при малък файл това е целият файл
        if size <= _SNIFF:
            return "изцяло нулеви байтове", HOLLOW
        return "нулеви байтове в началото", HOLLOW

    found = next((n for m, n in _MAGIC if head.startswith(m)), None)
    ext = path.suffix.lstrip(".").lower()
    expected = _EXT_EXPECTS.get(ext)
    if expected and found not in expected:
        got = found or f"няма позната сигнатура ({head[:4].hex()})"
        return f".{ext} обявено, а е {got}", MISLABELED
    return found or "текст/неопределен", None

# 64 hex + по-късно име на файл на същия ред (манифест или таблица)
_SHA_LINE = re.compile(r"\b([0-9a-fA-F]{64})\b")
_FILENAME_ON_LINE = re.compile(r"[\w./\\-]+\.[A-Za-z0-9]{1,8}")

# `path.ext:12` или `path.ext:12-34`  (в backticks, за да не хващаме проза)
_FILE_LINE_REF = re.compile(
    r"`([\w./\\-]+\.[A-Za-z0-9]{1,8}):(\d+)(?:\s*[-–]\s*(\d+))?`"
)

# твърдения за брой тестове — винаги UNCHECKABLE
_TEST_COUNT = re.compile(
    r"\b(\d+)\s*(?:/\s*\d+\s*)?(?:pass(?:ing|ed)?|тест\w*|tests?)\b", re.IGNORECASE
)


@dataclass
class Claim:
    kind: str
    raw: str
    document: str
    line_no: int
    status: str
    detail: str
    target: str | None = None
    # Пълната стойност, преди `raw` да бъде отрязана за четимост. За sha256 това
    # е целият 64-символен отпечатък. Сравнения се правят САМО по това поле:
    # отрязан до 16 символа отпечатък прави два различни хеша неразличими, а
    # неразличими хеши са тихо съгласие там, където има спор.
    full: str | None = None
    # Втората ос: какво Е файлът. Независима от `status`, който казва само
    # дали отпечатъкът съвпада. VERIFIED + HOLLOW е напълно възможно и точно
    # то е случаят, който хешът сам по себе си пропуска.
    content: str | None = None
    flag: str | None = None


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def find_file(root: Path, name: str) -> Path | None:
    """Точно съвпадение първо; после по базово име, но само ако е еднозначно."""
    direct = (root / name).resolve()
    try:
        if direct.is_file() and str(direct).startswith(str(root.resolve())):
            return direct
    except OSError:
        pass
    base = Path(name).name
    hits = [p for p in root.rglob(base) if p.is_file()]
    if len(hits) == 1:
        return hits[0]
    return None  # 0 намерени, или двусмислено -> не гадаем


def check_sha(root: Path, digest: str, line: str, doc: str, ln: int) -> Claim:
    digest = digest.lower()
    candidates = [c for c in _FILENAME_ON_LINE.findall(line) if not re.fullmatch(r"[0-9a-fA-F.]+", c)]
    if not candidates:
        return Claim("sha256", digest[:16] + "…", doc, ln, UNCHECKABLE,
                     "на реда няма име на файл до отпечатъка", None, digest)
    for name in candidates:
        path = find_file(root, name)
        if path is None:
            continue
        try:
            actual = sha256_of(path)
        except OSError as e:
            return Claim("sha256", digest[:16] + "…", doc, ln, UNCHECKABLE,
                         f"файлът не се чете: {e}", str(path), digest)
        what, flag = sniff(path)
        if actual == digest:
            detail = "отпечатъкът съвпада"
            if flag == HOLLOW:
                detail += " — но файлът е празен от информация"
            elif flag == MISLABELED:
                detail += " — но файлът не е това, което името обещава"
            return Claim("sha256", digest[:16] + "…", doc, ln, VERIFIED,
                         detail, str(path), digest, what, flag)
        return Claim("sha256", digest[:16] + "…", doc, ln, FAILED,
                     f"очакван {digest[:16]}… , реален {actual[:16]}…",
                     str(path), digest, what, flag)
    return Claim("sha256", digest[:16] + "…", doc, ln, UNCHECKABLE,
                 f"файлът не е намерен под root: {candidates[0]}", None, digest)


def check_file_line(root: Path, name: str, start: int, end: int | None,
                    doc: str, ln: int) -> Claim:
    ref = f"{name}:{start}" + (f"-{end}" if end else "")
    path = find_file(root, name)
    if path is None:
        return Claim("file_line", ref, doc, ln, UNCHECKABLE,
                     "файлът не е намерен под root")
    try:
        with path.open("rb") as f:
            total = sum(1 for _ in f)
    except OSError as e:
        return Claim("file_line", ref, doc, ln, UNCHECKABLE, f"не се чете: {e}", str(path))
    need = end or start
    if need <= total:
        return Claim("file_line", ref, doc, ln, VERIFIED,
                     f"файлът има {total} реда", str(path))
    return Claim("file_line", ref, doc, ln, FAILED,
                 f"сочи ред {need}, а файлът има {total}", str(path))


def scan(doc_path: Path, root: Path) -> list[Claim]:
    claims: list[Claim] = []
    doc = doc_path.name
    text = doc_path.read_text(encoding="utf-8", errors="replace")
    for ln, line in enumerate(text.splitlines(), 1):
        for digest in _SHA_LINE.findall(line):
            claims.append(check_sha(root, digest, line, doc, ln))
        for name, start, end in _FILE_LINE_REF.findall(line):
            claims.append(check_file_line(root, name, int(start),
                                          int(end) if end else None, doc, ln))
        for count in _TEST_COUNT.findall(line):
            claims.append(Claim("test_count", f"{count} tests", doc, ln, UNCHECKABLE,
                                "броят тестове изисква повторно изпълнение на пакета"))
    return claims


def main(argv=None) -> int:
    # Windows конзолата по подразбиране не е UTF-8 и чупи кирилицата.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass

    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("docs", nargs="+", help="markdown документи за проверка")
    ap.add_argument("--root", default=".", help="корен, спрямо който се търсят файловете")
    ap.add_argument("--json", dest="json_out", help="запиши JSON отчет тук")
    ap.add_argument("--strict-content", action="store_true",
                    help="вдигни exit код и при HOLLOW/MISLABELED, не само при FAILED")
    args = ap.parse_args(argv)

    root = Path(args.root).resolve()
    all_claims: list[Claim] = []
    for d in args.docs:
        p = Path(d)
        if not p.is_file():
            print(f"[!] няма такъв документ: {d}", file=sys.stderr)
            return 2
        all_claims.extend(scan(p, root))

    counts = {VERIFIED: 0, FAILED: 0, UNCHECKABLE: 0}
    flags = {HOLLOW: 0, MISLABELED: 0}
    for c in all_claims:
        counts[c.status] += 1
        if c.flag:
            flags[c.flag] += 1

    for c in all_claims:
        mark = {VERIFIED: "OK  ", FAILED: "FAIL", UNCHECKABLE: "??  "}[c.status]
        print(f"{mark} {c.document}:{c.line_no}  {c.kind:<10} {c.raw:<28} {c.detail}")
        # втората ос се печата на свой ред, за да не се слее със статуса
        if c.flag:
            print(f"     ^ {c.flag}: {c.content}")

    print("-" * 78)
    print(f"VERIFIED {counts[VERIFIED]} · FAILED {counts[FAILED]} · "
          f"UNCHECKABLE {counts[UNCHECKABLE]} · общо {len(all_claims)}")
    if flags[HOLLOW] or flags[MISLABELED]:
        print(f"HOLLOW {flags[HOLLOW]} · MISLABELED {flags[MISLABELED]} "
              f"— отпечатъкът съвпада, съдържанието не оправдава зеленото")

    if args.json_out:
        report = {
            "root": str(root),
            "documents": args.docs,
            "counts": counts,
            "flags": flags,
            "claims": [asdict(c) for c in all_claims],
            "note": "UNCHECKABLE не е PASS. Документ не доказва себе си. "
                    "VERIFIED значи само, че отпечатъкът съвпада — виж flags.",
        }
        Path(args.json_out).write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"JSON отчет: {args.json_out}")

    if counts[FAILED]:
        return 1
    if args.strict_content and (flags[HOLLOW] or flags[MISLABELED]):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
