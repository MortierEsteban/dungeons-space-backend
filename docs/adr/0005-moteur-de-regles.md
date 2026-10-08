---
title: "ADR 0005 — Moteur de règles TypeScript partagé client/serveur"
status: accepted
date: 2026-10-08
nature: pragmatique
---

# ADR 0005 — Moteur de règles TypeScript

## Contexte
Le crate Rust `dnd_core` ([[13 - Core mechanics Rust]]) couvre les mécaniques SRD 5.1. Le compiler en WebAssembly et l'exposer à Node
demandait une chaîne Rust + MSVC absente du poste, et ajoutait une frontière de sérialisation à chaque commande de combat.

## Décision
Réécrire en TypeScript, dans `packages/rules`, les mécaniques nécessaires à l'application, avec les mêmes principes que `dnd_core` :
bibliothèque **pure** (aucune I/O), hasard injectable (`Rng`, `SeededRng`, `ScriptedRng`), séparation *decide / apply* pour le combat,
« le moteur calcule et informe, il ne bloque pas » (le MJ peut forcer une valeur : `overrides`).
Le contenu (sorts, monstres, objets) est de la **donnée** avec provenance, et un ruleset s'enregistre via l'interface `Ruleset`.

## Conséquences
- Un seul moteur exécuté côté serveur (autorité) et côté client (replay, aperçus) : aucune divergence possible.
- `dnd_core` reste la référence la plus complète (mort instantanée, multiclassage, Pact Magic détaillée…). Une évolution possible :
  compiler `dnd_core` en WASM et l'utiliser comme oracle de tests croisés pour `packages/rules`.
- Un second ruleset de démonstration (RUL-06) reste à écrire pour éprouver l'abstraction.
