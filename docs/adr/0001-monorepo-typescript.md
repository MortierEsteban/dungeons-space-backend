---
title: "ADR 0001 — Monorepo TypeScript full-stack"
status: accepted
date: 2026-10-08
nature: pragmatique
---

# ADR 0001 — Monorepo TypeScript full-stack

## Contexte
Le dépôt contenait des prototypes en Go (gRPC), Python et Rust, sans front. Le besoin : une application web responsive, fortement
modulaire et maintenable par deux personnes à temps partiel. Aucune chaîne de build n'était installée sur le poste de développement.

## Décision
Un monorepo **npm workspaces** entièrement en TypeScript :
- `packages/rules` (moteur de règles pur), `packages/shared` (contrats d'API : schémas Zod + types) ;
- `apps/api` (Fastify, Drizzle, Socket.IO), `apps/web` (React, Vite, TanStack Query).

Les packages sont consommés **en source** (pas d'étape de build intermédiaire) : Vite, tsx, Vitest et tsup les transpilent directement.

## Conséquences
- Un seul langage, un seul outil (Node) ; les contrats sont vérifiés à la compilation des deux côtés.
- Le moteur de règles tourne à l'identique sur le serveur et dans le navigateur (aperçus, replay).
- Les services Go/Python existants ne sont pas réutilisés (cf. [[12 - Questions ouvertes]] Q11 : « réutiliser les concepts, pas forcément le code ») :
  le `Node` polymorphe (`Service` + `ReferencedId`) est devenu `nodes.ref_type` + `ref_id`, `NodeLink.Magnitude` a été scindé en `valence` + `intensity`.
