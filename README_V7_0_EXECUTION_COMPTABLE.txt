PMA / PTA 2026 — VERSION V7.0 — EXECUTION_COMPTABLE
Date : 28/08/2026

NOUVEL ONGLET N°9
-----------------
« EXECUTION_COMPTABLE » a été ajouté après l'onglet n°8 « Explication des Tests Statistiques Avancés ».

SOURCE KOBO DÉDIÉE
------------------
Le lien/UID de la source EXECUTION_COMPTABLE n'a pas été transmis dans le message reçu avec cette demande.
Pour ne pas bloquer l'intégration, le nouvel onglet contient un champ :
  Source KoboToolbox EXECUTION_COMPTABLE
qui accepte :
  - l'UID de l'asset Kobo ;
  - ou l'URL API https://kf.kobotoolbox.org/api/v2/assets/{UID}/data.json
La valeur est mémorisée localement dans le navigateur.
Dès que l'URL exacte est fournie, elle peut aussi être codée en dur dans une version ultérieure.

FONCTIONS PRINCIPALES
---------------------
1. Recherche multicritère dynamique :
   - recherche texte globale ;
   - champ texte ciblé ;
   - catégorie + valeur ;
   - champ Date/Heure + Date/Heure début + Date/Heure fin ;
   - champ numérique + min + max ;
   - sélection dynamique de la mesure comptable, de l'entité, de la référence et du texte sémantique.

2. Vue d'ensemble :
   - KPI ;
   - évolution temporelle ;
   - principales entités/catégories ;
   - histogramme ;
   - qualité/complétude ;
   - interprétation narrative automatique.

3. Algorithmes et analyses :
   - K-means ;
   - Algorithme de Jenks ;
   - DBSCAN ;
   - Système Expert explicable ;
   - SBERT multilingue / recherche sémantique ;
   - secours TF-IDF/cosinus ;
   - statistiques descriptives ;
   - Pearson ;
   - Spearman ;
   - ANOVA ;
   - MAD robuste ;
   - score d'anomalie/risque ;
   - test exploratoire de Benford ;
   - prévision temporelle linéaire.

4. Système Expert :
   - champs critiques manquants ;
   - valeurs nulles/négatives ;
   - références dupliquées ;
   - valeurs atypiques robustes ;
   - montants très répétés ;
   - écritures de nuit ;
   - écritures de week-end ;
   - décalages temporels importants entre date analysée et soumission Kobo.

5. Export / Partage :
   - Excel XLSX ;
   - CSV ;
   - JSON ;
   - Rapport HTML ;
   - PNG du graphique temporel ;
   - Partage Web Share API ou copie dans le presse-papiers.

SBERT
-----
Le modèle demandé est chargé uniquement à la demande depuis Hugging Face via Transformers.js :
Xenova/paraphrase-multilingual-MiniLM-L12-v2
Si le modèle ne peut pas être téléchargé, le module exécute automatiquement un mode de secours TF-IDF/cosinus local.

SÉCURITÉ / INTERPRÉTATION
-------------------------
Les proxys CORS publics restent des services tiers. Ne pas y faire transiter des données comptables sensibles sans validation de la politique de sécurité.
Les scores d'anomalie, DBSCAN, Benford, K-means, SBERT et règles expertes servent à prioriser les contrôles ; ils ne constituent jamais, à eux seuls, une preuve de fraude ou d'irrégularité comptable.

FICHIERS À PUBLIER
------------------
- tableau_bord_kobo.html
- app.js
- style.css
- semantic.js
- execution_comptable.js       (NOUVEAU)
- execution_comptable.css      (NOUVEAU)
- SUIVI_IOV_SPSSE_html.html
- SUIVI_IOV_SPSSE_javascript.js
- SUIVI_IOV_SPSSE_css.css
- dictionnaire.xlsx

Après publication GitHub Pages, effectuer Ctrl+F5.
