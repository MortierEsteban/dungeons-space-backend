---
title: "ADR 0004 — PostgreSQL partout, PGlite en développement"
status: accepted
date: 2026-10-08
nature: pragmatique
---

# ADR 0004 — PostgreSQL partout, PGlite en développement

## Contexte
Le PRD envisageait MongoDB (time series) pour les événements ([[04 - Épopée Chronique]], risque R7). Le poste de développement n'avait ni Docker
ni base installée.

## Décision
- **PostgreSQL** pour tout (relations campagnes/membres/personnages, JSONB pour les fiches et charges utiles d'événements,
  index `{campaign_id, category, seq}` et `{correlation_id, seq}`).
- **Drizzle ORM** (schéma TypeScript par module, migrations SQL générées par `drizzle-kit`).
- En développement et en test : **PGlite** (PostgreSQL compilé en WebAssembly, embarqué) ; en production : un serveur PostgreSQL via
  `DATABASE_URL`. Même dialecte, mêmes migrations.

## Conséquences
- `npm install && npm run dev` suffit ; les tests d'intégration tournent sur une base en mémoire fraîche.
- Les requêtes de la Chronique restent des requêtes indexées classiques (pas de collection time series à contourner).
- La recherche plein texte utilise `ILIKE` ; un index `pg_trgm` ou `tsvector` sera à ajouter au-delà de ~100 k événements par campagne.
