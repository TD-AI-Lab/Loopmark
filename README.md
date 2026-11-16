# Loopmark · YouTube A–B Loop

Une extension **Firefox**, libre (MIT), sans suivi et sans dépendances, pour rejouer en boucle une portion d'une vidéo YouTube.

## Fonctionnalités (v0.1.5)

- Bouton **AB directement dans la barre de commandes YouTube**, immédiatement à gauche de l'engrenage des paramètres — **aucun bouton flottant sur l'image**. Le panneau s'ouvre au-dessus de ce bouton, comme les menus natifs YouTube.
- Réinsertion du bouton si YouTube reconstruit sa barre de commandes, sans perdre la boucle active ni le panneau ouvert.
- Popover sobre, avec couleurs, typographie et boutons inspirés de l'interface YouTube ; pas de couleurs néon.
- Ferme le panneau en cliquant ailleurs (y compris sur la vidéo), en cliquant à nouveau sur **AB**, avec **Échap** ou avec **×**.
- Capture A/B à la position de lecture ou saisie des timecodes (`mm:ss.d`, `hh:mm:ss.d`).
- Mini-frise A/B à **deux poignées déplaçables** (souris/tactile, ou clavier avec flèches ; Maj+flèches = 5 s).
- Activation/désactivation et réinitialisation de la boucle ; repères sur la barre de progression.
- Paramètres sauvegardés **localement par vidéo**, et navigation YouTube sans rechargement prise en charge.
- Pas de télémétrie, requêtes réseau, serveur, compte ou dépendance externe.

## Correctif du bouton invisible (v0.1.5)

Les versions 0.1.3 et 0.1.4 supposaient que l'engrenage de YouTube
était un **enfant direct** de `.ytp-right-controls`. Or, si l'engrenage est
emballé dans un sous-conteneur, `controls.insertBefore(bouton, engrenage)`
provoque `NotFoundError` : dans v0.1.3, l'insertion préalable du bouton à la
fin de la barre expliquait les copies ; dans v0.1.4, le bouton restait détaché.

Loopmark cherche maintenant **l'enfant direct de la barre qui contient
l'engrenage**, et insère AB juste avant ce conteneur : aucun bouton flottant,
aucun clonage. Si l'engrenage n'est pas encore rendu, l'extension s'ancre
provisoirement sur un autre contrôle natif (mode cinéma ou plein écran).

Tests automatisés : engrenage imbriqué avant l'injection, déplacement de
l'engrenage dans un conteneur, disparition temporaire, 30 clones, 30
réconciliations, reconstruction des commandes, fermeture du panneau,
boucle A/B et navigation entre vidéos. Tests sur Chromium simulé : un test
sur YouTube dans Firefox reste nécessaire.

**Remplacer l'ancienne version :** supprimer l'ancien module temporaire,
fermer les anciens onglets YouTube, charger la v0.1.5 et ouvrir une nouvelle
page de vidéo. Ne pas laisser plusieurs versions actives simultanément.

## Installer temporairement dans Firefox

1. Si une ancienne version de Loopmark est installée, ouvre `about:debugging#/runtime/this-firefox` et supprime cette extension temporaire.
2. Dans `about:debugging#/runtime/this-firefox`, clique **Charger un module complémentaire temporaire**.
3. Sélectionne `src/manifest.json` **dans ce dossier de projet**.
4. Ouvre/actualise une vidéo standard `https://www.youtube.com/watch?v=...`.
5. Clique sur **AB** immédiatement à gauche de l'engrenage YouTube, saisis/capture les points A et B, puis **Activer la boucle**. Le bouton se replace lorsque YouTube reconstruit les commandes.

**Attention :** l'extension temporaire disparaît au redémarrage de Firefox. Pour une installation permanente dans Firefox stable, elle doit être signée via Mozilla Add-ons.

## Arborescence

```text
Loopmark_v0.1.5_project/
├── src/
│   ├── manifest.json       # Manifeste Firefox MV3
│   ├── content.js          # Logique, interface et boucle
│   ├── content.css         # Style inspiré de YouTube
│   └── icons/              # Icônes locales
├── tests/
│   ├── timecodes.test.js   # Tests unitaires Node, sans dépendances
│   └── browser_smoke.py    # Tests navigateur Playwright (facultatifs)
├── scripts/
│   └── package.py          # Produit le ZIP soumis à Mozilla
├── PRIVACY.md
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

## Tests et fabrication du ZIP Mozilla

Avec **Node.js** installé (aucun `npm install` nécessaire) :

```bash
node --test tests/timecodes.test.js
```

Avec **Python** installé :

```bash
python scripts/package.py
```

Le script génère `dist/Loopmark_Firefox_v0.1.5.zip`, contenant **à sa racine** `manifest.json`, `content.js`, `content.css`, `icons/`. Le dossier `dist/` n'est pas à mettre dans le paquet d'extension.

Test d'interface automatisé facultatif (Playwright + Chromium installés) :

```bash
python tests/browser_smoke.py
```

## Avant publication sur addons.mozilla.org

- Choisir un **identifiant de module unique** dans `src/manifest.json` (`browser_specific_settings.gecko.id`). L'identifiant `loopmark@open-source.example` est provisoire, volontairement conservé entre les versions pour notre période de test.
- Ajouter les informations de dépôt GitHub et une fiche de présentation.
- Tester sur Firefox réel (plusieurs vidéos, plein écran, lecture longues durées, navigation YouTube).
- Déposer le ZIP construit sur https://addons.mozilla.org/developers/ pour la revue/signature Mozilla.
- Le manifeste déclare `data_collection_permissions.required: ["none"]`, nécessaire pour les nouvelles soumissions à Mozilla ; Firefox minimum 140.

## Confidentialité et périmètre

| Autorisation | Pourquoi |
| --- | --- |
| `https://www.youtube.com/*` | Modifier **uniquement** les pages YouTube pour ajouter le lecteur A–B |
| `storage` | Enregistrer dans Firefox les positions par vidéo |

Voir [PRIVACY.md](PRIVACY.md). Aucun code externe, aucune requête de télémétrie, aucune donnée transmise par Loopmark.

## Limites connues

- Fonctionne sur les vidéos YouTube classiques (`/watch`), pas sur Shorts, lives, players intégrés ou contenus protégés.
- Les DOM internes de YouTube ne sont pas une API publique : les classes `.ytp-right-controls` et `.ytp-settings-button` peuvent évoluer. Sans barre de commandes ni autre contrôle natif, le bouton attend leur apparition, **sans revenir au-dessus de l'image**.
- La précision des limites dépend du décodage/seek vidéo et n'est pas garantie à l'échantillon audio ou à l'image près.
- Dans les lecteurs très étroits, le popover peut occuper beaucoup de place ; il reste dans la surface du lecteur.

## Licence

MIT — voir `LICENSE`.
