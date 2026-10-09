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
| [0007](0007-plateau-3d.md) | Plateau de combat 3D isométrique, modèles .glb importés | Structurant |
| [0008](0008-brouillard-de-guerre.md) | Brouillard de guerre par utilisateur, calculé côté client | Structurant |
| [0009](0009-passifs-classes-homebrew-sorts.md) | Passifs typés, classes homebrew, sorts résolus sur le plateau, bibliothèque partagée | Structurant |
| [0010](0010-enregistrement-des-sessions.md) | Enregistrement permanent des sessions analysé par un modèle de langage, pondération de l'affichage | Structurant |
