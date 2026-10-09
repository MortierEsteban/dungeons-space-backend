---
title: Exigences non fonctionnelles
tags: [dungeonspace, prd, nfr, performance, securite]
status: draft
---

# 10 — Exigences non fonctionnelles

← [[00 - Index]]

> Objectif « performant et facile d'utilisation » ([[01 - Vision et objectifs]]) traduit en cibles mesurables.

## Performance

| ID | Exigence | Cible |
|---|---|---|
| NFR-01 | Chargement initial (4G, cache froid) | LCP < 2,5 s |
| NFR-02 | Latence temps réel combat (action → autres clients) | < 300 ms p95 |
| NFR-03 | Écriture d'un événement | < 50 ms p95 |
| NFR-04 | Requête de timeline filtrée (100 k events) | < 300 ms p95 |
| NFR-05 | Constellation | 60 fps @ 500 nœuds ; chargement < 2 s @ 2 000 liens |
| NFR-06 | Map de combat | 60 fps avec 50 tokens et map 4096² |
| NFR-07 | Replay | saut à un tour N < 500 ms |

## Utilisabilité

- **Mobile-first** pour fiche et tracker (jouer à table sur téléphone) ; desktop pour MJ/Constellation/préparation.
- Raccourcis clavier et **palette de commandes** pour le MJ (CHR-06, CST-06).
- Accessibilité : contraste AA, navigation clavier, alternative 2D à la 3D, pas d'information portée par la couleur seule.
- i18n : FR + EN dès la structure (clés de traduction), contenu SRD en EN d'abord ([[08 - Contenu et licences]]).
- Tolérance au **réseau instable** : reconnexion transparente, file d'actions locale (CMB-52).

## Fiabilité et données

- Journal d'événements **durable** et jamais perdu (réplication/backup quotidien) — c'est la mémoire de la campagne.
- Sauvegarde/export complet d'une campagne (JSON + Markdown/Obsidian) — l'utilisateur possède ses données.
- Idempotence des écritures d'événements.
- Disponibilité visée : 99 % (projet perso) ; pas de perte de données > 5 min.

## Sécurité et vie privée

- Authentification robuste (hash adapté, OAuth, rotation de tokens) ; autorisation **par campagne et rôle** vérifiée côté serveur sur *chaque* ressource.
- Filtrage de visibilité **côté serveur** (events, nœuds, PV masqués) — jamais côté client seul.
- Uploads (maps, images) : validation de type/taille, scan basique, stockage objet isolé.
- RGPD : consentement, export, suppression de compte, minimisation.
- Secrets hors dépôt (`.env` non versionné — déjà en `.gitignore` à vérifier).

## Observabilité et exploitation

- Logs structurés, métriques (latence, erreurs, connexions temps réel), traces corrélées par `campaignId`.
- Environnement reproductible en une commande (`npm install && npm run dev`, PGlite embarqué : aucune base à installer).
- CI : lint, tests, build ; déploiement automatisé d'une démo publique.

## Maintenabilité / portfolio

- ADR (Architecture Decision Records) dans `docs/adr/` pour chaque choix, en marquant « choix d'apprentissage » ou « choix pragmatique ».
- Couverture de tests ciblée : reducers de combat/replay, moteur de formules, contrôle de visibilité.
- Données de démo (campagne seed) pour que tout visiteur voie le produit rempli.
