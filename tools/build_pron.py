"""Construit le module Prononciation : packs/es-419/pron.json + leçons (packs/es-419/lessons/pron/*.md).

Sources : packs/es-419/pron_src/pNN-*.md (en-tête « --- » puis la leçon), la banque de mots du
vocabulaire et des verbes, les phrases d'exemple des expressions.
Pour chaque mot : découpage en syllabes, syllabe accentuée, sons travaillés (étiquettes de leçon).
Usage : python3 tools/build_pron.py
"""
import json, pathlib, re, sys, unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
PACK = ROOT / "packs" / "es-419"
SRC = PACK / "pron_src"
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

# ---------------------------------------------------------------- syllabes

STRONG = set("aeoáéóíú")          # í, ú accentués comptent comme fortes (hiatus)
WEAK = set("iuü")
VOWELS = STRONG | WEAK
ACCENTED = set("áéíóú")
INSEPARABLE = {"pr", "br", "tr", "dr", "cr", "gr", "fr", "kr", "pl", "bl", "cl", "gl", "fl", "kl"}


def units(word):
    """Découpe en unités : digrammes ch, ll, rr, qu/gu (devant e, i) comptent pour une consonne."""
    w, out, i = word, [], 0
    while i < len(w):
        two = w[i:i + 2]
        if two in ("ch", "ll", "rr"):
            out.append(two); i += 2; continue
        if two in ("qu", "gu") and i + 2 < len(w) and w[i + 2] in "eéií":
            out.append(two); i += 2; continue
        c = w[i]
        # y = voyelle en fin de mot après voyelle (hoy, muy) ou seule (y)
        if c == "y" and (i == len(w) - 1) and (i > 0 and w[i - 1] in VOWELS):
            out.append("Y"); i += 1; continue
        out.append(c); i += 1
    return out


def is_v(u):
    return u in VOWELS or u == "Y"


def strong(u):
    return u in STRONG


def split_nucleus(vs):
    """Sépare une suite de voyelles en noyaux (diphtongues, hiatus)."""
    groups, cur = [], [vs[0]]
    for v in vs[1:]:
        prev = cur[-1]
        if strong(prev) and strong(v):
            groups.append(cur); cur = [v]
        else:
            cur.append(v)
            # au plus trois voyelles (triphtongue faible-forte-faible)
            if len(cur) == 3 and not (not strong(cur[0]) and strong(cur[1]) and not strong(cur[2])):
                groups.append(cur[:2]); cur = [cur[2]]
    groups.append(cur)
    # deux fortes dans un même groupe après coupe impossible ; vérifie faible+faible ok
    return groups


def syllabify(word):
    u = units(word.lower())
    # repère noyaux et consonnes
    segs = []  # liste de ("V", [voyelles]) ou ("C", [consonnes])
    for x in u:
        kind = "V" if is_v(x) else "C"
        if kind == "C" and x == "h" and segs and segs[-1][0] == "V":
            # h muet entre voyelles : on le garde comme consonne (a-hí, pro-hi-bir)
            pass
        if segs and segs[-1][0] == kind:
            segs[-1][1].append(x)
        else:
            segs.append((kind, [x]))
    # éclate les suites de voyelles en noyaux
    seq = []
    for kind, xs in segs:
        if kind == "V":
            gs = split_nucleus(xs)
            for k, g in enumerate(gs):
                if k:
                    seq.append(("C", []))
                seq.append(("V", g))
        else:
            seq.append(("C", xs))
    syl, onset = [], []
    i = 0
    if seq and seq[0][0] == "C":
        onset = seq[0][1]; i = 1
    while i < len(seq):
        kind, xs = seq[i]
        assert kind == "V", word
        cur = onset + xs
        nxt = seq[i + 1][1] if i + 1 < len(seq) else []
        has_more = i + 2 < len(seq)
        if not has_more:
            cur += nxt
            syl.append(cur); break
        n = len(nxt)
        cons = [c for c in nxt]
        if n == 0:
            coda, onset = [], []
        elif n == 1:
            coda, onset = [], cons
        elif n == 2:
            pair = "".join(cons).replace("Y", "y")
            if pair in INSEPARABLE:
                coda, onset = [], cons
            else:
                coda, onset = cons[:1], cons[1:]
        elif n == 3:
            last2 = "".join(cons[1:])
            if last2 in INSEPARABLE:
                coda, onset = cons[:1], cons[1:]
            else:
                coda, onset = cons[:2], cons[2:]
        else:
            coda, onset = cons[:2], cons[2:]
        syl.append(cur + coda)
        i += 2
    return ["".join(s).replace("Y", "y") for s in syl]


