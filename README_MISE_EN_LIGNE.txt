PMA/PTA KOBO — VERSION V3 RÉFÉRENCE FONCTIONNELLE — 25/08/2026

La fonction fetchData() active reprend la stratégie confirmée fonctionnelle :
1. KoboToolbox direct
2. AllOrigins
3. CodeTabs
4. corsproxy.io

IMPORTANT : remplacez ensemble tableau_bord_kobo.html et app.js, puis forcez le rechargement du navigateur (Ctrl+F5).

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


CORRECTION V2 — 25/08/2026 14:25
---------------------------------
La première version Fallback contenait encore, plus bas dans app.js, un remplacement final de fetchData() qui appelait fetchCompleteKoboDatabase(), elle-même restée en connexion directe uniquement. Cela annulait le fallback au démarrage et expliquait le message « Connexion directe KoboToolbox impossible ».

La V2 corrige ce point : le téléchargement complet réellement utilisé au démarrage passe maintenant lui aussi par Direct KoboToolbox -> AllOrigins -> CodeTabs -> corsproxy.io, page par page. Le statut affiche la méthode réellement utilisée.

IMPORTANT : remplacer tableau_bord_kobo.html ET app.js ensemble dans GitHub, attendre la publication GitHub Pages, puis faire Ctrl+F5. Le paramètre de cache doit afficher la version 20260825-1425-kobo-direct-proxy-fallback-v2.
