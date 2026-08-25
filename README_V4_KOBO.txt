PMA/PTA KOBO — VERSION V4 — 25/08/2026

Correction du mécanisme de connexion navigateur vers KoboToolbox.

Ordre de tentative :
1. Direct KoboToolbox
2. AllOrigins
3. CORS.lol

CodeTabs a été retiré : le service a annoncé son arrêt au 30/06/2026.
corsproxy.io a été retiré de la chaîne sans clé car il peut désormais répondre HTTP 403.

La pagination Kobo v2 est suivie automatiquement, avec des pages de 500 enregistrements.

Mettre en ligne ensemble :
- tableau_bord_kobo.html
- app.js
- SUIVI_IOV_SPSSE_html.html
- SUIVI_IOV_SPSSE_javascript.js

Puis faire Ctrl+F5 après publication GitHub Pages.
