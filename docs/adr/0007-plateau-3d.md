---
title: "ADR 0007 — Plateau de combat 3D (isométrique) et modèles importés"
status: accepted
date: 2026-10-08
nature: structurant
---

# ADR 0007 — Plateau de combat 3D

## Contexte
Le plateau 2D (DOM en couches) est lisible mais plat. Les joueurs veulent voir *leur* personnage sur la table, et le MJ veut garder
son flux de travail : importer une carte en image (vue de dessus), puis la retoucher (murs, eau, lave, végétation, objets, zones).

## Décision
- **Rendu WebGL avec three.js + React Three Fiber** (`@react-three/drei` pour les caméras, contrôles, étiquettes HTML et chargement glTF).
  Le plateau 3D est un **second rendu du même état** : mêmes `BoardProps`, mêmes commandes, mêmes permissions. Aucune règle n'est
  dupliquée côté 3D ; le serveur reste autoritaire (ADR 0006). Le module est chargé à la demande (bundle principal inchangé),
  et le plateau 2D reste disponible (bascule 2D/3D, repli automatique sans WebGL).
- **Vue isométrique orthographique par défaut** (lisible, sans déformation, quarts de tour animés) et **vue libre en perspective**.
- **La carte reste une image** posée sur le sol (recadrage « cover », identique au 2D). Le terrain peint par le MJ prend du relief :
  murs extrudés, eau et lave animées par shaders, rochers et végétation instanciés, objets modélisés et éclairés (feux, torches).
- **Modèles des personnages** : un fichier **glTF binaire (.glb) autonome** téléversé par le joueur (fiche → « Apparence 3D »,
  ou inspecteur du combat). Sans modèle, la créature est un **jeton simple** (pièce aux couleurs du camp, portrait ou initiales).
  Le modèle est mis à l'échelle de la case, posé au sol, orienté dans le sens de la marche, et joue ses clips `idle`/`walk`/`death`
  s'il en possède. Un modèle illisible retombe sur le jeton (frontière d'erreur), jamais sur un écran blanc.
- Données : colonne `characters.model_url` (modèle par défaut du PJ) et champ facultatif `modelUrl` du combattant, modifié par la
  commande `set_model` (propriétaire ou MJ) → événement `combat.combatant_updated`. Les anciens combats restent rejouables.

## Sécurité
- Le serveur reconnaît un GLB par sa signature (jamais par l'extension), vérifie la version, la longueur et le bloc JSON, et **refuse
  toute ressource externe** (`uri` non `data:`) : un modèle ne peut pas faire charger d'URL tierce au navigateur des autres joueurs.
- Une commande n'accepte qu'un chemin `/uploads/<uuid>.glb` (validation Zod partagée) ; 32 Mo maximum (8 Mo pour une image).
- Le décodeur Draco est servi localement (`/draco/`) : aucune dépendance à un CDN.

## Conséquences
- Poids : three.js et R3F ne sont téléchargés qu'à l'ouverture d'un plateau 3D ou d'un aperçu de modèle.
- Les préférences de vue (caméra, grille, murs bas, ambiance jour/crépuscule/nuit) sont locales à chaque appareil, pas partagées.
- Reste ouvert : brouillard de guerre, élévation par case, lignes de vue calculées sur les murs 3D, import de décors en glTF par le MJ.
