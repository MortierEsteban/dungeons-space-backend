---
title: "ADR 0008 — Brouillard de guerre par utilisateur, calculé côté client"
status: accepted
date: 2026-10-08
nature: structurant
---

# ADR 0008 — Brouillard de guerre

## Contexte
Sur le plateau (2D ou 3D), chaque joueur ne doit voir que ce que voient ses personnages : murs et portes fermées arrêtent le regard,
le noir limite la vue, les feux et torches éclairent. Le MJ garde la main : il active le brouillard, peut partager la vision d'une
créature avec certains joueurs (ou tous), passer en vision de groupe, révéler ou masquer des zones.

## Décision
- **Vision calculée dans `packages/rules`** (`combat/vision.ts`), pure et testée : *shadowcasting* symétrique (si A voit B, B voit A),
  portée de vue dans le noir, lumière des feux et torches (elle aussi arrêtée par les murs), cases révélées par le MJ.
- **Sources de vision d'un utilisateur** : ses créatures ; tous les PJ en vision de groupe ; les créatures dont le MJ lui prête les yeux
  (`share_vision`, « * » = tous). Les PJ restent toujours visibles du groupe ; les autres créatures hors de vue quittent le
  plateau mais **gardent leur place dans l'initiative**, anonymisées (« Créature inconnue », sans position, portrait, PV, CA ni états) :
  l'ordre des tours est strictement celui du MJ et du serveur, quelle que soit la vision, et le tour d'une créature cachée reste
  visible comme tel. Le journal ne les nomme pas (« Une créature attaque… »).
- **Mémoire de la carte déduite du flux d'événements** (`FogMemory`, incrémentale) : les zones déjà vues restent assombries, avec leur
  décor. Elle est identique sur tous les appareils d'un joueur, rejouable (le replay applique le brouillard à l'instant rejoué) et
  effacée par le MJ (`fog_memory_reset`). Aucun stockage supplémentaire.
- Réglages et partages sont des **événements de combat** (`combat.fog_updated`, `vision_shared`, `cells_revealed`, `fog_memory_reset`),
  réservés au MJ. Le MJ voit tout, et peut prévisualiser la vue d'un joueur (« Voir comme »).

## Limite assumée (écart à l'ADR 0006)
Le calcul est **côté client** : les positions des créatures cachées par le brouillard parviennent au navigateur des joueurs, qui les
masque. Un joueur qui fouille les outils de développement peut les retrouver — comme dans Foundry ou Roll20. Les secrets du MJ au sens
de l'ADR 0006 (PV et CA masqués, pièges non révélés, jets secrets) restent, eux, filtrés par le serveur.
Le moteur de vision étant partagé, un filtrage serveur pourra s'y appuyer plus tard (flux temps réel par joueur, instantanés et
réponses de commandes masqués, visibilité de la Chronique), sans changer le rendu.
