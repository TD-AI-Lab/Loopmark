# Politique de confidentialité — Loopmark

Loopmark n'a pas de compte, de serveur, de publicité, de suivi ni de télémétrie.

L'extension lit uniquement l'identifiant de la vidéo YouTube en cours, la durée et la position du lecteur, afin de gérer une boucle entre deux timecodes A/B. Elle stocke localement dans Firefox (`browser.storage.local`) la sélection des timecodes et l'état actif/inactif, indexés par identifiant de vidéo.

**Aucune donnée n'est envoyée à l'auteur de Loopmark ou à un tiers par le code de l'extension.** Elle ne fait aucun appel réseau, ne lit pas l'historique du navigateur, ne lit pas les cookies et ne lit pas le contenu personnel de l'utilisateur. L'utilisation de YouTube elle-même reste soumise à la politique de confidentialité de YouTube.

Désinstaller l'extension supprime généralement son stockage associé selon le comportement de Firefox. Les données peuvent également être effacées par le navigateur.

Les autorisations se limitent à `storage` et aux pages de `www.youtube.com`. Le code est intégralement auditable dans `src/`.
