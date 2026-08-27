PMA / PTA 2026 — V6.4 PRÉDICTION TEMPORELLE + RNA
Date : 27/08/2026

NOUVEAUTÉ
Dans Comparaison avancée des Réalisations entre les STD, les panneaux DREN, CISCO et ZAP contiennent désormais un quatrième sous-onglet :
- K-Means
- Algorithme de Jenks
- DBSCAN
- Prédiction

L'onglet Prédiction utilise les réalisations historiques retenues par les filtres courants et les dates OM missionnaire.
Il permet de saisir une DATE DE DÉBUT À PRÉDIRE et une DATE DE FIN À PRÉDIRE, ou de proposer automatiquement la période suivant la dernière réalisation historique.

MODÈLES DE PRÉDICTION
1. Régression temporelle multiple
   - Régression ridge par série entité × dimension.
   - Variables : date de début, date de fin et durée inclusive.

2. Moyenne temporelle pondérée
   - Pondère davantage les observations proches de la période cible et de sa durée.

3. RESEAUX DE NEURONES ARTIFICIELLES (RNA)
   - Sous-onglet dédié, conformément à la demande.
   - Petit réseau neuronal exécuté entièrement dans le navigateur.
   - 4 entrées : date début, date fin, durée, moyenne historique de la série.
   - 8 neurones cachés et 140 époques d'apprentissage.
   - Si moins de 8 observations temporelles sont disponibles, le RNA se replie explicitement sur la méthode pondérée.

RÉSULTATS AFFICHÉS
- Graphique : moyenne historique versus réalisation prédite.
- Tableau : dimension, entité, nombre d'observations historiques, dernière valeur, période cible, prédiction et niveau de fiabilité basé sur le volume d'historique.

IMPORTANT
Les prédictions sont exploratoires. Elles ne garantissent pas une réalisation future et ne constituent pas une relation causale. La qualité dépend directement du nombre et de la régularité des réalisations historiques disponibles.

MISE EN LIGNE
Remplacer ensemble :
- tableau_bord_kobo.html
- app.js
- style.css
- semantic.js
Puis effectuer Ctrl + F5 après publication GitHub Pages.

Cache-buster principal :
app.js?v=20260827-1222-prediction-rna-v6-4
style.css?v=20260827-1222-prediction-rna-v6-4
