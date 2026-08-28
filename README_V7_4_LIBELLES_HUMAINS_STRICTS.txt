PMA / PTA 2026 — V7.4 — EXECUTION_COMPTABLE — LIBELLÉS HUMAINS STRICTS

Correction principale :
- Le dictionnaire XLSForm dictionnaire.xlsx est chargé directement par execution_comptable.js.
- Pour un code comme A3124, le libellé du dictionnaire est prioritaire sur les champs heuristiques.
- Les identifiants techniques (UUID, hash, identifiants Kobo comme v6DxRmrMp38PcxaHmMXB5W) sont rejetés comme libellés.
- La résolution utilise en priorité la clé liste XLSForm + code, puis un fallback générique uniquement si le code n'a qu'un libellé non ambigu dans choices.
- Exemple attendu : A3124 — Redynamiser l'encadrement pédagogique.
- Les titres de champs peuvent reprendre le libellé de la feuille survey quand il est disponible.

Déploiement recommandé : remplacer tout le contenu du ZIP sur GitHub Pages, attendre la fin du déploiement, puis Ctrl+F5.
