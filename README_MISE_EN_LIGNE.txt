MISE EN LIGNE GITHUB PAGES — VERSION DIRECTE + PROXYS CORS DE SECOURS
===================================================================

Copiez à la racine du dépôt les fichiers suivants :
- tableau_bord_kobo.html
- app.js
- style.css
- semantic.js
- SUIVI_IOV_SPSSE_html.html
- SUIVI_IOV_SPSSE_javascript.js
- SUIVI_IOV_SPSSE_css.css
- dictionnaire.xlsx

Fonctionnement Kobo :
1. fetch direct vers kf.kobotoolbox.org ;
2. si le navigateur bloque l'appel, essai via AllOrigins ;
3. puis CodeTabs ;
4. puis corsproxy.io.

La pagination Kobo v2 est suivie automatiquement jusqu'à la dernière page.

IMPORTANT — CONFIDENTIALITÉ
Lorsqu'un proxy public est utilisé, la réponse Kobo transite par un service tiers.
N'utilisez cette stratégie que pour des données que vous acceptez de faire transiter par ces services.
Aucun token Kobo n'est stocké ni envoyé par ces fichiers.

Après publication, forcez l'actualisation du navigateur avec Ctrl+F5.
