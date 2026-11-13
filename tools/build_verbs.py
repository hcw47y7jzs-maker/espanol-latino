"""Construit packs/es-419/verbs.json à partir de l'export Anki (source/anki_seed.json).

Usage : python3 tools/build_verbs.py
"""
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PACK = ROOT / "packs" / "es-419"
seed = json.loads((PACK / "source" / "anki_seed.json").read_text(encoding="utf-8"))

# Personnes normalisées : yo, tu, vos, el (él/ella/usted), nos, uds (ustedes/ellos)
P = ["yo", "tu", "vos", "el", "nos", "uds"]
MAP = {
    "yo": ["yo"], "que yo": ["yo"],
    "tú": ["tu"], "vos": ["vos"], "tú / vos": ["tu", "vos"], "que tú / vos": ["tu", "vos"],
    "él / ella / usted": ["el"], "que él / ella / usted": ["el"], "usted": ["el"],
    "nosotros/as": ["nos"], "que nosotros/as": ["nos"],
    "ustedes / ellos": ["uds"], "que ustedes / ellos": ["uds"], "ustedes": ["uds"],
}
TENSES = {  # clé source -> clé pack
    "present": "presente", "preterito": "preterito", "imperfecto": "imperfecto",
    "futuro": "futuro", "condicional": "condicional", "imperativo": "imperativo",
    "subj_presente": "subj_presente", "subj_imperfecto": "subj_imperfecto",
}

ranks = {}
for w in seed["vocabulary"]:
    if w["pos"] == "verbe":
        ranks.setdefault(w["es"].lower(), w["rank"])

def level(rank, irregular):
    if rank is None:
        return "C2" if irregular else "C1"
    return "A1" if rank <= 500 else "A2" if rank <= 1000 else "B1" if rank <= 2000 else "B2"

out = []
for v in seed["verbs"]:
    inf = v["infinitive"]
    irr = v["irregularity"]
    irregular = not irr.startswith("Régulier")
    t = {}
    for src, key in TENSES.items():
        if src not in v["tenses"]:
            continue
        row = [None] * 6
        for f in v["tenses"][src]["forms"]:
            form = f["form"].strip()
            alt = re.match(r"^(\S+) \(ou (\S+)\)$", form)
            if alt:  # « vamos (ou vayamos) » -> « vamos|vayamos » (deux réponses acceptées)
                a, b = alt.groups()
                form = a if (inf, b) == ("ver", "mirá") else f"{a}|{b}"  # « mirá » vient de mirar
            for p in MAP[f["person"].strip()]:
                row[P.index(p)] = form
        t[key] = row
    np = {f["person"]: f["form"] for f in v["tenses"]["no_personales"]["forms"]}
    # sens : le champ fr de la source contient parfois la traduction ; l'irrégularité contient « · sens » en suffixe
    meaning = v["fr"]
    m = re.search(r" · (.+)$", irr)
    if m:
        suffix = m.group(1)
        meaning = f"{v['fr']} (verbe impersonnel)" if suffix.startswith("verbe impersonnel") else suffix
        irr = irr[: m.start()]
    # Étiquettes plus précises pour les verbes « réguliers » à particularité orthographique.
    if not irregular:
        pres = t["presente"]
        if inf == "errar":
            irr, irregular = "Irrégulier : e → ye (yerro, yerras)", True
        elif inf.endswith(("ger", "gir")) and pres[0].endswith("jo"):
            irr, irregular = f"Changement orthographique : g devient j devant a et o ({pres[0]}, {t['subj_presente'][0]})", True
        elif inf.endswith(("cer", "cir")) and pres[0].endswith("zo"):
            irr, irregular = f"Changement orthographique : c devient z devant a et o ({pres[0]}, {t['subj_presente'][0]})", True
        elif any(ch in pres[0] for ch in "íú") and not any(ch in inf for ch in "íú"):
            irr, irregular = f"Accent écrit sur le {'í' if 'í' in pres[0] else 'ú'} au singulier et à ustedes ({pres[0]}, {pres[3]})", True
    rank = ranks.get(inf)
    out.append({
        "inf": inf, "fr": meaning, "irr": irr, "reg": not irregular,
        "rank": rank, "lvl": level(rank, irregular),
        "ger": np.get("gérondif"), "part": np.get("participe passé"),
        "t": t,
    })

out.sort(key=lambda x: (x["rank"] is None, x["rank"] or 0, x["inf"]))
(PACK / "verbs.json").write_text(json.dumps({"persons": P, "verbs": out}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
from collections import Counter
print(len(out), "verbes", Counter(x["lvl"] for x in out))
