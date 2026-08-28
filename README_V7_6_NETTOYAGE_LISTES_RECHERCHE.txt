V7.6 — EXECUTION_COMPTABLE — Nettoyage des listes de recherche
Date : 28/08/2026

Corrections principales :
- Exclusion des métadonnées Kobo purement techniques dans les listes Catégorie, Libellé complémentaire, Référence/pièce et IA sémantique.
- Exclusion également des champs techniques dans les filtres numériques.
- Conservation volontaire des champs métier utiles dont le nom contient "index", par exemple activite_dren_index et date_execution_index.
- __version__, row, UUID, instanceID, submissionID, xform_id_string, validation_status, submitted_by, etc. ne sont plus proposés comme choix métier lorsqu'ils ne sont pas pertinents.
- Le bouton Appliquer continue d'utiliser les critères réellement sélectionnés et recalcule l'ensemble du module.
- Les analyses numériques continuent d'exclure les champs techniques comme row/index purs.

Fichiers à publier ensemble sur GitHub Pages :
- tableau_bord_kobo.html
- execution_comptable.js
- execution_comptable.css
- app.js
- style.css
- semantic.js
- dictionnaire.xlsx
- fichiers SUIVI_IOV_SPSSE_*
