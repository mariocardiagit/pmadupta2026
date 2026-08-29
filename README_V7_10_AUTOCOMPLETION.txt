PMA / PTA 2026 — V7.10 — AUTOCOMPLÉTION DYNAMIQUE
Date : 29/08/2026

ÉVOLUTION PRINCIPALE
- Transformation des champs DREN, CISCO, ZAP, Activité et Produit en champs de recherche avec autocomplétion dynamique.
- Les propositions sont construites uniquement à partir de la base Kobo/JSON actuellement chargée.
- DREN → CISCO → ZAP : suggestions hiérarchiques tenant compte des champs déjà saisis.
- Activité : suggestions tenant compte de DREN/CISCO/ZAP.
- Produit : suggestions tenant compte de DREN/CISCO/ZAP et de l'Activité saisie.
- Recherche possible par code, texte, libellé ou saisie approximative grâce au moteur Fuzzy Search / Levenshtein existant.
- Navigation clavier : Flèche haut/bas, Entrée, Échap.
- Le nombre de lignes correspondant à chaque proposition est affiché.
- Lorsque le dictionnaire Kobo/XLSForm fournit un libellé pour un code, ce libellé peut être affiché dans la liste de propositions.
- La saisie libre reste autorisée si aucune proposition n'est choisie.

CONSERVÉ DE V7.9
- Correction des listes de l'onglet Analyse.
- Jour, Semaine, Mois, Trimestre, Semestre, Année.
- Zoom temporel + / -.
- Données détaillées / cumulées.
- Types de graphiques multiples.
- Affichage groupé / individuel.
- Top 5 / 10 / 20 / Toutes.
- Dates de début et de fin.
- Exports liés à la sélection active.

SOURCES KOBO CONSERVÉES
- PMA/PTA principal : ath6cv2NrXEUijffeKJqSf
- EXECUTION_COMPTABLE : aC5pu7oNANnbwEuv4mpeEo

DÉPLOIEMENT
1. Remplacer de préférence tous les fichiers du dépôt GitHub Pages par ceux du ZIP V7.10.
2. Attendre la fin du déploiement GitHub Pages.
3. Faire Ctrl+F5 dans le navigateur.
