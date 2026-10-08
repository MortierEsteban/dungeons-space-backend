---
title: Modularité multi-systèmes
tags: [dungeonspace, prd, ruleset, architecture-produit]
status: draft
---

# 09 — Modularité multi-systèmes

← [[00 - Index]]

## Objectif

Supporter D&D 5e au MVP **sans fermer la porte** à Pathfinder 2e, Call of Cthulhu, Shadowdark, Cyberpunk RED, etc. Un système = un **ruleset** (« configuration de jeu »).

## Ce qui varie d'un jeu à l'autre

| Domaine | D&D 5e | Autre exemple (CoC) |
|---|---|---|
| Caractéristiques | 6 (FOR, DEX…) | 8 (APP, SAN…) |
| Résolution | d20 + mod vs DD | d100 sous compétence |
| Progression | XP + niveaux + classes | Pas de niveaux, amélioration par usage |
| Ressources | PV, emplacements de sorts | PV, Santé mentale, PM |
| Combat | Initiative, actions/bonus/réaction | Ordre par DEX, 1 action |
| États | 15 conditions | États spécifiques |
| Grille | 5 ft | Souvent sans grille |

## Principe

> Le **noyau** (campagne, events, constellation, tracker, replay, inventaire générique) est **agnostique**. Le **ruleset** fournit données + règles + gabarits d'UI.

### Ce qu'un ruleset déclare

| Bloc | Contenu | Format visé |
|---|---|---|
| `schema` | Définition de la fiche (champs, groupes, types) | JSON Schema / DSL déclaratif |
| `derived` | Formules dérivées (mod, CA, PV max…) | Expressions sandboxées (pas de code arbitraire) |
| `dice` | Types de jets, avantage/désavantage, critiques | Config |
| `progression` | Niveaux, tables d'XP, gains par niveau | Données |
| `conditions` | Statuts, durées, effets | Données |
| `events` | Types d'événements du jeu (étend [[04 - Épopée Chronique]]) | Catalogue |
| `combat` | Modèle d'initiative, économie d'action, règle de distance | Config |
| `content` | Classes, sorts, objets, monstres + provenance ([[08 - Contenu et licences]]) | Données |
| `ui` | Gabarit de fiche | Composants/layout |

## Features

| ID | Feature | Prio | Taille |
|---|---|:-:|:-:|
| RUL-01 | Concept `Ruleset` versionné, rattaché à une campagne (immuable une fois la campagne démarrée, sauf migration) | M | M |
| RUL-02 | Ruleset **D&D 5e SRD** livré en données (pas en code) | M | L |
| RUL-03 | Moteur d'évaluation de formules sandboxé | M | M |
| RUL-04 | Les services *characters*, *combat*, *events* lisent leurs règles du ruleset | M | L |
| RUL-05 | Éditeur/validateur de ruleset (CLI d'abord) | C | M |
| RUL-06 | Second ruleset de démonstration (ex. système minimal) pour **prouver** la modularité | S | M |
| RUL-07 | Migration de ruleset entre versions | C | L |

> [!warning] Piège classique
> L'abstraction prématurée. **Règle de conduite** : implémenter D&D 5e *via* les interfaces de ruleset dès le début, mais ne généraliser que ce que RUL-06 force à généraliser.

> [!tip] Existant
> `refservice/enums/` (classes, sous-classes, stats) est un premier jet *en code*. Cible : migrer ces énumérations vers des **données** du ruleset.
