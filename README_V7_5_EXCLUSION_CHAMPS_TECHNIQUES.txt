PMA / PTA 2026 — V7.5 — EXECUTION_COMPTABLE
Correction « row » / champs techniques — 28/08/2026

CORRECTION PRINCIPALE
- Le champ technique « row » n'est plus sélectionné automatiquement comme « Mesure comptable principale ».
- Les champs techniques de type row/index/id/uid/uuid et métadonnées Kobo comparables sont exclus des mesures analytiques.
- Si aucune vraie mesure comptable numérique n'est disponible/sélectionnée, le module utilise « Comptage des écritures » pour les graphiques temporels et de catégories.
- Exemple : avec 2 écritures, le graphique affiche désormais « Nombre d’écritures : 2 » au lieu de calculer row=1+2=3.

CONSERVÉ
- Libellés humains stricts issus de dictionnaire.xlsx (ex. A3124 — Redynamiser l'encadrement pédagogique).
- Filtres multicritères et Date/Heure.
- K-means, Jenks, DBSCAN, Système Expert, SBERT/TF-IDF, statistiques, anomalies/risques, Benford, prévision.
- Exports XLSX, CSV, JSON, HTML, PNG et Partage.
- Source Kobo EXECUTION_COMPTABLE préconfigurée : aC5pu7oNANnbwEuv4mpeEo.

MISE EN LIGNE
1. Remplacer de préférence tout le contenu du dossier GitHub Pages par les fichiers de ce ZIP.
2. Attendre la fin du déploiement GitHub Pages.
3. Faire Ctrl+F5 dans le navigateur.

NOTE
Le champ « row » reste visible dans les données brutes/filtrées s'il existe dans Kobo ; il est seulement exclu des mesures comptables analytiques afin d'éviter une interprétation trompeuse.
