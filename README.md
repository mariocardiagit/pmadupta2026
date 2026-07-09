# pmadupta2026
Tableau de Bord Kobotoolbox ! Paquet Minimum d'Activités (PMA) du Plan de Travail Annuel FCE 2026

Voici une proposition de fichier README.md complet, professionnel et structuré, prêt à être copié-collé sur la page d'accueil de votre dépôt GitHub.

Il met en valeur l'architecture technique (100% frontend), les fonctionnalités avancées (Levenshtein, Data Lineage) et explique clairement le fonctionnement pour vos futurs collaborateurs.

📊 Plateforme de Suivi du PMA - PTA 2026 (STD)
Sous-titre : Tableau de Bord : Données & Analytics KoboToolbox

📝 Description du Projet
Cette application web est un tableau de bord interactif et 100% frontend (Serverless). Elle est conçue pour le suivi du Paquet Minimum d'Activités (PMA) du Plan de Travail Annuel (PTA) 2026 des Services Techniques Déconcentrés (STD) à Madagascar.

L'outil se connecte en temps réel à l'API de KoboToolbox, récupère les données des formulaires terrain, traduit les codes bruts en labels lisibles (via un dictionnaire Excel), et offre une interface puissante d'analyse, de filtrage et d'exportation de données.

✨ Fonctionnalités Principales
🔄 Synchronisation Dynamique : Connexion directe à l'API JSON KoboToolbox (via proxy CORS) pour récupérer les dernières soumissions en temps réel.

📖 Traduction Intelligente (Dictionnaire Excel) : Intégration de la librairie SheetJS pour lire à la volée le fichier XLS form Kobo (onglets survey et choices) et le fichier zaps.csv afin de traduire automatiquement les codes XML obscurs en données lisibles.

🧠 Moteur de Recherche Avancé (Fuzzy Search) : Implémentation d'un algorithme combinant la recherche par inclusion (LIKE %mot%) et le calcul de la distance de Levenshtein (tolérance d'une erreur de frappe) pour retrouver facilement les informations géographiques (DREN, CISCO, ZAP) ou les descriptifs d'activités.

📈 Module Analytique (Synthèse & IA) : Génération automatique de tableaux croisés synthétisant les remontées par zone géographique, avec barres de progression intégrées.

📤 Exports Traçables (Data Lineage) : Exportation des données brutes ou analysées en formats CSV, Excel (.xlsx), HTML statique et JSON. Chaque export embarque obligatoirement les métadonnées d'horodatage et les critères de recherche appliqués pour garantir l'intégrité de l'analyse.

🔗 Partage Intelligent (Gmail & WhatsApp) : Génération automatisée de rapports JSON synthétiques copiés dans le presse-papiers de l'utilisateur (contournement des limites de longueur d'URL des navigateurs), prêts à être collés dans un e-mail pré-formaté ou une discussion WhatsApp.

🏗️ Architecture et Technologies
L'application repose sur une architecture statique légère, idéale pour un hébergement gratuit sur GitHub Pages, sans nécessiter de serveur backend (PHP, Node.js, Python, etc.).

HTML5 / CSS3 : Structure de la page.

JavaScript (Vanilla & ES6) : Logique algorithmique, parsing JSON, Levenshtein, presse-papiers.

jQuery (v3.6.0) : Manipulation dynamique du DOM.

Bootstrap (v5.3.0) : Framework UI pour un design responsive et moderne.

SheetJS (xlsx.full.min.js) : Traitement côté client des fichiers Excel (lecture du dictionnaire et génération des exports .xlsx).

FontAwesome (v6.0) : Typographie et icônes.

📂 Structure des fichiers requis
Pour que l'application fonctionne de manière optimale sur GitHub Pages, le dépôt doit contenir les éléments suivants à la racine :

index.html (ou tableau_bord_kobo.html) : Le fichier principal contenant le code source.

ath6cv2NrXEUijffeKJqSf(12).xlsx : Le fichier d'outillage Kobo contenant le référentiel des questions et des choix.

zaps.csv : Le référentiel externe contenant la correspondance des codes ZAP.

🚀 Installation & Déploiement
Clonez ce dépôt ou uploadez les fichiers requis sur votre compte GitHub.

Allez dans les Settings de votre dépôt GitHub.

Naviguez dans l'onglet Pages (dans le menu de gauche).

Dans la section "Build and deployment", sous "Source", choisissez Deploy from a branch.

Sélectionnez la branche main (ou master), dossier / (root) et cliquez sur Save.

Patientez quelques minutes. Votre application sera déployée et accessible via l'URL fournie par GitHub (ex: [https://votre-nom.github.io/votre-repo/](https://votre-nom.github.io/votre-repo/)).

💡 Guide d'Utilisation
Ouverture : À l'ouverture de la page, le script télécharge silencieusement le dictionnaire Excel, puis interroge l'API KoboToolbox. Le statut de synchronisation s'affiche en haut de l'écran.

Filtrage (Onglet 1) : Utilisez les barres de recherche pour filtrer la matrice. N'hésitez pas à faire des fautes de frappe légères, le moteur Levenshtein corrigera automatiquement !

Visualisation des Images : Cliquez sur le bouton "Véritables Images" pour afficher les preuves photographiques directement dans le tableau.

Analyse (Onglet 2) : Basculez sur cet onglet pour voir la répartition des soumissions. Vous pouvez filtrer localement chaque tableau (DREN, CISCO, ZAP).

Exportation : Cliquez sur "Exporter" ou "Partager". Si vous utilisez Gmail ou WhatsApp, le système vous indiquera qu'une charge utile a été copiée dans votre presse-papiers (Ctrl+V pour coller).

⚠️ Notes de Sécurité et Limites
CORS Policy : Pour contourner les politiques de sécurité des navigateurs (Cross-Origin Resource Sharing) interdisant à un domaine GitHub d'appeler l'API KoboToolbox en JavaScript pur, le proxy public [https://corsproxy.io/](https://corsproxy.io/)? est utilisé en amont de l'URL de l'API.

Absence de Clé d'API : Les données Kobo ciblées ici sont configurées en accès public (data.json). Aucune clé privée ou token d'authentification n'est codé en dur dans le fichier HTML, respectant ainsi les bonnes pratiques de sécurité frontend.
