PMA / PTA 2026 — VERSION V6.9 — CORRECTION CONNEXION KOBOTOOLBOX
Date : 28/08/2026

Symptôme corrigé :
- Direct KoboToolbox : NetworkError
- AllOrigins : NetworkError
- CORSPROXY.io : HTTP 401
- CORS.lol : NetworkError

Correction V6.9 :
1. Toutes les fonctionnalités de la V6.8 sont conservées.
2. CORSPROXY.io est retiré de la chaîne automatique car il renvoie HTTP 401 dans l'environnement observé.
3. Ajout de CorsBridge comme nouveau proxy de secours, avec la syntaxe :
   https://api.cors.syrins.tech/?url=<URL_KOBO_ENCODEE>
4. Nouvel ordre de tentative :
   - Direct KoboToolbox
   - CorsBridge
   - AllOrigins
   - CORS.lol
5. La même correction est appliquée au module DMS.
6. Aucun token Kobo n'est inclus dans le JavaScript côté navigateur.
7. Cache-busters mis à jour afin que GitHub Pages/Firefox recharge effectivement les fichiers V6.9.

IMPORTANT SECURITE :
Quand un proxy public est utilisé, les données de réponse Kobo transitent par un service tiers.
N'utilisez pas cette architecture pour des données sensibles/confidentielles. Pour un environnement
sensible ou de production, privilégier un backend/proxy contrôlé ou un mécanisme de synchronisation
same-origin.

Installation GitHub Pages :
Remplacer ensemble :
- tableau_bord_kobo.html
- app.js
- style.css
- semantic.js
- SUIVI_IOV_SPSSE_html.html
- SUIVI_IOV_SPSSE_javascript.js
- SUIVI_IOV_SPSSE_css.css
Puis attendre le déploiement GitHub Pages et effectuer Ctrl+F5.
