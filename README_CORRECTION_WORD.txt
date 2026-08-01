CORRECTION DE L'EXPORT WORD
============================

Le précédent export produisait un fichier HTML portant l'extension .doc.
Les images des graphiques étaient référencées avec des URL data:image/png;base64,
que Microsoft Word ne charge pas toujours.

La nouvelle version produit un véritable fichier DOCX :
- extension .docx ;
- type MIME Office Open XML ;
- images PNG intégrées dans word/media ;
- relations OOXML déclarées dans word/_rels/document.xml.rels ;
- critères de recherche et graphiques conservés ;
- export général, par niveau et individuel corrigé ;
- partage Word corrigé.

Après mise en ligne sur GitHub Pages, effectuer Ctrl + F5.
Les anciens fichiers .doc déjà téléchargés ne sont pas réparés automatiquement :
il faut relancer l'export Word depuis la nouvelle version.
