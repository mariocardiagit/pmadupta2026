PMA / PTA 2026 — Version V6.3 — 27/08/2026
================================================

OBJET DE LA CORRECTION
----------------------
Dans « Comparaison avancée des Réalisations entre les STD », les onglets principaux
DREN, CISCO et ZAP contiennent désormais chacun trois sous-onglets algorithmiques :

1. K-Means
2. Algorithme de Jenks
3. DBSCAN

Le panneau STD global conserve son fonctionnement précédent et ne reçoit pas ces
sous-onglets, conformément à la demande portant sur DREN / CISCO / ZAP.

FONCTIONNEMENT
--------------
Les trois algorithmes utilisent automatiquement les critères actifs du panneau :
- Dimension : Activité / Produit / Sous Activité / Sous Produit
- Élément précis sélectionné ou totalité
- Mode de calcul : chaque soumission / somme / moyenne
- Date début réalisation dans OM missionnaire
- Date fin réalisation dans OM missionnaire

Chaque sous-onglet affiche :
- un résumé de la méthode et des paramètres calculés ;
- un graphique de classification ;
- un tableau avec la dimension, l'entité, la valeur et la classe/groupe obtenu.

K-Means classe les valeurs par centres de gravité.
Jenks recherche les ruptures naturelles.
DBSCAN recherche les groupes denses et signale les valeurs isolées comme bruit/anomalie.

FICHIERS PRINCIPAUX À PUBLIER ENSEMBLE
--------------------------------------
- tableau_bord_kobo.html
- app.js
- style.css
- semantic.js

Le ZIP contient également les fichiers du module DMS et dictionnaire.xlsx afin de
conserver un paquet autonome avec toutes les dépendances locales référencées par les HTML.

CONTROLES EFFECTUES
-------------------
- Syntaxe JavaScript : app.js OK
- Syntaxe JavaScript : semantic.js OK
- Syntaxe JavaScript : SUIVI_IOV_SPSSE_javascript.js OK
- HTML : 960 balises <div> ouvertes / 960 balises </div> fermées
- 3 cartes algorithmiques : DREN, CISCO, ZAP
- 9 sous-onglets algorithmiques au total
- Aucun ID HTML dupliqué
- Toutes les dépendances locales référencées par les deux HTML sont présentes dans le paquet

MISE EN LIGNE
-------------
Remplacer les fichiers sur GitHub Pages, attendre la fin du déploiement, puis effectuer
Ctrl + F5 pour forcer le rechargement du HTML/CSS/JavaScript.
