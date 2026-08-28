PMA / PTA 2026 — V7.1 — EXECUTION_COMPTABLE — SOURCE KOBO PRÉCONFIGURÉE
Date : 2026-08-28

Source fournie par l’utilisateur :
https://kf.kobotoolbox.org/#/forms/aC5pu7oNANnbwEuv4mpeEo/landing

UID détecté : aC5pu7oNANnbwEuv4mpeEo
Endpoint de données construit automatiquement :
https://kf.kobotoolbox.org/api/v2/assets/aC5pu7oNANnbwEuv4mpeEo/data.json?limit=1000

Corrections V7.1 :
- source EXECUTION_COMPTABLE préremplie ;
- reconnaissance des liens Kobo dont /forms/{UID}/landing se trouve dans le fragment # de l’URL ;
- connexion automatique au premier affichage de l’onglet EXECUTION_COMPTABLE ;
- conservation du bouton Connecter / Actualiser ;
- conservation de l’import JSON hors-ligne ;
- conservation de tous les filtres, y compris Date/Heure ;
- conservation des analyses K-means, Jenks, DBSCAN, Système Expert, SBERT/TF-IDF, statistiques, anomalies/risques, prévision et Benford ;
- conservation des exports XLSX, CSV, JSON, HTML, PNG et du partage.

IMPORTANT : si l’asset Kobo est privé, un site GitHub Pages ne doit pas embarquer un jeton API Kobo dans le JavaScript public. Dans ce cas, utiliser un backend/proxy contrôlé ou l’import JSON hors-ligne.