def stress_index(word, syls):
    for k, s in enumerate(syls):
        if any(c in ACCENTED for c in s):
            return k
    if len(syls) == 1:
        return 0
    last = word[-1].lower()
    if last in "aeiouns":
        return len(syls) - 2
    return len(syls) - 1


def _selftest():
    cases = {
        "casa": "ca-sa", "perro": "pe-rro", "ciudad": "ciu-dad", "país": "pa-ís", "día": "dí-a",
        "maestro": "ma-es-tro", "instante": "ins-tan-te", "obstruir": "obs-truir", "hoy": "hoy",
        "muy": "muy", "queso": "que-so", "guitarra": "gui-ta-rra", "pingüino": "pin-güi-no",
        "ahora": "a-ho-ra", "leer": "le-er", "camión": "ca-mión", "chocolate": "cho-co-la-te",
        "calle": "ca-lle", "atlas": "at-las", "hablar": "ha-blar", "estoy": "es-toy", "rey": "rey",
        "continúo": "con-ti-nú-o", "continuo": "con-ti-nuo", "buey": "buey", "aéreo": "a-é-re-o",
        "construir": "cons-truir", "transporte": "trans-por-te", "ayer": "a-yer", "averiguáis": "a-ve-ri-guáis",
    }
    for w, exp in cases.items():
        got = "-".join(syllabify(w))
        assert got == exp, f"{w}: {got} != {exp}"
    st = {"casa": 0, "ciudad": 1, "camión": 1, "música": 0, "hablan": 0, "reloj": 1, "estoy": 1, "papá": 1, "examen": 1}
    for w, k in st.items():
        assert stress_index(w, syllabify(w)) == k, w


_selftest()

# ---------------------------------------------------------------- étiquettes de sons


def tags_for(w):
    t = set()
    if "rr" in w or w.startswith("r") or re.search(r"[nls]r", w):
        t.add("rr")
    elif re.search(r"[aeiouáéíóú]r[aeiouáéíóú]", w):
        t.add("rr")  # r simple entre voyelles : utile pour l'opposition
    if "ll" in w or re.search(r"y[aeiouáéíóú]", w):
        t.add("lly")
    if "z" in w or re.search(r"c[eiéí]", w):
        t.add("ssz")
    if "j" in w or re.search(r"g[eiéí]", w):
        t.add("jg")
    if re.search(r"[bv]", w) or re.search(r"[aeiouáéíóú]d[aeiouáéíóú]|d$", w):
        t.add("bvd")
    if re.search(r"ch|ñ|x", w):
        t.add("chnx")
    syl = syllabify(w)
    def nvow(s):
        s = re.sub(r"(?<=[qg])u(?=[eéií])", "", s)
        return sum(1 for c in s if c in VOWELS) + (1 if s.endswith("y") and len(s) > 1 and s[-2] in VOWELS else 0)
    if any(nvow(s) >= 2 for s in syl) or re.search(r"[aeoá][íú]|[íú][aeoá]", w):
        t.add("diph")
    return t


# ---------------------------------------------------------------- leçons

lessons, errors = [], []
for path in sorted(SRC.glob("p*.md")):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        errors.append(f"{path.name} : en-tête manquant"); continue
    head, body = m.groups()
    meta = {}
    for line in head.splitlines():
        k, _, v = line.partition(":")
        meta[k.strip()] = v.strip()
    groups = lambda s: [[x.strip() for x in g.split(",") if x.strip()] for g in s.split("|") if g.strip()]
    les = {
        "id": meta["id"], "level": meta["level"], "title": meta["title"], "es": meta["es"], "tag": meta["tag"],
        "pairs": groups(meta.get("pairs", "")), "same": groups(meta.get("same", "")),
        "sentences": [s.strip() for s in meta.get("sentences", "").split("|") if s.strip()],
        "md": f"lessons/pron/{meta['id']}.md",
    }
    if les["level"] not in LEVELS:
        errors.append(f"{path.name} : niveau {les['level']}")
    for g in les["pairs"] + les["same"]:
        if len(g) < 2 or len(set(g)) != len(g):
            errors.append(f"{path.name} : groupe {g}")
    lessons.append(les)
    out = PACK / les["md"]
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(body.strip() + "\n", encoding="utf-8")

# ---------------------------------------------------------------- banque de mots

vocab = json.loads((PACK / "vocab.json").read_text(encoding="utf-8"))["words"]
verbs = json.loads((PACK / "verbs.json").read_text(encoding="utf-8"))["verbs"]
bank = {}
WORD = re.compile(r"[a-záéíóúñü]+")


