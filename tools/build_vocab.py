"""Construit packs/es-419/vocab.json : les 3 000 mots du paquet Anki + les listes C1/C2 (vocab_src/).

- Niveaux A1–B2 par rang de fréquence (repères : tailles de vocabulaire par niveau de Milton & Alexiou).
- C1 : faux amis ; C2 : mots d'Argentine à la place des mots d'Espagne.
- Pour chaque mot : traduction courte (affichée dans les QCM) et réponses françaises acceptées.
Usage : python3 tools/build_vocab.py
"""
import json, pathlib, re, sys, unicodedata
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
PACK = ROOT / "packs" / "es-419"
seed = json.loads((PACK / "source" / "anki_seed.json").read_text(encoding="utf-8"))

LOT = 50
BANDS = [("A1", 750), ("A2", 1500), ("B1", 2250), ("B2", 3000)]


def level_for(rank):
    for lvl, top in BANDS:
        if rank <= top:
            return lvl
    return "B2"


def clean_fr(fr: str):
    """« voiture (Mexique, Esp.) ; ailleurs en AL : auto, carro » -> court « voiture », acceptées [voiture]."""
    segs = [s.strip() for s in fr.split(";")]
    accepted, short = [], None
    for k, seg in enumerate(segs):
        if any(c in seg for c in ':="«»') or re.search(r"\b(AL|Esp|Mex|Arg)\b", seg):
            continue
        seg = re.sub(r"\([^)]*\)", "", seg).strip(" ,.")
        if not seg:
            continue
        parts = [p.strip(" .") for p in re.split(r",|/", seg) if p.strip(" .")]
        if short is None:
            short = ", ".join(parts[:2])
        accepted += parts
    if not short:  # tout était entre parenthèses ou annoté : on garde le premier segment brut
        short = re.sub(r"\([^)]*\)", "", segs[0]).strip(" ,.") or segs[0]
        accepted = [short]
    # « m. ressemblance » (sens du nom) -> « ressemblance »
    abbr = r"^(m|f|adv|adj|v|n|fam|pl)\.\s+"
    accepted = [re.sub(abbr, "", a) for a in accepted]
    short = re.sub(abbr, "", short)
    seen, out = set(), []
    for a in accepted:
        if a and a.lower() not in seen:
            seen.add(a.lower())
            out.append(a)
    return short, out


words = []
for v in seed["vocabulary"]:
    short, acc = clean_fr(v["fr"])
    g = {"m.": "m", "f.": "f", "m./f.": "mf"}.get(v["gender"])
    words.append({
        "id": f"w{v['rank']}", "rank": v["rank"], "es": v["es"], "art": v["article"], "g": g,
        "fr": short, "frAll": acc, "frFull": v["fr"], "pos": v["pos"], "lvl": level_for(v["rank"]),
    })


def read_extra(name, lvl, kind):
    out = []
    for ln, line in enumerate((PACK / "vocab_src" / name).read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        es, fr, note = [x.strip() for x in line.split(" | ")]
        m = re.match(r"^(el|la|los|las|un) (.+)$", es)
        art, word = (m.group(1), m.group(2)) if m and m.group(1) != "un" else (None, es)
        g = {"el": "m", "la": "f", "los": "m", "las": "f"}.get(art)
        acc = [a.strip() for a in fr.split("/")]
        slug = unicodedata.normalize("NFD", word).encode("ascii", "ignore").decode().replace(" ", "-")
        out.append({
            "id": f"{kind}-{slug}", "rank": None, "es": word, "art": art, "g": g, "fr": acc[0] if len(acc[0]) < 28 else acc[0][:28],
            "frAll": acc, "frFull": fr.replace(" / ", ", "), "pos": "nom" if art else "mot", "lvl": lvl, "note": note, "kind": kind,
        })
    return out


words += read_extra("c1-faux-amis.txt", "C1", "fa")
words += read_extra("c2-argentina.txt", "C2", "ar")

# Lots de 50 mots par niveau, dans l'ordre de fréquence
lots, counters = [], Counter()
for w in words:
    lvl = w["lvl"]
    n = counters[lvl] // LOT
    counters[lvl] += 1
    lot_id = f"{lvl}-{n + 1}"
    w["lot"] = lot_id
    if not lots or lots[-1]["id"] != lot_id:
        lots.append({"id": lot_id, "lvl": lvl, "n": 0, "first": w["es"], "title": None})
    lots[-1]["n"] += 1
for lot in lots:
    members = [w for w in words if w["lot"] == lot["id"]]
    ranks = [w["rank"] for w in members if w["rank"]]
    lot["title"] = f"Mots {min(ranks)} à {max(ranks)}" if ranks else ("Faux amis" if lot["lvl"] == "C1" else "Mots d'Argentine")

errors = []
ids = Counter(w["id"] for w in words)
errors += [f"identifiant en double : {k}" for k, n in ids.items() if n > 1]
for w in words:
    if not w["fr"] or not w["frAll"]:
        errors.append(f"traduction vide : {w['es']}")

(PACK / "vocab.json").write_text(json.dumps({"lots": lots, "words": words}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(len(words), "mots,", len(lots), "lots", dict(Counter(w["lvl"] for w in words)))
if errors:
    print("\n".join(errors))
    sys.exit(1)
