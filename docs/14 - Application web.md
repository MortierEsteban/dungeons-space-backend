---
title: Application web (v0.1)
tags: [dungeonspace, application, avancement]
status: draft
created: 2026-10-08
---

# 14 — Application web (v0.1)

← [[00 - Index]] · Code : `apps/`, `packages/` · Décisions : `docs/adr/`

Tranche verticale ([[11 - Estimation et risques]]) traversant les trois piliers. Démarrage : `npm install && npm run dev` (voir le README).

## Couverture du PRD

| Pilier | Livré | Reste à faire |
|---|---|---|
| Fondations ([[07 - Épopée Fondations de jeu]]) | FND-01 (courriel + mot de passe), 02, 03 (code et invitations), 05, 10-13, 15, 16, 17, 18, 30-32, 40-46 (partiel), 50-51 | OAuth Google/Discord, multiclassage, co-MJ, import de fiche, effets d'objets appliqués automatiquement |
| Chronique ([[04 - Épopée Chronique]]) | CHR-01 à 12 (récap par gabarit) | Calendrier in-game (13), export Markdown/JSON (14), journal côté joueur (15) |
| Combat ([[05 - Épopée Combat]]) | CMB-01/02 (image de carte), 10-14, 20-23, 30-35 (partiel), 40-41, 50-52, 60-63 ; plateau 3D isométrique et modèles .glb des joueurs (ADR 0007) | UVTT, grille hexagonale, éditeur de décor avancé, actions légendaires, annotations de replay, statistiques post-combat |
| Constellation ([[06 - Épopée Constellation]]) | CST-01 à 10, 12 (épinglage côté données), 15, 16 (vue « Frise ») | Calque temporel (11), clusters (13), chemin entre deux nœuds (14), export (17) |
| Rulesets ([[09 - Modularité multi-systèmes]]) | RUL-01, 02, 04 | Moteur de formules sandboxé (03), second ruleset de démonstration (06) |
| Contenu ([[08 - Contenu et licences]]) | CNT-01, 02, 04 | Import de packs utilisateur (06) |

## Comptes de démonstration
Créés automatiquement en développement — voir `apps/api/src/seed.ts`.

## Qualité
- 62 tests automatisés : moteur de règles (dont 200 combats rejoués et absence de fuite d'informations cachées), intégration de l'API,
  disposition de la Constellation.
- TypeScript strict (`noUncheckedIndexedAccess`, `noUnusedLocals`) sur tous les workspaces.
