---
title: Épopée Constellation
tags: [dungeonspace, prd, epic, constellation, graph, 3d]
status: draft
---

# 06 — Épopée Constellation

← [[00 - Index]] · Se nourrit de [[04 - Épopée Chronique]] et des entités de [[07 - Épopée Fondations de jeu]]

## Problème

Le MJ garde en tête (ou perd) un réseau de relations : *qui sait quoi, qui en veut à qui, quel événement a causé quoi*. Les wikis linéaires et les notes ne montrent pas ces connexions.

## Vision

Une **mind map 3D** réservée au MJ (vue joueur filtrée en option) où nœuds (personnages, événements, lieux, factions, objets) sont reliés par des liens qualifiés. **Cliquer sur une entité = voir immédiatement ce et ceux qu'elle affecte.**

> *« Tu as mis une patate au tavernier → lien `PJ Grog —[a frappé, −3]→ PNJ Tavernier` → la Constellation met le Tavernier en rouge autour de Grog et montre ses amis (les gardes) à un saut. »*

## Concepts

| Concept | Description | Existant dans le repo |
|---|---|---|
| **Nœud** | Entité du graphe. Pointe vers une entité réelle d'un autre service (`Service` + `ReferencedId`) ou est un nœud libre (idée, mystère, rumeur) | `Node` ✅ (`PlayerVisible` ✅) |
| **Lien** | Relation orientée, typée, avec **intensité** et **polarité** (positif/négatif), couleur, description | `NodeLink` (`Magnitude`, `colour`, `Description`) ✅ |
| **Type de lien** | `a_affecté`, `aime`, `déteste`, `connaît`, `dirige`, `a_causé`, `se_trouve_à`, `possède`… (catalogue + custom) | ❌ à ajouter |
| **Vue focus** | Sous-graphe centré sur un nœud, rayon N sauts | ❌ |
| **Calque temporel** | Le graphe tel qu'il était à la session/date X | ❌ (dépend de la Chronique) |

> [!tip] Observation sur l'existant
> `Magnitude` est non signé aujourd'hui (`uint64`) : il manque la **polarité** pour distinguer « aime » de « déteste ». Proposition : `valence ∈ [-5, +5]` séparée de `intensité`. À arbitrer en phase stack.

## Features

| ID | Feature | Prio | Taille |
|---|---|:-:|:-:|
| CST-01 | CRUD nœuds (types : PJ, PNJ, Événement, Lieu, Faction, Objet, Libre) | M | S |
| CST-02 | CRUD liens (type, intensité, polarité, couleur, note) | M | S |
| CST-03 | **Rendu 3D** navigable (orbite, zoom, sélection), labels lisibles, 60 fps jusqu'à 500 nœuds | M | L |
| CST-04 | **Vue focus** : clic sur un nœud → met en avant ses voisins à N sauts, atténue le reste | M | M |
| CST-05 | **Panneau détail** du nœud : fiche résumée, liens entrants/sortants, événements liés (lien vers [[04 - Épopée Chronique]]) | M | M |
| CST-06 | **Création rapide de lien** : glisser d'un nœud à un autre, ou palette `/` ; ≤ 3 interactions | M | M |
| CST-07 | Filtres : types de nœuds/liens, polarité, intensité min, visibilité | M | S |
| CST-08 | Recherche d'un nœud (autocomplétion) + « voler vers » | S | S |
| CST-09 | **Suggestions de liens depuis la Chronique** (ex. event `social.assaulted` ⇒ propose lien négatif acteur→cible, accepté en 1 clic) | S | L |
| CST-10 | **Création de nœud depuis un événement/une fiche** (« ajouter à la Constellation ») | S | S |
| CST-11 | **Calque temporel** : curseur session/date, le graphe « rejoue » son évolution | S | L |
| CST-12 | Mise en page : force-directed + épinglage manuel des nœuds, positions persistées | S | M |
| CST-13 | Regroupement (clusters : factions, lieux) ; collapse/expand | C | M |
| CST-14 | **Chemin entre deux nœuds** (« comment X est-il relié à Y ? ») | C | M |
| CST-15 | **Vue joueur** : sous-graphe des nœuds/liens `PlayerVisible` | C | M |
| CST-16 | Bascule vue **2D** (accessibilité/mobile/perf) | S | M |
| CST-17 | Export image/JSON ; import | C | S |
| CST-18 | Détection d'incohérences (PNJ mort ayant des événements après sa mort) | W | M |

## Exigences clés

- **Pas de friction de saisie** : si créer un lien est pénible, personne ne le fera — c'est le risque produit n°1 (voir [[11 - Estimation et risques]]). D'où CST-06 et CST-09.
- **Lisibilité > spectacle** : la 3D doit rester utile (focus, atténuation, labels qui font face à la caméra). Prévoir **2D** en repli (CST-16).
- **Perf** : 500 nœuds / 2 000 liens à 60 fps sur laptop standard ; chargement < 2 s.
- **Confidentialité** : le graphe est `dm_only` par défaut ; la visibilité joueur est opt-in par nœud/lien.

## Critères d'acceptation (extraits)

- [ ] Cliquer sur « Tavernier » affiche ses liens, met en évidence les PJ/PNJ à ≤ 2 sauts et estompe le reste, en < 200 ms.
- [ ] Je crée « Grog —a frappé→ Tavernier (négatif, 3) » en ≤ 3 interactions.
- [ ] L'événement `social.assaulted` crée une **suggestion** acceptable en un clic.
- [ ] Un joueur n'obtient aucun nœud/lien non `PlayerVisible`, même via l'API.

> [!question] Questions
> - Le graphe est-il **par campagne** uniquement ? (**Reco** : oui.)
> - Liens **orientés ou symétriques** ? (**Reco** : orientés, avec option « réciproque » créant le lien inverse.)
> - Faut-il stocker des liens vers des événements du *Combat* individuels (trop bruyant) ? (**Reco** : seuls les events d'importance ≥ 3 sont suggérés.)
