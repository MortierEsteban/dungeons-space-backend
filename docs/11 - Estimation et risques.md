---
title: Estimation et risques
tags: [dungeonspace, prd, estimation, risques]
status: draft
---

# 11 — Estimation et risques

← [[00 - Index]]

> [!warning] Hypothèses
> Estimations **grossières** (±50 %), pour 2 personnes à temps partiel (~8-10 h/semaine chacune, soit ≈ 1 « semaine-projet » = ~18 h cumulées), incluant apprentissage de technos nouvelles. À raffiner après le choix de stack.

## Conversion des tailles

| Taille | Semaines-projet |
|---|---|
| XS | 0,2 |
| S | 0,5 |
| M | 1,5 |
| L | 4 |
| XL | 8+ |

## Estimation par pilier (Must + Should)

| Pilier | Must (sem.) | Should (sem.) | Commentaire |
|---|:-:|:-:|---|
| Fondations ([[07 - Épopée Fondations de jeu]]) | ~20 | ~13 | Le gros du volume vient de la fiche, du level-up et des sorts |
| Rulesets + contenu ([[09 - Modularité multi-systèmes]], [[08 - Contenu et licences]]) | ~11 | ~6 | Importer le SRD proprement coûte cher |
| Chronique ([[04 - Épopée Chronique]]) | ~7 | ~6 | Petit en volume, critique en conception |
| Combat ([[05 - Épopée Combat]]) | ~21 | ~21 | Le temps réel et le replay pèsent lourd |
| Constellation ([[06 - Épopée Constellation]]) | ~13 | ~14 | Dominé par le rendu 3D et les suggestions |
| Transverse (NFR, CI, infra, design) | ~10 | ~6 | |
| **Total** | **~80** | **~66** | |

**Lecture** : ≈ **80 semaines-projet pour les Must** ≈ **~9-10 mois à plein régime à deux** ; il faut compter plutôt **12-18 mois** réalistes à temps partiel avec apprentissage.

> [!important] Conclusion
> Le périmètre brut est **trop gros pour un « MVP »**. Il faut un **MVP vertical** (une tranche fine traversant les 3 piliers) plutôt qu'un MVP horizontal.

## Proposition de MVP resserré (« Vertical Slice »)

Garder pour une **v0.1 jouable en ~5-6 mois** :

- Fondations : auth, campagne, **PJ niveau 1-5 simplifié**, inventaire basique, XP.
- Chronique : ingestion, timeline, filtres, visibilité (CHR-01→07).
- Combat : map image + grille, tokens, initiative/tracker, PV, statuts, règle de distance + gabarits, temps réel, **journalisation** (sans lecteur de replay).
- Constellation : nœuds/liens, 3D, focus, création rapide (CST-01→07).
- Contenu : SRD uniquement.

Reporter en v0.2 : **replay**, suggestions auto, level-up complet, sorts avancés, calque temporel, import UVTT.

## Registre des risques

| # | Risque | Proba | Impact | Mitigation |
|---|---|:-:|:-:|---|
| R1 | **Juridique** : scraping de contenu protégé | Haute | Haute | SRD CC-BY + packs utilisateur ([[08 - Contenu et licences]]) |
| R2 | **Sur-ingénierie** : microservices, gRPC, K8s, Kong pour 2 devs | Haute | Haute | Monolithe modulaire d'abord ou nombre de services réduit ; ADR « apprentissage vs pragmatique » |
| R3 | **Temps réel** (sync, reconnexion, conflits) plus dur que prévu | Moy. | Haute | Event sourcing + serveur autoritaire ; prototype tôt (spike) |
| R4 | **Friction de saisie** de la Constellation → abandon | Haute | Haute | CST-06 (≤3 interactions), CST-09 (suggestions), tester avec une vraie campagne |
| R5 | **Perf 3D** sur mobiles/laptops modestes | Moy. | Moy. | Budget perf, LOD, fallback 2D (CST-16) |
| R6 | **Modèle d'événements** mal conçu → replay impossible / refonte | Moy. | Haute | Spike : rejouer un combat factice avant de figer le schéma ; `schemaVersion` |
| R7 | **Time series Mongo** inadaptées (update/delete limités, requêtes) | Moy. | Moy. | Comparer avec collection classique indexée en spike |
| R8 | **Abstraction ruleset prématurée** | Moy. | Moy. | RUL-06 (second ruleset minimal) comme test |
| R9 | **Complexité règles D&D** (level-up, sorts, exceptions) | Haute | Moy. | Assister sans bloquer (override), périmètre SRD, niveaux 1-5 d'abord |
| R10 | **Épuisement / dispersion** (projet perso) | Moy. | Haute | Jalons courts démontrables, démo publique à chaque jalon |
| R11 | Fuite de visibilité (spoilers MJ vus des joueurs) | Moy. | Haute | Filtrage serveur + tests automatisés dédiés |
| R12 | Dépendance de repo existant (code non fonctionnel) | Moy. | Faible | Considérer l'existant comme prototype jetable |

## Spikes recommandés (avant de figer la stack)

1. **Event & replay** : modéliser 30 events de combat, écrire le reducer, rejouer. *(R6, R7)*
2. **Temps réel** : 2 clients, déplacement de pion, reconnexion. *(R3)*
3. **Constellation 3D** : 1 000 nœuds en rendu WebGL avec focus/atténuation. *(R5)*
4. **Import SRD** : charger classes + monstres dans un schéma de ruleset. *(R1, R8)*
