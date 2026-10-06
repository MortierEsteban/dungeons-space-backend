---
title: Vision et objectifs
tags: [dungeonspace, prd, vision]
status: draft
---

# 01 — Vision et objectifs

← [[00 - Index]]

## Vision

> **DungeonSpace est la mémoire et le champ de bataille d'une campagne.**
> Là où les outils existants (D&D Beyond, Roll20, Foundry, Owlbear…) excellent sur la fiche, la table virtuelle ou le dé, DungeonSpace se concentre sur ce qui est mal servi : *retrouver ce qui s'est passé, comprendre pourquoi les PNJ réagissent ainsi, et rejouer ses combats*.

## Objectifs du projet (3 niveaux)

| # | Objectif | Ce que ça implique |
|---|---|---|
| 1 | **Apprendre** des technologies mal maîtrisées | Choix de stack assumés « pour apprendre » (voir phase stack), mais sans sacrifier l'objectif 2. |
| 2 | **Outil performant et simple** | Perf mesurable ([[10 - Exigences non fonctionnelles]]), UX pensée pour jouer *pendant* une session (peu de clics, clavier, mobile). |
| 3 | **Fun + portfolio** | Code propre, démo publique, README/ADR soignés, effet « wow » (Constellation 3D, replay). |

> [!warning] Tension à gérer
> Objectifs 1 et 2 peuvent entrer en conflit (ex. microservices + gRPC + K8s pour un MVP à 2 personnes). On documente chaque choix « d'apprentissage » comme tel dans un ADR — voir [[11 - Estimation et risques]].

## Différenciateurs

1. **Chronique complète** : tout est un événement, du coup fatal à la discussion avec un PNJ lambda → recherche, filtres, timeline.
2. **Replay de combat** façon Chess.com : revue tour par tour, annotations. Rendu possible *parce que* tout est event-sourcé.
3. **Constellation** : le graphe social/narratif vivant de la campagne, généré à moitié automatiquement depuis la Chronique.
4. **Multi-système by design** : D&D 5e d'abord, un « ruleset » pluggable ensuite ([[09 - Modularité multi-systèmes]]).

## Non-objectifs (MVP)

- ❌ Visioconférence, chat vocal, partage d'écran.
- ❌ Marketplace de contenu, monétisation.
- ❌ Automatisation complète des règles (le outil *assiste*, le MJ garde la main — voir [[05 - Épopée Combat]]).
- ❌ Reproduction de contenu protégé (voir [[08 - Contenu et licences]]).
- ❌ Application native (web responsive uniquement).

## Indicateurs de succès (MVP)

| Indicateur | Cible |
|---|---|
| Une campagne réelle jouée de bout en bout par nous deux + un groupe test | ≥ 3 sessions consécutives |
| Temps pour créer un PJ niveau 1 | < 10 min |
| Temps pour créer un lien dans la Constellation | < 5 s, ≤ 3 interactions |
| Temps pour retrouver « quand a-t-on rencontré X ? » | < 10 s |
| Fluidité du tracker de combat (action → écran des autres joueurs) | < 300 ms p95 |
| Constellation 3D | 60 fps jusqu'à 500 nœuds, utilisable à 2000 |
