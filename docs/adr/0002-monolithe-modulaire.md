---
title: "ADR 0002 — Monolithe modulaire plutôt que microservices"
status: accepted
date: 2026-10-08
nature: pragmatique
---

# ADR 0002 — Monolithe modulaire

## Contexte
Le risque R2 ([[11 - Estimation et risques]]) pointe la sur-ingénierie (microservices, gRPC, K8s, Kong pour deux développeurs).

## Décision
Une seule API, découpée en **modules par domaine** (`identity`, `campaigns`, `chronicle`, `characters`, `combat`, `constellation`,
`compendium`, `uploads`). Règles de conduite :
- un module possède ses tables (`*.tables.ts`), son service et ses routes ;
- un module n'appelle un autre module **que par son service** (jamais ses routes) ; les dépendances sont injectées
  explicitement dans la racine de composition `apps/api/src/app.ts` (pas de conteneur d'injection) ;
- l'autorisation par campagne passe toujours par `CampaignAccess`.

## Conséquences
- Transactions locales simples (ex. un combat écrit ses événements et met à jour sa rencontre atomiquement).
- Un module pourra être extrait en service si un besoin réel apparaît : ses frontières sont déjà explicites.
- Le verrou par rencontre (`CombatService.serialize`) suppose une seule instance d'API ; passer à plusieurs instances
  demanderait un verrou partagé (advisory lock PostgreSQL) et l'adaptateur Redis de Socket.IO.
