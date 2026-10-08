---
title: "ADR 0003 — Journal d'événements unique, vue joueur stockée"
status: accepted
date: 2026-10-08
nature: structurant
---

# ADR 0003 — Journal d'événements unique

## Contexte
« Tout ce qui se passe est un événement immuable » ([[04 - Épopée Chronique]]). Le replay ([[05 - Épopée Combat]]) et les suggestions de
la Constellation en dépendent. La visibilité doit être filtrée côté serveur, y compris au niveau d'un champ (PV d'un monstre caché).

## Décision
- Une table `events` unique : séquence monotone par campagne (compteur verrouillé sur la ligne `campaigns`), `correlation_id`
  (une rencontre de combat), `category`, `importance`, `visibility` (`gm_only`, `players`, `party_member`), acteurs/cibles, clé d'idempotence.
- Les combats sont **event-sourcés** : leur état est `reduce(événements de la rencontre)`, avec le réducteur de `@ds/rules`.
- Chaque événement stocke sa **vue joueur** (`player_view` : type, titre, charge utile caviardée) calculée à l'écriture, quand on connaît
  l'état complet. Les lectures n'ont donc jamais besoin de rejouer l'histoire pour filtrer.
- Les corrections sont des événements `chronicle.correction` qui référencent l'original (jamais d'`UPDATE`).

## Conséquences
- La timeline, la recherche (« qui a affecté le Tavernier ? ») et le replay lisent la même source.
- Un test de propriété garantit que rejouer 200 combats aléatoires redonne l'état final, et qu'aucune information cachée n'atteint la vue joueur.
- Les événements de combat détaillés sont masqués de la timeline par défaut (catégories `combat` et `dice`), consultables par filtre.
