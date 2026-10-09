---
title: "ADR 0011 — Retrait des prototypes du dépôt"
status: accepted
date: 2026-10-09
nature: pragmatique
---

# ADR 0011 — Retrait des prototypes

## Contexte
Le dépôt conservait les prototypes antérieurs à l'application : services Go + gRPC (`node_service`, `character_service`, dont un
binaire `main.exe` versionné), stubs Python (`refservice`, `event_service`, `logs_service`, `places_service`, `kubernetes`),
un `Docker-Compose.yaml` Kong + Postgres (chemin Windows en dur) et le crate Rust `dnd_core` avec son workspace Cargo.
Aucun n'est utilisé par le monorepo TypeScript : l'architecture est un monolithe modulaire ([ADR 0002](0002-monolithe-modulaire.md))
et le moteur de règles est `packages/rules` ([ADR 0005](0005-moteur-de-regles.md)).

## Décision
Supprimer ces dossiers et fichiers, ainsi que la configuration IntelliJ versionnée (`.idea/`) et l'image dupliquée `ImagesUtils/`.
Le `.gitignore` est réduit à ce que le monorepo produit. Les maquettes de `Frontend/` restent : le front y fait référence.

## Conséquences
- Le dépôt ne contient plus que l'application et sa documentation ; un nouvel arrivant n'a plus à deviner ce qui est vivant.
- Le code retiré reste dans l'historique git (crate Rust : commit `94e5727` ; services Go : commits de février-mars 2025).
- La couverture de `dnd_core` est archivée dans [[13 - Core mechanics Rust]] comme référence pour enrichir `packages/rules`.
