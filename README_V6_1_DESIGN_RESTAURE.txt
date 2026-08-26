PMA / PTA KOBO — V6.1 DESIGN RESTAURÉ — 26/08/2026
========================================================

Correction visuelle de la V6 :
- Les 4 dimensions Activité / Produit / Sous Activité / Sous Produit sont conservées.
- Les sous-onglets sont replacés À L'INTÉRIEUR de la carte de contrôles existante.
- La structure HTML historique du module Comparaison avancée reste inchangée autour des cartes.
- Le fichier style.css complet est à nouveau inclus dans le paquet.
- semantic.js et SUIVI_IOV_SPSSE_css.css sont également inclus pour éviter un paquet incomplet.
- Aucune règle CSS historique n'a été supprimée ni remplacée ; seules les règles spécifiques aux 4 nouveaux sous-onglets ont été ajoutées à la fin de style.css.
- Cache-busters HTML mis à jour pour forcer Firefox/GitHub Pages à recharger style.css et app.js.

MISE EN LIGNE RECOMMANDÉE
-------------------------
Remplacer ensemble :
1. tableau_bord_kobo.html
2. app.js
3. style.css
4. semantic.js

Conserver également dans le dépôt les fichiers DMS et dictionnaire fournis dans ce ZIP.
Après publication GitHub Pages : Ctrl + F5.
