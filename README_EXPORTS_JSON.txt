MISE À JOUR — EXPORTS DES GRAPHIQUES ET MODE HORS-LIGNE JSON

1. Export global de l'onglet « 2 : Analyse »
- PNG ou JPEG : archive ZIP contenant les graphiques temporels et les graphiques avancés K-Means, Jenks et DBSCAN.
- Word : rapport .doc contenant les critères et les graphiques.
- XLSX : classeur contenant les critères, les données temporelles, les résultats avancés, la base filtrée et les images des graphiques.
- CSV et JSON : critères et valeurs numériques complètes des graphiques ; ces formats ne peuvent pas incorporer des images.
- HTML : rapport autonome contenant les critères, les tableaux et les graphiques incorporés.

2. Export par niveau
Chaque section DREN, CISCO et ZAP possède ses propres commandes PNG, JPEG, Word, XLSX, CSV, HTML et JSON.

3. Export individuel
En mode « Affichage individuel », chaque graphique d'entité possède ses commandes PNG, JPEG, Word et Partager.
Les neuf graphiques du sous-module K-Means/Jenks/DBSCAN possèdent également leurs propres commandes d'export.

4. Sauvegarde hors-ligne KoboToolbox
- Le bouton « Exporter manuellement la base Kobo (JSON) » sauvegarde toutes les lignes actuellement chargées.
- Le champ « Importer manuellement la base Kobo (Fichier JSON) » accepte :
  * un tableau JSON de lignes ;
  * une réponse KoboToolbox contenant la propriété « results » ;
  * les sauvegardes JSON générées par cette plateforme.

5. Bibliothèques utilisées
Chart.js, SheetJS, ExcelJS et JSZip sont chargées par CDN. Une connexion internet est nécessaire pour charger ces bibliothèques lors de la première ouverture du site.
