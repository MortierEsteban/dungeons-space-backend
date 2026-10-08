# Architecture Decision Records

Chaque décision structurante est consignée ici, en précisant s'il s'agit d'un **choix pragmatique** ou d'un **choix d'apprentissage**
(voir « Tension à gérer » dans [[01 - Vision et objectifs]]).

| # | Décision | Nature |
|---|---|---|
| [0001](0001-monorepo-typescript.md) | Monorepo TypeScript full-stack | Pragmatique |
| [0002](0002-monolithe-modulaire.md) | Monolithe modulaire plutôt que microservices | Pragmatique |
| [0003](0003-journal-evenements.md) | Journal d'événements unique, vue joueur stockée | Structurant |
| [0004](0004-postgresql-pglite.md) | PostgreSQL partout, PGlite en développement | Pragmatique |
| [0005](0005-moteur-de-regles.md) | Moteur de règles TypeScript partagé client/serveur | Pragmatique |
| [0006](0006-temps-reel-serveur-autoritaire.md) | Temps réel : serveur autoritaire + événements | Structurant |
