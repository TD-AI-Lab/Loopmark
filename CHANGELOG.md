## v0.1.5 — 16 novembre 2026 : correction DOM imbriqué

- Insertion du bouton avant l'**enfant direct** de la barre qui contient l'engrenage (évite `NotFoundError`).
- Si l'engrenage est temporairement absent, insertion avant un autre contrôle natif disponible.
- Suppression des clones et réconciliation inchangées, sans réécriture d'une barre stable.
- Tests : engrenage imbriqué dès le départ, clonage, navigation et interactions.
- Aucune nouvelle permission, collecte ou dépendance.

# Historique des versions

## v0.1.4 — Correctif duplication barre YouTube

- Suppression systématique des boutons AB orphelins/dupliqués lorsque le lecteur reconstruit ses commandes.
- Insertion directement avant le bouton des paramètres (en une mutation, pas deux).
- Pas de création dans une barre native incomplète (roue des paramètres absente).
- Test de régression simulant 30 clonages, suppression/restauration de l'engrenage, ainsi que les scénarios existants.
- Aucune nouvelle permission ou fonctionnalité réseau.

# Historique

## 0.1.3 — Contrôle natif

- Bouton A–B inséré dans `.ytp-right-controls` juste avant `.ytp-settings-button`.
- Suppression de la position flottante du bouton sur la vidéo.
- Popover ancré dynamiquement au bouton dans le lecteur (y compris plein écran).
- Réinsertion après reconstruction des commandes YouTube sans remonter toute l’interface.
- Tests navigateur enrichis : emplacement, reconstruction DOM, fermeture extérieure, navigation SPA.

# Changelog

## 0.1.2 — 16 novembre 2026

- Panneau repensé dans la palette et les conventions visuelles YouTube : gris anthracite, contrastes sobres, boutons en forme de pilules, accent rouge réservé à l'état actif.
- Fermeture du panneau au clic en dehors, via Échap, via × et via AB ; la lecture et la boucle continuent si on ferme.
- Mini-frise de sélection A/B désormais manipulable directement à la souris/tactile et au clavier.
- Conservation du bouton toujours visible dans le lecteur (correctif v0.1.1).
- Gestion de la fin de vidéo, des navigations SPA et des marqueurs sur la barre de progression.
- Métadonnées Mozilla actualisées : déclaration explicite d'absence de collecte de données.
- Documentation, politique de confidentialité, script de packaging et tests ajoutés.

## 0.1.1

- Bouton indépendant de la barre native responsive de YouTube.

## 0.1.0

- Première version avec saisie et capture de points A et B, répétition locale et stockage des réglages.
