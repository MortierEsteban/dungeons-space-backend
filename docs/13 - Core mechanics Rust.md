---
title: Core mechanics Rust (dnd_core)
tags: [dungeonspace, rust, mecaniques, srd]
status: archived
---

# 13 — Core mechanics Rust (`dnd_core`)

← [[00 - Index]] · Alimente [[05 - Épopée Combat]], [[07 - Épopée Fondations de jeu]], [[09 - Modularité multi-systèmes]]

> [!warning] Archive
> Le crate a été retiré du dépôt (ADR 0011) : l'application utilise `packages/rules` (ADR 0005). Son code reste dans
> l'historique git (commit `94e5727`). Cette page sert de référence de couverture.

Crate `dnd_core/` (workspace Cargo). **SRD 5.1**, bibliothèque pure : aucun I/O, aucune horloge, aucun hasard caché.

## Décisions

| Sujet | Choix | Pourquoi |
|---|---|---|
| Édition | SRD 5.1 (2014) | Choix utilisateur ; CC-BY-4.0 ([[08 - Contenu et licences]]) |
| Forme | Crate sans I/O | Testable, rejouable, partageable serveur/navigateur |
| Hasard | Trait `Rng` + `SeededRng` (SplitMix64) + `ScriptedRng` | Replay déterministe, tests exacts |
| État | *decide / evolve* : `decide_*` émet des `Event`, `apply` est pur | Fondation du replay ([[05 - Épopée Combat]]) et de la Chronique ([[04 - Épopée Chronique]]) |
| Philosophie | Le moteur **calcule et informe**, ne bloque pas | Le MJ garde la main (voir [[01 - Vision et objectifs]]) |

## Couvert (≈100 tests, dont un test de propriété rejouant 200 combats aléatoires)

- **Dés** : `NdS`, `kh/kl`, avantage/désavantage (annulation), d20, tests de caractéristique/sauvegarde (pas de 20/1 spécial, conforme SRD).
- **Caractéristiques** : modificateur, tableau standard, point buy (27), tirage 4d6.
- **Compétences, maîtrise** (aucune / moitié / maîtrise / expertise), bonus de maîtrise, **XP et niveaux 1-20**, PV de niveau 1 et par niveau (moyenne ou jet).
- **Classes** (constantes mécaniques des 12 classes SRD), **multiclasse** (dés de vie, emplacements).
- **CA** (légère/intermédiaire/lourde, bouclier, défense sans armure barbare/moine, armure naturelle).
- **Attaque** : touche, critique (seuil configurable), échec auto sur 1, dégâts avec dés doublés sur critique.
- **Dégâts** : 13 types, résistance (arrondi inférieur), vulnérabilité, immunité.
- **PV** : PV temporaires, mort instantanée (dégâts massifs), jets de sauvegarde contre la mort, stabilisation, dés de vie, repos court/long.
- **14 conditions + épuisement 1-6** avec avantage/désavantage, échecs auto, vitesse.
- **Sorts** : tables d'emplacements (lanceur complet, demi, tiers, multiclasse), Pact Magic, DD de sort, bonus d'attaque, cantrips par niveau, vérification de l'emplacement (upcasting), **concentration** (DD, fin sur incapacité ou chute à 0).

## Hors périmètre volontaire

- Contenu (texte des sorts, monstres, capacités de classe) → données de ruleset ([[08 - Contenu et licences]]).
- Actions de combat (économie d'action, initiative, déplacement, portées) → prochaine tranche ([[05 - Épopée Combat]]).
- Repos : pas de PV max réduits par l'épuisement 4, pas de récupération « 1 PV après 1d4 h » d'une créature stable.
- Règles de la 5.2 (2024).

## À valider

- [ ] Cible **WASM** non testée (non installée dans l'environnement de dev).
- [ ] Forme finale des `Event` (champs, versionnage) à figer avec le schéma de [[04 - Épopée Chronique]] ; feature `serde` prête.
- [ ] « Ne plus y toucher » : le noyau est stable pour le SRD 5.1, mais le ruleset multi-systèmes ([[09 - Modularité multi-systèmes]]) imposera sans doute d'en extraire des traits.
