PMA / PTA 2026 — V7.8 — CARTOGRAPHIE DES RÉALISATIONS PROCHES À 3 MODES
Date : 28/08/2026

ÉVOLUTION DEMANDÉE
La « Cartographie des réalisations proches » possède désormais trois sous-onglets, pour DREN, CISCO, ZAP et STD :

1. Avec l'utilisation de l'IA Sémantique Sentence-BERT (Réponses Synthétisées)
   - regroupement sémantique par thématique ;
   - comparaison numérique à l'intérieur des thématiques.

2. Avec l'utilisation de l'IA Sémantique Sentence-BERT (Réponses Plus détaillées)
   - détails des regroupements ;
   - similarités, formulations originales, entités et valeurs.

3. Sans l'utilisation de l'IA Sémantique Sentence-BERT
   - restauration permanente de l'ancienne cartographie ;
   - aucune fusion sémantique de libellés différents ;
   - comparaison seulement pour la même valeur exacte de la dimension sélectionnée ;
   - conservation du seuil numérique de proximité ;
   - ancien graphique + tableau récapitulatif.

CORRECTION TECHNIQUE
La cartographie historique dispose maintenant de son propre canvas Chart.js, de sa propre légende et de son propre tableau. L'analyse Sentence-BERT ne peut plus l'écraser.

FICHIERS PRINCIPAUX MODIFIÉS
- tableau_bord_kobo.html
- app.js
- style.css

semantic.js reste inclus et inchangé dans son fonctionnement Sentence-BERT V7.7.
