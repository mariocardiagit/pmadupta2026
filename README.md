# pmadupta2026
Tableau de Bord Kobotoolbox ! Paquet Minimum d'Activités (PMA) du Plan de Travail Annuel FCE 2026 des STD (DREN , CISCO , ZAP)

J'ai rédigé ce document en utilisant le format Markdown standard (idéal pour GitHub).

📊 Plateforme Intelligente de Suivi du PMA - PTA 2026 (STD)
📝 Description du Projet
Ce projet est un tableau de bord analytique "Single-Page Application" (SPA) conçu pour le suivi en temps réel du Paquet Minimum d'Activités (PMA) dans le cadre du Plan de Travail Annuel (PTA) 2026 des Services Techniques Déconcentrés (STD).

Il se connecte dynamiquement à l'API de KoboToolbox pour récupérer, traduire (via un dictionnaire Excel automatisé) et traiter les données de terrain remontées par les DREN, CISCO et ZAP. La véritable force de cette plateforme réside dans son intégration de plusieurs modèles d'Intelligence Artificielle (Statistique et Symbolique) fonctionnant 100% côté client.

✨ Fonctionnalités Principales
1. Visualisation & Filtrage Avancé
Synchronisation API : Récupération des formulaires KoboToolbox en direct.

Recherche Intelligente : Intégration de l'algorithme de distance de Levenshtein pour une recherche "Fuzzy" tolérante aux fautes de frappe.

Traduction Automatisée : Nettoyage des chaînes de caractères et croisement avec des fichiers XLSX et CSV pour afficher des labels propres à la place des variables de base de données.

2. Intelligence Artificielle Statistique (Clustering)
La plateforme embarque un moteur d'Analyse Spatiale et Statistique divisé en trois algorithmes distincts (IA Explicable - XAI) pour segmenter les entités selon leurs performances :

📐 K-Means (Centre de Gravité) : Partitionnement géométrique minimisant l'inertie intra-classe.

🎯 Algorithme de Jenks (Natural Breaks) : Optimisation unidimensionnelle (1D) maximisant le critère GVF (Goodness of Variance Fit). Utilisé comme algorithme de référence pour le Système Expert.

📡 DBSCAN (Densité) : Modèle basé sur la densité locale permettant de détecter et d'isoler automatiquement les anomalies statistiques (Bruit).

3. Intelligence Artificielle Symbolique (Système Expert)
Un Moteur d'Inférence croise les ruptures de variance calculées par l'algorithme de Jenks avec une base de connaissances métier pour générer des recommandations managériales automatisées :

🟢 OPTIMAL : Félicitations et maintien des descentes sur terrain.

🟠 ATTENTION : Soutien par email et prévision de descentes.

🔴 CRITIQUE : Relance immédiate, appels d'urgence et actions de sensibilisation de terrain obligatoires.

4. Exportation et Partage Intégrés
Exports complets : Fichiers générés en local aux formats .CSV, .XLSX, .JSON, et .HTML.

Partage rapide : Injection directe des rapports d'analyse au format JSON dans Gmail et WhatsApp.

🚀 Installation & Utilisation (Développement Local)
Aucun serveur backend lourd n'est requis pour la version actuelle. Le projet s'exécute directement dans le navigateur.

Cloner le dépôt :
Ouvrez Git Bash (ou le terminal de votre choix) et exécutez :

Bash
git clone https://github.com/Mariogit20/suivi-pma-pta-2026.git
Ouvrir le projet :
Lancez le répertoire dans Visual Studio Code :

Bash
cd suivi-pma-pta-2026
code .
Lancement :
Ouvrez simplement le fichier tableau_bord_kobo.html dans un navigateur moderne (Chrome, Firefox, Edge) ou utilisez l'extension Live Server de VS Code pour recharger la page en direct lors de vos modifications.

(Note : Assurez-vous que les fichiers dictionnaire ath6cv2NrXEUijffeKJqSf(12).xlsx et zaps.csv se trouvent dans le même répertoire racine pour que le mapping de données fonctionne).

🗺️ Roadmap & Améliorations Futures
[ ] Automatisation du Mapping de Données : Développer un script de synchronisation automatisé pour pousser les variables KoboToolbox vers Google Sheets, assurant la traduction des labels en amont de l'affichage HTML.

[ ] Backend Django : Migration de l'architecture vers un projet multi-applications Django pour historiser les données et gérer les accès sécurisés.

[ ] Application Compagnon (Kotlin) : Création d'une application Android native (avec SQLite local) pour alerter les responsables de terrain en temps réel en cas de statut de soumission "CRITIQUE".

👨‍💻 Auteur
Développé et maintenu par Mario (@Mariogit20).
