PMA / PTA 2026 — Tableau de bord KoboToolbox
VERSION V6.7 — TESTS STATISTIQUES AVANCÉS
Date : 2026-08-28

NOUVEAUTÉ PRINCIPALE
Un nouvel onglet « 7 : Tests Statistiques Avancés » a été ajouté immédiatement à côté de « 6 : Analyse Dynamique Approfondie » dans le module Analyse des Réalisations des STD.

SOUS-ONGLETS STATISTIQUES
1. Khi² (Chi-deux) d'indépendance
   - Table de contingence Entité STD × dimension sélectionnée.
   - χ², degrés de liberté, p-value et V de Cramér.
   - Diagnostic des effectifs théoriques < 5 et < 1.
   - Pour éviter des tableaux illisibles, les modalités peu fréquentes sont regroupées dans « Autres » lorsque nécessaire.

2. Pearson
   - Corrélation entre réalisation et Date de début.
   - Corrélation entre réalisation et Date de fin.
   - Corrélation entre réalisation et Durée inclusive.
   - r, p-value, force/sens de la corrélation et nuage de points dynamique.

3. ANOVA à un facteur
   - Compare les moyennes de réalisation entre les entités du niveau DREN/CISCO/ZAP choisi.
   - F, degrés de liberté, p-value et eta-carré (η²).
   - Tableau par entité : n, moyenne, écart-type.
   - Graphique des moyennes par entité.

4. Spearman
   - Corrélation de rang avec Date début, Date fin et Durée.
   - rho, p-value approximative et interprétation de la force/sens.

5. Kruskal-Wallis
   - Alternative non paramétrique à l'ANOVA.
   - H, degrés de liberté, p-value et epsilon-carré approximatif.
   - Tableau par entité : n, médiane, rang moyen.

6. Explication des tests
   - Question statistique de chaque test.
   - Hypothèse nulle H0.
   - Variables concernées.
   - Précautions et limites d'interprétation.

FILTRES DYNAMIQUES
- Niveau STD : DREN / CISCO / ZAP.
- Dimension : Activité / Produit / Sous Activité / Sous Produit.
- Élément de la dimension : tous ou un élément précis.
- Date de début OM minimale.
- Date de fin OM maximale.

RÈGLE D'INTERPRÉTATION
Le module utilise p < 0,05 comme repère de significativité. Une significativité statistique n'est pas une preuve de causalité et ne remplace pas l'analyse métier. Les tests sont calculés uniquement sur les données réellement disponibles dans le tableau de bord.

FICHIERS PRINCIPAUX À REMPLACER SUR GITHUB
- tableau_bord_kobo.html
- app.js
- style.css
- semantic.js

Le ZIP inclut également les fichiers du module DMS et dictionnaire.xlsx afin de constituer un paquet complet.

CONTRÔLES EFFECTUÉS
- Syntaxe app.js : OK (node --check).
- Syntaxe semantic.js : OK.
- Syntaxe SUIVI_IOV_SPSSE_javascript.js : OK.
- 1 278 balises <div> ouvertes / 1 278 balises </div> fermées.
- Aucun ID HTML dupliqué.
- Sous-onglets Khi², Pearson, ANOVA, Spearman, Kruskal-Wallis et Explication présents.
