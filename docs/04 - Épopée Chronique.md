---
title: Épopée Chronique (Histoire / Events)
tags: [dungeonspace, prd, epic, chronique, events]
status: draft
---

# 04 — Épopée Chronique

← [[00 - Index]] · Alimente [[05 - Épopée Combat]] (replay) et [[06 - Épopée Constellation]] (liens)

## Problème

Une campagne dure des mois. Les actions importantes (mort d'un PNJ) *et* les micro-interactions (le PJ a insulté un garde) se perdent, alors qu'elles déterminent la cohérence du monde.

## Principe directeur

> **Tout ce qui se passe est un événement immuable.** Le reste (état d'un combat, récap, liens suggérés) est une *projection* de ce flux.

C'est ce qui rend possible le replay et l'auto-suggestion de liens. Les événements sont **append-only** (correction = nouvel événement qui annule/remplace, jamais d'update destructif).

## Modèle conceptuel d'un événement

| Champ | Description |
|---|---|
| `id`, `campaignId`, `sessionId?` | Identité et rattachement |
| `occurredAt` (temps réel) | Horodatage de saisie |
| `inGameTime?` | Date dans le monde (calendrier de campagne) — *Should* |
| `type` | Namespace + verbe : `combat.damage_dealt`, `social.insulted`, `character.died`, `item.acquired`, `narrative.note`… |
| `severity` / `importance` | 1 (anecdote) → 5 (pivot de campagne) |
| `actors[]` | Entités à l'origine (PJ, PNJ, faction) |
| `targets[]` | Entités affectées |
| `places[]` | Lieux concernés |
| `payload` | Données spécifiques au type (dégâts, objet, texte) |
| `visibility` | `dm_only` · `players` · `party_member:[ids]` |
| `source` | `system` (auto) · `dm` · `player` |
| `correlationId` | Regroupe les events d'un même contexte (un combat, une scène) |
| `rulesetId`, `schemaVersion` | Pour évoluer et supporter d'autres jeux ([[09 - Modularité multi-systèmes]]) |

> [!tip] Piste stack
> Les *time series collections* MongoDB conviennent à l'écriture massive (`timeField = occurredAt`, `metaField = campaignId`) mais limitent update/delete et certaines requêtes. Alternative : collection classique + index `{campaignId, occurredAt}`. À trancher en phase stack — voir [[11 - Estimation et risques]].

## Features

| ID | Feature | Priorité | Taille |
|---|---|:-:|:-:|
| CHR-01 | **Ingestion d'événements** via API (batch + unitaire), idempotente (clé d'idempotence) | M | M |
| CHR-02 | **Catalogue de types d'événements** extensible (par ruleset + custom MJ) | M | S |
| CHR-03 | **Timeline** de campagne : scroll infini, regroupement par session/corrélation | M | M |
| CHR-04 | **Filtres** : acteur, cible, lieu, type, importance, période, session | M | S |
| CHR-05 | **Visibilité** : un joueur ne voit que `players`/`party_member` le concernant | M | S |
| CHR-06 | **Saisie rapide MJ** : « quick log » en 2 clics (palette de commandes `/`, mentions `@PNJ`) | M | M |
| CHR-07 | **Auto-journalisation** par les autres services (combat, inventaire, XP, repos) | M | M |
| CHR-08 | **Sessions** : début/fin, numéro, titre, résumé | S | S |
| CHR-09 | **Recherche plein texte** sur notes et payloads textuels | S | M |
| CHR-10 | **Récap de session** auto (template, puis éventuellement LLM — *Could*) | S | M |
| CHR-11 | **Correction/annulation** d'un événement (event compensatoire, historique visible) | S | S |
| CHR-12 | **Flux temps réel** (abonnement) pour que la timeline se mette à jour pendant la session | S | S |
| CHR-13 | Calendrier in-game & chronologie du monde | C | M |
| CHR-14 | Export Markdown (compatible Obsidian !) / JSON | C | S |
| CHR-15 | Journal de campagne « côté joueur » (narratif, spoiler-free) | C | S |

## Exigences clés

- **Volume** : un combat ≈ 50-300 events ; une session ≈ 500-2000 ; campagne ≈ 100 k. Écriture < 50 ms p95.
- **Ordre** : ordre total par campagne garanti (séquence monotone) — indispensable au replay.
- **Rétention** : jamais de purge automatique côté MJ.
- **Évolution de schéma** : `schemaVersion` + upcasters à la lecture.

## Critères d'acceptation (extraits)

- [ ] Étant donné un coup porté en combat, un event `combat.damage_dealt` apparaît dans la timeline en < 1 s, avec acteur, cible, dégâts, `correlationId` du combat.
- [ ] Un joueur n'obtient **jamais** (API comprise) un event `dm_only`.
- [ ] Rejouer les events d'un combat dans l'ordre reconstruit exactement l'état final affiché (test de propriété).
- [ ] « Qui a affecté le Tavernier ? » se résout via filtre `targets=Tavernier` en < 300 ms sur 100 k events.

> [!question] Questions
> - Granularité : un jet de dé raté est-il un event ? (**Reco** : oui côté combat, désactivable via niveau de verbosité.)
> - Faut-il stocker les messages de chat ? (**Reco** : hors MVP.)
