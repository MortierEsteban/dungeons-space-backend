---
title: Épopée Fondations de jeu
tags: [dungeonspace, prd, epic, fondations, personnages]
status: draft
service: character_service
---

# 07 — Épopée Fondations de jeu

← [[00 - Index]]

Tout ce qui est « nécessaire à un tel jeu » et qui conditionne les trois piliers : comptes, campagnes, fiches, objets, inventaire, progression, notes.

## A. Comptes et campagnes
| ID | Feature | Prio | Taille |
|---|---|:-:|:-:|
| FND-01 | Inscription/connexion (email+mdp, OAuth Google/Discord), sessions sécurisées | M | M |
| FND-02 | **Campagne** : création, ruleset choisi ([[09 - Modularité multi-systèmes]]), description, image | M | S |
| FND-03 | Invitations par lien/code, rôles MJ/Joueur ; multi-campagnes par compte | M | M |
| FND-04 | Co-MJ / MJ adjoint | C | S |
| FND-05 | Profil, préférences (langue FR/EN, thème, unités) | S | S |

## B. Fiche personnage (PJ)
| ID | Feature | Prio | Taille |
|---|---|:-:|:-:|
| FND-10 | Création guidée : espèce/race, classe, historique, caractéristiques (tirage, point buy, standard array) | M | L |
| FND-11 | Calculs dérivés : modificateurs, bonus de maîtrise, CA, initiative, jets de sauvegarde, compétences, perception passive | M | M |
| FND-12 | **Points de vie** : max, actuels, temporaires, dés de vie, repos court/long | M | M |
| FND-13 | **Niveau, XP, classe** : gain d'XP, passage de niveau, **level-up guidé** (choix de capacités, PV, sous-classe) | M | L |
| FND-14 | Multiclassage | S | M |
| FND-15 | Capacités de classe/espèce, dons, langues, maîtrises | M | M |
| FND-16 | **Sorts** : liste connue/préparée, emplacements, rituels, concentration | S | L |
| FND-17 | Notes personnelles (privées / partagées), biographie, traits, alignement | S | S |
| FND-18 | Fiche **mobile-first** lisible à table | S | M |
| FND-19 | Compagnons/familiers/invocations | C | M |
| FND-20 | Import de fiche (JSON exporté) | C | M |

## C. PNJ et monstres
| ID | Feature | Prio | Taille |
|---|---|:-:|:-:|
| FND-30 | PNJ de campagne (fiche simplifiée, notes MJ, attitude) — pointés par la [[06 - Épopée Constellation]] | M | M |
| FND-31 | **Bestiaire** (monstres SRD) consultable, filtrable (CR, type), instanciable en combat | M | M |
| FND-32 | Monstres/PNJ personnalisés (clone + édition) | S | M |
| FND-33 | Générateur de rencontres (budget XP) | C | M |

## D. Objets et inventaire
| ID | Feature | Prio | Taille |
|---|---|:-:|:-:|
| FND-40 | **Catalogue d'objets** du ruleset (armes, armures, équipement, objets magiques SRD) | M | M |
| FND-41 | **Création d'objets custom** (type, propriétés, dégâts, bonus, rareté, poids, valeur, description, image) | M | M |
| FND-42 | **Inventaire** : ajout/retrait, quantités, équipé/porté, conteneurs, poids/encombrement | M | M |
| FND-43 | Monnaies (pc/pa/pe/po/pp), conversions, transactions | S | S |
| FND-44 | Objets magiques : harmonisation (attunement, max 3), charges, malédictions | S | M |
| FND-45 | Transfert d'objets entre personnages / butin de fin de combat | S | M |
| FND-46 | Effets d'objets appliqués à la fiche (bonus CA, caractéristiques) | S | L |
| FND-47 | Coffres/inventaires de lieu (partagés) | C | S |

## E. Progression et session
| ID | Feature | Prio | Taille |
|---|---|:-:|:-:|
| FND-50 | Distribution d'XP (par rencontre, par jalon) | M | S |
| FND-51 | Repos court/long (restauration PV, dés de vie, emplacements) | M | S |
| FND-52 | Jalons/niveaux « milestone » | S | S |

> [!important] Règle transverse
> Toute mutation significative (gain de niveau, objet acquis, PV, mort) **émet un événement** vers [[04 - Épopée Chronique]].

## Exigences clés

- La fiche ne **bloque pas** : le MJ/joueur peut toujours forcer une valeur (« override ») avec marqueur visuel.
- Les règles viennent du **ruleset**, jamais codées en dur dans le moteur ([[09 - Modularité multi-systèmes]]).
- Contenu importé : voir [[08 - Contenu et licences]].
