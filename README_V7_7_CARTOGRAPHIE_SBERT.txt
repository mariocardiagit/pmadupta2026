PMA / PTA 2026 — V7.7 — CARTOGRAPHIE SENTENCE-BERT

Nouveautés :
- Deux sous-onglets dans « Cartographie des réalisations proches » pour DREN, CISCO, ZAP et STD :
  1. Avec l'utilisation de l'IA Sémantique Sentence-BERT (Réponses Synthétisées)
  2. Avec l'utilisation de l'IA Sémantique Sentence-BERT (Réponses Plus détaillées)
- Sentence-BERT : Xenova/paraphrase-multilingual-MiniLM-L12-v2, déjà utilisé par le module sémantique du projet.
- Les codes (ex. SA1207, SA1206...) sont retirés avant l'embedding afin que l'IA compare le sens de la formulation.
- Clustering par composantes connexes de similarité cosinus, seuil par défaut 58 %.
- Consolidation métier française conservatrice pour éviter de séparer artificiellement « contrôler / vérifier / suivre » lorsqu'ils portent sur le même noyau métier.
- Exemple explicitement pris en charge : SA1207, SA1206, SA1093, SA1155 et SA1173 sur le contrôle/suivi de l'utilisation des caisses-écoles sont réunissables dans la même thématique.
- La proximité numérique reste ensuite évaluée avec le seuil choisi (ex. 10 %) à l'intérieur des thématiques sémantiques.
- Onglet détaillé : formulations originales, similarité au représentant, entités, nombre de réalisations, valeur moyenne, paires reliées et justification du rapprochement.
- Si Sentence-BERT ne peut pas être téléchargé, un mode de secours TF-IDF + règles métier est utilisé et clairement signalé dans l'interface.

Fichiers modifiés :
- tableau_bord_kobo.html
- app.js
- semantic.js
- style.css

Déploiement GitHub Pages : remplacer de préférence tous les fichiers du ZIP puis Ctrl+F5 après publication.
