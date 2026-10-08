---
title: Épopée Combat
tags: [dungeonspace, prd, epic, combat, realtime]
status: draft
---

# 05 — Épopée Combat

← [[00 - Index]] · Dépend de [[04 - Épopée Chronique]] et [[07 - Épopée Fondations de jeu]]

## Problème

Les combats D&D sont lents (calculs de distance, statuts oubliés, ordre d'initiative). Les VTT existants sont lourds ; les trackers simples n'ont pas de carte ; **aucun ne permet de revoir proprement un combat**.

## Positionnement

Pas un VTT généraliste. Un **« battle board »** : une carte, des pions, un tracker, des mesures — rapide à monter, rapide à jouer, **rejouable**.

> [!important] Philosophie d'automatisation
> L'outil **assiste, ne bloque pas**. Il calcule et suggère (distance, jet, concentration), le MJ valide ou force. Cela réduit drastiquement le périmètre règles et le risque juridique.

## Sous-épopées

### A. Scènes et cartes
| ID | Feature | Prio | Taille |
|---|---|:-:|:-:|
| CMB-01 | Création/édition de **Scène** (nom, map, grille carrée, taille de case, échelle 5 ft) | M | M |
| CMB-02 | **Import de map** : image PNG/JPG/WebP avec calibrage de grille | M | S |
| CMB-03 | Import au format **Universal VTT (.dd2vtt/.uvtt)** (murs/lumières embarqués, ignorés en MVP) | S | S |
| CMB-04 | **Bibliothèque de scènes** de campagne, duplication, tags | S | S |
| CMB-05 | Grille hexagonale | C | S |
| CMB-06 | Brouillard de guerre / vision / murs | C → W | XL |
| CMB-07 | Éditeur de scène (placer décor, zones de terrain difficile, annotations) | S | L |

### B. Pions (tokens)
| ID | Feature | Prio | Taille |
|---|---|:-:|:-:|
| CMB-10 | Tokens PJ (liés à la fiche) et PNJ/monstres (depuis bestiaire [[08 - Contenu et licences]]) | M | M |
| CMB-11 | Déplacement drag & drop, snap à la grille, taille (M, G, TG…) | M | M |
| CMB-12 | Barre de PV, PV temporaires, CA visible/masquée au joueur | M | S |
| CMB-13 | Icônes de statut sur le token | M | S |
| CMB-14 | Groupes de monstres (ex. 4 gobelins numérotés) et duplication rapide | S | S |

### C. Mesures et overlays *(le cœur « surcouche »)*
| ID | Feature | Prio | Taille |
|---|---|:-:|:-:|
| CMB-20 | **Règle de distance** (règle 5e : diagonale = 5 ft, variante 5/10/5) | M | S |
| CMB-21 | **Portée de déplacement** : zone atteignable selon vitesse, terrain difficile, pions bloquants | M | M |
| CMB-22 | **Gabarits de sorts/aptitudes** : cône, sphère, ligne, cube, cylindre — posables et orientables | M | M |
| CMB-23 | Surbrillance des **cibles dans le gabarit** et dans la portée de l'arme/sort | S | M |
| CMB-24 | Alerte **attaque d'opportunité** à la sortie de portée de mêlée | C | S |
| CMB-25 | Couverture, hauteur/altitude | C | M |

### D. Tour par tour
| ID | Feature | Prio | Taille |
|---|---|:-:|:-:|
| CMB-30 | **Initiative** : jet auto/manuel, ordre éditable, égalités, surprise | M | M |
| CMB-31 | **Tracker** : round, tour actif, passage suivant/précédent, retard (*delay/ready*) | M | M |
| CMB-32 | **Économie d'action** : action, bonus, réaction, mouvement restant, interaction d'objet | S | M |
| CMB-33 | **Statuts (conditions)** : les 15 conditions 5e + custom, durée en rounds, fin au début/à la fin du tour | M | M |
| CMB-34 | Concentration (rappel de jet de sauvegarde en cas de dégâts) | S | S |
| CMB-35 | Jets de sauvegarde de mort, état *inconscient/mort* | S | S |
| CMB-36 | Sorts à emplacements : consommation depuis la fiche | S | M |
| CMB-37 | Actions légendaires, actions de repaire | C | M |

### E. Actions et jets
| ID | Feature | Prio | Taille |
|---|---|:-:|:-:|
| CMB-40 | Moteur de dés (notation `2d6+3`, avantage/désavantage), historique visible | M | S |
| CMB-41 | Attaque assistée : jet, comparaison CA, dégâts proposés, application d'un clic | S | M |
| CMB-42 | Résistances / vulnérabilités / immunités | S | S |

### F. Temps réel et rôles
| ID | Feature | Prio | Taille |
|---|---|:-:|:-:|
| CMB-50 | **Synchronisation temps réel** MJ ↔ joueurs (tokens, tour, PV) | M | L |
| CMB-51 | Permissions : joueur ne déplace que son pion ; MJ tout | M | S |
| CMB-52 | Reconnexion/reprise d'état, résolution de conflits | M | M |
| CMB-53 | Ping / pointeur / marqueurs temporaires | C | S |

### G. Replay *(la signature)*
| ID | Feature | Prio | Taille |
|---|---|:-:|:-:|
| CMB-60 | **Journalisation exhaustive** : chaque action de combat = event ([[04 - Épopée Chronique]]) avec `correlationId` = id du combat | M | M |
| CMB-61 | **Lecteur de replay** : play/pause, vitesse, saut au tour N, barre de progression | S | L |
| CMB-62 | Reconstruction d'état à n'importe quel point (snapshots + events) | S | M |
| CMB-63 | **Chronologie du combat** : timeline de tours avec faits marquants (crit, mort, sort majeur) | S | M |
| CMB-64 | Annotations MJ / « moments forts » partageables | C | M |
| CMB-65 | Statistiques post-combat (dégâts infligés/subis, soins, MVP) | C | M |
| CMB-66 | Export vidéo/GIF d'un moment fort | W | L |

## Modèle de journalisation (exigence forte)

Pour que le replay marche, les events de combat doivent être **suffisants pour reconstruire l'état** (pas seulement « informatifs ») :

`combat.started` · `combat.initiative_rolled` · `combat.turn_started` · `token.moved{from,to,path}` · `attack.rolled` · `damage.applied{amount,type,hp_before,hp_after}` · `condition.applied/removed` · `spell.cast{slot}` · `combat.ended`

> [!tip] Piste stack
> Event sourcing côté combat : l'état courant = `reduce(events)`. Le même reducer sert au temps réel *et* au replay → zéro divergence. Voir [[11 - Estimation et risques]].

## Critères d'acceptation (extraits)

- [ ] Un combat 4 PJ vs 6 monstres se joue de bout en bout sans recharger la page.
- [ ] Le déplacement d'un pion est visible chez les autres en < 300 ms p95.
- [ ] La distance affichée respecte la règle 5e configurée.
- [ ] Rejouer un combat fini produit l'état final identique (PV, statuts, positions).
- [ ] Un joueur ne voit pas les PV exacts d'un monstre si le MJ les a masqués.

> [!question] Questions
> - Vue joueur : écran partagé unique ou chaque joueur sur son appareil ? (**Reco** : chacun son appareil, mobile-first pour le tracker.)
> - Un combat se joue-t-il sans carte (« theatre of the mind ») ? (**Reco** : oui, tracker seul = mode dégradé *Must*, il sert aussi de fallback.)
