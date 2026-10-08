---
title: "ADR 0009 — Passifs mécaniques, classes homebrew et sorts résolus sur le plateau"
status: accepted
date: 2026-10-09
nature: structurant
---

# ADR 0009 — Passifs, classes homebrew et sorts

## Contexte
Les traits d'espèce et aptitudes de classe n'étaient que du texte : un nain n'avait pas sa résistance au poison, un barbare sa défense
sans armure ni la résistance de sa rage. Les tables veulent aussi des classes homebrew complètes (ressources type ki, rage, emplacements),
lancer leurs sorts depuis le plateau avec leur gabarit, et partager leurs créations entre campagnes.

## Décision
- **Effets typés** (`dnd5e/effects.ts`) : résistance, immunité, vulnérabilité, immunité à un état, avantage (situationnel), maîtrise,
  vitesse, vision dans le noir, CA sans armure, bonus de CA, initiative, PV par niveau, touche-à-tout. Un effet peut être conditionnel
  (`when: 'Rage'`) : affiché sur la fiche, appliqué en combat quand la créature porte l'état du même nom.
- **Catalogue + fiche** : les espèces et classes du SRD portent leurs effets. `deriveSheet` fusionne le catalogue avec les traits de la
  fiche (`sheetTraits`) : une fiche ancienne ou incomplète reçoit ses passifs sans migration, et un trait modifié sur la fiche
  (ascendance draconique, don) l'emporte. Les objets équipés (et harmonisés s'il le faut) ajoutent les leurs.
- **Ressources** (`ResourceDef`) : maximum en formule sûre (`level`, `pb`, `cha`, `min`/`max`…) ou par paliers (`1:2, 3:3`), recharge au
  repos court ou long ; seuls les usages dépensés sont stockés (`sheet.resources`).
- **Classe homebrew** = création « Classe » de la Forge (même schéma que les classes du SRD, `classDefSchema`). La fiche en embarque une
  copie (`customClass`, `classRef`) pour que les règles restent pures ; modifier la création met à jour les fiches qui la suivent.
- **Sorts en combat** : la commande client `cast_spell` est résolue par le serveur en `resolve_spell` (jamais acceptée d'un client) —
  emplacement dépensé sur la fiche, DD et attaque de sort dérivés, tours de magie et emplacements supérieurs mis à l'échelle, gabarit
  calculé (`combat/spells.ts`), un jet de dégâts par zone, une sauvegarde par cible (modificateurs portés par chaque créature),
  résistances et immunités appliquées. Nouveaux événements : `combat.spell_cast`, `combat.save_rolled`.
- **Bibliothèque partagée** : une création publiée (`shared`) est visible de tous ; l'import en masse copie (`sourceId`) dans les créations
  de l'utilisateur et sa campagne, sans doublon, et compte les imports.

## Conséquences
Les règles restent déterministes et testées dans `packages/rules`. Les avantages situationnels sont signalés, pas appliqués d'office
(« contre le charme » dépend de la fiction). Les défenses des PJ sont copiées dans le combat à leur entrée, comme leurs PV.
