PMA / PTA 2026 — V7.2 — EXECUTION_COMPTABLE
LIBELLÉS + TITRES DYNAMIQUES DES GRAPHIQUES
Date : 2026-08-28

Source KoboToolbox EXECUTION_COMPTABLE préconfigurée :
https://kf.kobotoolbox.org/#/forms/aC5pu7oNANnbwEuv4mpeEo/landing
Asset UID : aC5pu7oNANnbwEuv4mpeEo

Nouveautés V7.2 :
1. Ajout du champ « Libellé complémentaire » à côté de « Entité / structure / code ».
2. Détection automatique des champs de type libellé, intitulé, désignation, nom ou description associés au code sélectionné.
3. Possibilité de choisir manuellement le champ libellé si plusieurs champs sont présents dans le formulaire Kobo.
4. Affichage des catégories sous la forme « CODE — LIBELLÉ » dans le graphique des principales entités / catégories.
5. Gestion multilignes des libellés longs afin de préserver la lisibilité.
6. Ajout de titres dynamiques directement à l'intérieur des graphiques Chart.js.
7. Ajout de titres d'axes explicites pour les graphiques de la vue d'ensemble.
8. Titres également ajoutés aux graphiques K-means, Jenks, DBSCAN, Pearson/Spearman, ANOVA, Risques, Benford et Prévision.
9. Les titres utilisent les noms réels des champs sélectionnés et se recalculent après changement des filtres ou des mappings.
10. Les exports continuent à utiliser les données et filtres actifs ; le mapping du libellé complémentaire est inclus dans l'instantané des filtres.

IMPORTANT :
- Si les soumissions Kobo contiennent un champ libellé/intitulé correspondant au code (ex. Activité), le module le détecte automatiquement.
- Si plusieurs champs libellés existent, utilisez la liste « Libellé complémentaire » pour sélectionner celui qui correspond au code affiché.
- Si aucun champ de libellé n'existe dans les soumissions JSON, le navigateur ne peut pas reconstruire un libellé absent des données ; le code sera alors affiché seul.

Déploiement GitHub Pages :
Remplacer tout le contenu du ZIP dans le dépôt, attendre la fin du déploiement, puis effectuer Ctrl+F5.
