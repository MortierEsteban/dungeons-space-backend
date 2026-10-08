---
title: "ADR 0006 — Temps réel : serveur autoritaire et événements"
status: accepted
date: 2026-10-08
nature: structurant
---

# ADR 0006 — Temps réel

## Contexte
Le combat doit être fluide entre appareils (< 300 ms p95, CMB-50), résister aux reconnexions (CMB-52) et ne jamais révéler aux joueurs
ce que le MJ cache.

## Décision
- Les clients envoient des **commandes** par HTTP (`POST /encounters/:id/commands`) ; le serveur valide (Zod), vérifie les permissions,
  lance les dés, produit des événements via `decideCombat`, les persiste puis les diffuse.
- La diffusion passe par **Socket.IO** : un salon MJ et un salon joueurs par campagne, alimentés avec la version complète ou caviardée
  de chaque événement. L'authentification du socket réutilise le cookie de session.
- Le client applique les événements avec le réducteur partagé et les dédoublonne par numéro de séquence ; après une reconnexion,
  il recharge l'instantané complet.

## Conséquences
- Pas de résolution de conflits côté client : l'ordre est celui du serveur.
- Les dés sont toujours lancés côté serveur (journalisés dans la Chronique), le client ne fait qu'animer le résultat.
