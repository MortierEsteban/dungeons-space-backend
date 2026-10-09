---
title: Questions ouvertes
tags: [dungeonspace, prd, decisions]
status: draft
---

# 12 — Questions ouvertes

← [[00 - Index]]

À trancher ensemble avant de passer à la stack. Les plus structurantes en premier.

| # | Question | Impact | Ma recommandation | Décision |
|---|---|---|---|---|
| Q1 | **Contenu** : SRD uniquement pour le MVP, ou scraping (privé) en plus ? ([[08 - Contenu et licences]]) | Légal, portfolio, import | SRD CC-BY + packs utilisateur | ☐ |
| Q2 | **Portée du MVP** : vertical slice resserré ([[11 - Estimation et risques]]) ou périmètre complet ? | Planning | Vertical slice | ☐ |
| Q3 | **Ordre** : Combat avant Constellation, ou l'inverse ? | Effet « wow » vs dépendances | Chronique → Constellation → Combat si portfolio prioritaire ; sinon Combat d'abord | ☐ |
| Q4 | **Temps réel** indispensable dès le MVP, ou MJ seul pilote l'écran partagé ? | Gros levier de charge (CMB-50/52) | Temps réel, mais simple (serveur autoritaire) | ☐ |
| Q5 | **Mobile** : web responsive suffit ? | Effort UI | Oui, PWA | ☐ |
| Q6 | **Langue** : interface FR+EN, contenu EN ? | i18n | Oui | ☐ |
| Q7 | **Automatisation des règles** : assister vs imposer | Périmètre | Assister, override toujours possible | ☐ |
| Q8 | **Hébergement/public** : démo publique ouverte ou sur invitation ? | Sécurité, coût | Démo publique avec campagne seed en lecture seule | ☐ |
| Q9 | **Multi-système** : second ruleset de preuve dès le MVP ? (RUL-06) | Valide l'architecture | Oui, minimal | ☐ |
| Q10 | **Constellation** : polarité/intensité séparées, liens orientés ? ([[06 - Épopée Constellation]]) | Modèle de données | Oui | ☐ |
| Q11 | **Existant** : on repart de zéro ou on réutilise `node_service` / `character_service` ? | Stack | Réutiliser les concepts, pas forcément le code | ☑ Concepts repris dans le monorepo TypeScript, code retiré (ADR 0011) |
| Q12 | **Nom & identité** (« DungeonSpace », « Constellation ») : dispo des noms/domaines, risque de marque ? | Portfolio | À vérifier | ☐ |
| Q13 | Qui joue le **groupe test** et quand démarre-t-on une vraie campagne dessus ? | Validation produit | Dès M1 | ☐ |
