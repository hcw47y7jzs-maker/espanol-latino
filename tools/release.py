"""Prépare une nouvelle version : met à jour version.js et la liste des fichiers mis en cache (precache.js).

Usage : python3 tools/release.py
Après un push sur GitHub, l'app propose « Mettre à jour » au prochain lancement.
"""
import datetime, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP_DIRS = {".git", ".github", "tools", "tests", "source", "src", "node_modules"}
SKIP_FILES = {"package.json", "README.md", ".gitignore", "sw.js", ".nojekyll"}

files = ["./"]
for p in sorted(ROOT.rglob("*")):
    rel = p.relative_to(ROOT)
    if p.is_dir() or any(part in SKIP_DIRS for part in rel.parts) or rel.name in SKIP_FILES or rel.name.startswith("."):
        continue
    if "audio" in rel.parts:  # les audios se mettent en cache à la première écoute
        continue
    files.append("./" + rel.as_posix())

(ROOT / "precache.js").write_text("self.PRECACHE = " + json.dumps(files, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")

vfile = ROOT / "version.js"
today = datetime.date.today().isoformat()
n = 1
if vfile.exists():
    old = vfile.read_text().split('"')[1]
    if old.startswith(today):
        n = int(old.split("-")[-1]) + 1 if old.count("-") == 3 else 2
vfile.write_text(f'self.APP_VERSION = "{today}-{n}";\n', encoding="utf-8")
print("version", f"{today}-{n}", "—", len(files), "fichiers en cache")
