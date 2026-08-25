PMA / PTA KOBO - VERSION V5 - 25/08/2026

Correction principale :
- Kobo direct reste tenté en premier.
- AllOrigins reste en secours.
- CORSPROXY.io est réintroduit avec sa syntaxe actuelle documentée :
    https://corsproxy.io/?url=<URL_ENCODEE>
  L'ancienne forme https://corsproxy.io/?<URL_ENCODEE> pouvait répondre HTTP 403.
- CORS.lol reste un dernier secours.
- Même correction appliquée au module DMS.
- Cache-busters HTML passés en V5 afin de forcer Firefox/GitHub Pages à charger les nouveaux JS.

Ordre actuel :
1. Direct KoboToolbox
2. AllOrigins
3. CORSPROXY.io (?url=)
4. CORS.lol

Après mise en ligne : attendre GitHub Pages puis Ctrl+F5.