def add(w, lvl, src, rank=None, extra=()):
    w = w.strip().lower()
    if not WORD.fullmatch(w):
        return
    if w in bank:
        b = bank[w]
        if LEVELS.index(lvl) < LEVELS.index(b["lvl"]):
            b["lvl"] = lvl
        b["tags"] = sorted(set(b["tags"]) | set(extra))
        return
    syl = syllabify(w)
    bank[w] = {"w": w, "syl": syl, "st": stress_index(w, syl), "lvl": lvl, "src": src, "tags": sorted(tags_for(w) | set(extra))}
    if rank:
        bank[w]["rank"] = rank


for v in vocab:
    es = re.sub(r"^el/la\s+", "", v["es"])
    add(es, v["lvl"], "vocab", v.get("rank"))
for v in verbs:
    add(v["inf"], v.get("lvl", "B1"), "verbe", v.get("rank"))
for v in verbs:
    pres = v["t"].get("presente") or []
    imp = v["t"].get("imperativo") or []
    for f in (pres[2] if len(pres) > 2 else None, imp[2] if len(imp) > 2 else None):
        if f:
            for x in f.split("|"):
                add(x, "B2", "vos", None, ("vos",))
for les in lessons:
    for g in les["pairs"] + les["same"]:
        for w in g:
            add(w, les["level"], "paire", None, (les["tag"],))

# Accent écrit : variantes fautives (accent placé sur une autre syllabe, ou retiré).
ACC = {"a": "á", "e": "é", "i": "í", "o": "ó", "u": "ú"}
PLAIN = {v: k for k, v in ACC.items()}


def strip_acc(w):
    return "".join(PLAIN.get(c, c) for c in w)


def accent_on(syls, k):
    s = syls[k]
    s0 = re.sub(r"(?<=[qg])u(?=[eéií])", "_", s)  # le u de que/gui n'est pas une voyelle
    pos = [i for i, c in enumerate(s0) if c in "aeo"]
    if not pos:
        pos = [i for i, c in enumerate(s0) if c in "iu"]
        pos = pos[-1:]
    if not pos:
        return None
    i = pos[-1] if len(pos) > 1 else pos[0]
    out = list(syls)
    out[k] = s[:i] + ACC[s[i]] + s[i + 1:]
    return "".join(out)


for b in bank.values():
    syl = b["syl"]
    if len(syl) < 2:
        continue
    bare = strip_acc(b["w"])
    bare_syl = syllabify(bare)
    if len(bare_syl) != len(syl):
        continue  # hiatus accentué (día, país) : la variante sans accent change de découpage
    if bare != b["w"] and stress_index(bare, bare_syl) == b["st"]:
        continue  # accent purement diacritique (cómo / como) : pas d'exercice
    alts = []
    if bare != b["w"]:
        alts.append(bare)
    plain_syl = [strip_acc(x) for x in syl]
    for k in sorted(range(len(syl)), key=lambda k: abs(k - b["st"])):
        if k == b["st"]:
            continue
        v = accent_on(plain_syl, k)
        if v and v != b["w"] and v not in alts:
            alts.append(v)
    if bare == b["w"]:
        v = accent_on(plain_syl, b["st"])  # accent écrit inutile sur la bonne syllabe
        if v and v != b["w"]:
            alts.insert(1, v)
    if alts:
        b["alt"] = alts[:2]

# Phrases à répéter : celles des leçons + les exemples des expressions.
sentences = []
for les in lessons:
    for s in les["sentences"]:
        sentences.append({"s": s, "lvl": les["level"], "lesson": les["id"]})
expr = json.loads((PACK / "expressions.json").read_text(encoding="utf-8"))["items"]
for e in expr:
    if len(e["ex"]) <= 90 and not e["ex"].startswith("—"):
        sentences.append({"s": e["ex"], "lvl": e["lvl"], "lesson": None, "fr": e["exFr"]})

for st in sentences:
    toks = re.findall(r"[a-záéíóúñü]+", st["s"].lower())
    st["tags"] = sorted({t for tok in toks for t in tags_for(tok)} - {"diph"} | ({"diph"} if sum("diph" in tags_for(t) for t in toks) >= 2 else set()))

if errors:
    print("\n".join(errors)); sys.exit(1)

words = sorted(bank.values(), key=lambda b: (LEVELS.index(b["lvl"]), b.get("rank", 99999), b["w"]))
data = {"lessons": lessons, "words": words, "sentences": sentences}
(PACK / "pron.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
from collections import Counter
print(f"{len(lessons)} leçons, {len(words)} mots, {len(sentences)} phrases -> packs/es-419/pron.json")
print("mots par niveau :", dict(Counter(w["lvl"] for w in words)))
print("mots par son :", dict(Counter(t for w in words for t in w["tags"])))
