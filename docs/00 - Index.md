---
title: DungeonSpace — PRD
aliases: [Home, Index, PRD]
tags: [dungeonspace, prd, index]
status: draft
version: 0.1
created: 2026-10-06
---

# 🐉 DungeonSpace — Product Requirements Document

> [!abstract] Pitch
> Un outil de gestion de campagne pour **MJ et joueurs** de jeux de rôle sur table, d'abord **D&D 5e**, conçu dès le départ pour accueillir d'autres systèmes.
> Trois piliers : **se souvenir** (Chronique), **combattre** (Combat), **relier** (Constellation).

## Navigation

### Cadrage
- [[01 - Vision et objectifs]]
- [[02 - Personas et parcours]]
- [[03 - Périmètre MVP et roadmap]]

### Piliers produit
- [[04 - Épopée Chronique]] — historique & événements
- [[05 - Épopée Combat]] — scènes, tracker, replay
- [[06 - Épopée Constellation]] — mind map 3D du MJ
- [[07 - Épopée Fondations de jeu]] — comptes, campagnes, fiches, objets, inventaire

### Transverse
- [[08 - Contenu et licences]] ⚠️ à lire en premier
- [[09 - Modularité multi-systèmes]]
- [[10 - Exigences non fonctionnelles]]
- [[11 - Estimation et risques]]
- [[12 - Questions ouvertes]]
- [[13 - Core mechanics Rust]] — archive : le crate `dnd_core`, retiré du dépôt (ADR 0011)
- [[14 - Application web]] — v0.1 livrée : couverture du PRD, démarrage
- Décisions d'architecture : `docs/adr/`
- [[99 - Glossaire]]

## Conventions de ce vault

| Élément | Convention |
|---|---|
| ID de feature | `PILIER-NN` (ex. `CHR-03`, `CMB-12`, `CST-04`, `FND-07`) — référencés partout par wikilink/texte |
| Priorité | MoSCoW : **M**ust / **S**hould / **C**ould / **W**on't (pour le MVP) |
| Taille | T-shirt : XS (≤2 j) · S (≤1 sem) · M (1-2 sem) · L (3-5 sem) · XL (>5 sem) — en temps *perso à temps partiel*, voir [[11 - Estimation et risques]] |
| Statut | `draft` → `review` → `validated` (dans le frontmatter) |
| Callouts | `[!question]` = décision à prendre · `[!warning]` = risque · `[!tip]` = piste technique pour la phase stack |

## État de l'existant (repo `dungeons-space-backend`)

L'application vit dans le monorepo TypeScript (`apps/`, `packages/`) — voir [[14 - Application web]] et `docs/adr/`.
Les prototypes antérieurs (services Go + gRPC `node_service` / `character_service`, stubs Python, Docker Compose Kong, crate Rust `dnd_core`)
ont été retirés du dépôt (ADR 0011) ; ils restent consultables dans l'historique git.
