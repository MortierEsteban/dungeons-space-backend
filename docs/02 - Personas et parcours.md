---
title: Personas et parcours
tags: [dungeonspace, prd, personas, ux]
status: draft
---

# 02 — Personas et parcours

← [[00 - Index]]

## Personas

### 🎭 Maëlle, Maîtresse du Jeu (persona principal)
- Mène une campagne hebdomadaire/bimensuelle, 4-5 joueurs, prépare 2-3 h par session.
- **Douleurs** : oublie ce qui a été dit/fait, se perd dans ses notes, les PNJ deviennent incohérents, jongle entre 5 onglets en combat.
- **Attend** : retrouver vite, préparer vite, ne pas être ralentie à la table.

### 🗡️ Karim, Joueur
- Joue un PJ, veut sa fiche à jour, son inventaire, ses sorts, ses notes personnelles.
- **Douleurs** : oublie les noms/PNJ, ne sait plus ce que son perso a promis. Sur mobile à la table.
- **Attend** : fiche rapide, journal de campagne lisible (sans spoilers MJ).

### 👀 Léa, Joueuse occasionnelle / Spectatrice *(post-MVP)*
- Rejoint par lien, consulte la Chronique et regarde les replays.

### 🧑‍💻 Nous (développeurs)
- Veulent un projet démontrable : un compte démo, un seed de campagne, un replay spectaculaire.

## Rôles et droits

| Capacité | MJ | Joueur | Spectateur |
|---|:-:|:-:|:-:|
| Créer/configurer la campagne | ✅ | ❌ | ❌ |
| Voir tous les événements | ✅ | filtrés (`playerVisible`) | filtrés |
| Éditer sa fiche | ✅ (toutes) | ✅ (la sienne) | ❌ |
| Contrôler un combat (PNJ, ordre, statuts) | ✅ | ❌ | ❌ |
| Déplacer son pion / lancer ses actions | ✅ | ✅ | ❌ |
| Constellation | ✅ édition | 👁️ vue filtrée *(Could)* | ❌ |
| Notes privées | ✅ | ✅ | ❌ |

> [!question] Décision
> Un utilisateur peut-il être MJ dans une campagne et joueur dans une autre ? **Recommandation : oui**, le rôle est porté par l'appartenance à la campagne, pas par le compte.

## Parcours clés

### P1 — Préparer une session (MJ)
1. Ouvre la campagne → voit le **récap de la dernière session** (généré depuis [[04 - Épopée Chronique]]).
2. Ouvre la [[06 - Épopée Constellation]], clique sur le PNJ « Tavernier » → voit en un coup d'œil qui l'a affecté (le barbare lui a mis un coup de poing, −3 d'affinité).
3. Prépare une **scène de combat** (import d'une map, placement de monstres) → [[05 - Épopée Combat]].

### P2 — Jouer une session
1. MJ démarre la **session** (marqueur dans la Chronique).
2. Les joueurs rejoignent ; leurs fiches sont accessibles.
3. Les actions sont **journalisées automatiquement** (jets, dégâts, achats) ; le MJ ajoute des événements narratifs en 2 clics (« les PJ ont promis de retrouver X »).
4. Combat : init → tours → fin. Tout est capturé.
5. Fin de session : XP, butin, résumé auto + édition.

### P3 — Revoir un combat (tous)
Chronique → événement « Combat : Embuscade des gobelins » → **Replay** : barre de progression, tour par tour, annotations du MJ.

### P4 — Créer un personnage (joueur)
Choix du système/ruleset → race/espèce, classe, historique, caractéristiques, équipement → feuille validée → rattachement à la campagne. Voir [[07 - Épopée Fondations de jeu]].
