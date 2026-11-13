# Aprender — espagnol d'Amérique latine

Application personnelle (web app installée sur l'écran d'accueil de l'iPhone) pour apprendre l'espagnol latino-américain, avec un accent sur l'Argentine du Nord (Salta).

**Adresse de l'app :** https://hcw47y7jzs-maker.github.io/espanol-latino/

## Installer sur l'iPhone

1. Ouvrir l'adresse ci-dessus dans **Safari**.
2. Bouton Partager, puis « Sur l'écran d'accueil ».
3. Ouvrir l'app depuis son icône. Elle fonctionne ensuite hors connexion.

## Organisation du code

```
index.html, manifest.webmanifest, sw.js   page d'entrée, installation, hors connexion
version.js, precache.js                    générés par tools/release.py
core/                                      moteur commun à toutes les langues
  app.js       démarrage, accueil, réglages, mises à jour
  router.js    navigation (#/chemin)
  store.js     données sur le téléphone (IndexedDB) + sauvegarde
  ui.js        petits composants d'interface
  md.js        affichage des leçons (Markdown)
  audio.js     lecture audio (fichiers du pack, sinon voix de l'appareil)
  check.js     comparaison des réponses
  timer.js     temps passé aujourd'hui
  styles.css   apparence
modules/verbs/                             module Verbes (engine.js = logique testée, index.js = écrans)
packs/es-419/                              le « pack de langue » espagnol
  pack.json    modules, personnes, temps, marqueurs de phrases
  lang.js      règles propres à la langue (conjugaison régulière, explications d'accent…)
  verbs.json   390 verbes conjugués (généré par tools/build_verbs.py)
  lessons/     leçons en Markdown
  source/      export du paquet Anki d'origine
tools/                                     scripts de génération
tests/                                     tests automatiques (node --test tests/*.test.mjs)
```

## Ajouter une langue

Créer `packs/<code>/` avec les mêmes fichiers (`pack.json`, `lang.js`, données, leçons), puis changer `PACK_ID` dans `core/app.js`. Le moteur et les modules ne contiennent rien de propre à l'espagnol.

## Publier une nouvelle version

```
node --test tests/*.test.mjs   # vérifier
python3 tools/release.py       # nouvelle version + liste des fichiers hors connexion
git commit -am "..." && git push
```

Au lancement suivant, l'app affiche « Mettre à jour ».

## Conventions des leçons

- `*texte*` : espagnol (italique, police à empattements, lu à voix haute au toucher)
- `**texte**` : mise en valeur en français
- Encadrés : `> [!argentine]`, `> [!astuce]`, `> [!piege]`
- Chaque leçon se termine par ses sources.

## Licences

Polices Alegreya et Alegreya Sans (Huerta Tipográfica) : SIL Open Font License, voir `assets/fonts/OFL.txt`.
