PMA / PTA 2026 — V7.9 — CORRECTION DES LISTES DE L’ONGLET ANALYSE
Date : 2026-08-29

ANOMALIES CONFIRMÉES DANS V7.8
- « Type de données » existait dans le HTML mais n’était pas lu par le moteur de rendu.
- « Type de graphique » existait dans le HTML mais le JavaScript forçait toujours Chart.js en type « line ».
- « Affichage groupé / individuel » existait dans le HTML mais n’était pas géré dans le moteur de rendu.
- Les boutons Zoom + / Zoom - n’avaient aucun gestionnaire d’événement.
- Trimestre, Semestre et Année étaient proposés dans la liste, mais le calcul des buckets ne gérait réellement que Jour, Semaine et Mois.
- La bannière Période / Données / Organisation / Graphique restait désynchronisée.

CORRECTIONS V7.9
1. Périodes réellement fonctionnelles : Jour, Semaine, Mois, Trimestre, Semestre, Année.
2. Zoom + et Zoom - synchronisés avec la période d’agrégation.
3. Données détaillées et Données cumulées réellement appliquées aux séries temporelles.
4. Types de graphiques opérationnels : Courbes, Barres, Barres empilées, Aires, Barres horizontales, Circulaire, Anneau, Histogramme, Radar.
5. Affichage groupé et Affichage individuel réellement opérationnels.
6. En individuel : recherche DREN/CISCO/ZAP, taille de page et pagination.
7. Mise à jour automatique des libellés, badges et explications.
8. Top 5 / Top 10 / Top 20 / Toutes appliqué au mode groupé ; désactivé visuellement en mode individuel car non applicable.
9. Date de fin traitée inclusivement jusqu’à 23:59:59.999.
10. Export des graphiques adapté au mode individuel visible.

FICHIERS MODIFIÉS
- tableau_bord_kobo.html
- app.js
- style.css

DÉPLOIEMENT GITHUB PAGES
Remplacer les fichiers du dépôt avec ceux de ce paquet, attendre la fin du déploiement GitHub Pages puis effectuer Ctrl+F5.
