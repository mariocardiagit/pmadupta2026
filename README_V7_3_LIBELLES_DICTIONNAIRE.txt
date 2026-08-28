V7.3 — EXECUTION_COMPTABLE — LIBELLES HUMAINS VIA DICTIONNAIRE

Correction principale :
- Une valeur de type code (ex. P012) n'est plus utilisée comme libellé d'un autre code (ex. A3124).
- Le module recherche d'abord le véritable libellé dans le dictionnaire Kobo/XLSForm déjà chargé par la plateforme (questionListMap/valueMap/externalDict).
- Exemple attendu : A3124 — Redynamiser l'encadrement pédagogique.
- Si un vrai champ descriptif « Libellé/Intitulé/Désignation » existe dans les soumissions, il reste utilisable.
- La détection automatique des champs compagnons pénalise désormais fortement les champs dont les valeurs ressemblent à des codes A..., P..., SA..., SP..., etc.

Fichiers à publier : idéalement tout le contenu du ZIP. Au minimum tableau_bord_kobo.html + execution_comptable.js + dictionnaire.xlsx.
Après déploiement GitHub Pages : Ctrl+F5.
