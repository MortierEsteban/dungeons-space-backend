# DungeonSpace

> La mémoire et le champ de bataille de vos campagnes de jeu de rôle — **Explore · Battle · Create**.

Application web responsive (bureau, tablette, mobile) pour MJ et joueurs de D&D 5e (SRD 5.1), conçue pour accueillir d'autres systèmes.
Trois piliers : la **Chronique** (tout est événement), le **Combat** (plateau temps réel, rejouable) et la **Constellation** (le graphe des relations).

## Démarrage rapide

Prérequis : **Node.js ≥ 22** (aucune base de données à installer en local).

```bash
npm install
npm run dev
```

- Front : http://localhost:5173 — API : http://localhost:3000 (le front proxifie `/api`, `/uploads` et `/socket.io`).
- Au premier lancement, une campagne de démonstration (« Les Cendres de Valombre ») est créée.
  Les comptes de démo sont documentés dans [`apps/api/src/seed.ts`](apps/api/src/seed.ts) ; l'écran de connexion propose de les remplir en développement.
- Les données locales vivent dans `apps/api/.data/` (PostgreSQL embarqué via PGlite et images téléversées) : supprimez ce dossier pour repartir de zéro.

| Script | Rôle |
|---|---|
| `npm run dev` | API (rechargement à chaud) + front Vite |
| `npm test` | Tous les tests (règles, API, front) |
| `npm run typecheck` | Vérification TypeScript stricte de chaque workspace |
| `npm run build` | Bundle de l'API (`apps/api/dist`) et du front (`apps/web/dist`) |
| `npm run db:generate` | Génère une migration SQL après modification d'un fichier `*.tables.ts` |
| `npm run seed` | Peuple une base vide avec la campagne de démonstration |

## Architecture

Monorepo TypeScript (npm workspaces). Les dépendances vont toujours de haut en bas :

```
apps/web  (React + Vite)        apps/api  (Fastify + Drizzle + Socket.IO)
      \                            /
       └──── packages/shared ─────┘   contrats d'API : schémas Zod + types
                    │
             packages/rules           moteur de règles pur (sans I/O)
```

### `packages/rules` — le moteur de jeu
Bibliothèque pure, déterministe (hasard injectable) et partagée client/serveur :
dés (`2d6+3`, `4d6kh3`, avantage), ruleset **D&D 5e SRD 5.1** (caractéristiques, compétences, classes, espèces, progression,
emplacements de sorts, états, fiche et valeurs dérivées, repos, montée de niveau), contenu SRD avec provenance, générateurs
(PNJ, trésors), et **combat event-sourcé** : `decide` (commande → événements, permissions), `apply` (réducteur pur),
`redactCombatEventForPlayer` (vue joueur), grille (distance 5e, portée de déplacement, gabarits de zones).
Un ruleset implémente l'interface `Ruleset` et s'enregistre dans un registre : le noyau reste agnostique du système de jeu.

### `apps/api` — monolithe modulaire
Un dossier par domaine dans `src/modules/` : `identity`, `campaigns`, `chronicle`, `characters`, `combat`, `constellation`,
`compendium`, `uploads`. Chaque module possède ses tables (`*.tables.ts`), son service (logique applicative) et ses routes ;
les dépendances entre modules sont injectées explicitement dans la racine de composition [`src/app.ts`](apps/api/src/app.ts).

- **Chronique** : journal *append-only* (une séquence monotone par campagne, clé d'idempotence, corrections par événement compensatoire).
  Tous les modules y écrivent ; l'état d'un combat est la projection des événements de sa rencontre.
- **Visibilité côté serveur** : chaque événement stocke sa vue joueur (`player_view`) ; un joueur ne reçoit jamais un secret du MJ,
  ni par l'API ni par le temps réel (testé).
- **Temps réel** : Socket.IO, un salon MJ et un salon joueurs par campagne ; reconnexion avec resynchronisation complète.
- **Base** : PostgreSQL partout — serveur réel en production (`DATABASE_URL`), PGlite embarqué en développement et en test.

### `apps/web` — front responsive
`src/app` (routeur, coquille, navigation), `src/shared` (design system de la charte, client HTTP, temps réel, dés, moteur 3D),
`src/features/<rubrique>` (une rubrique = un dossier, chargé à la demande). Barre latérale sur bureau/tablette, onglets en bas sur mobile,
tracker de combat « théâtre de l'esprit » pour le téléphone.

| Rubrique | Contenu |
|---|---|
| Accueil | Accueil immersif (grand écran) ou classique, prochaine session |
| Explorer | Chronique 3D par sessions, frise filtrable, Constellation (focus, liens qualifiés, suggestions), campagnes publiques |
| Combattre | Plateau (terrain, zones, objets, mesures, portée), initiative, actions, PV masqués, tracker mobile, **replay** |
| Sanctuaire | Bibliothèque SRD et Forge des créations personnalisées |
| Personnage | Fiche complète (sorts, inventaire, harmonisation, notes privées/partagées, événements), PNJ |
| Génération | Création guidée de PJ, PNJ et trésors |
| Campagne | Sessions et récapitulatifs, code d'invitation, membres, réglages |

Les décisions structurantes sont consignées dans [`docs/adr`](docs/adr). Le cahier des charges (PRD) est dans [`docs/`](docs/00%20-%20Index.md).

## Production

```bash
npm run build
NODE_ENV=production JWT_SECRET=… DATABASE_URL=postgres://… WEB_DIST=../web/dist node apps/api/dist/main.js
```

L'API sert alors aussi le front (une seule origine, cookies `httpOnly` + `Secure`). Variables : voir [`apps/api/src/config.ts`](apps/api/src/config.ts)
(`PORT`, `DATABASE_URL`, `JWT_SECRET` obligatoire, `DATA_DIR` pour les fichiers téléversés, `WEB_DIST`, `SEED_DEMO`, `LOG_LEVEL`).
Les migrations SQL (`apps/api/drizzle`) s'appliquent au démarrage.

## Contenu & licences

Le contenu de règles provient du **System Reference Document 5.1** de Wizards of the Coast, sous licence **CC-BY-4.0** ;
l'attribution est affichée dans l'application (Crédits & licences). Les noms français et résumés sont des rédactions originales.
Le contenu créé par les utilisateurs (la Forge) est stocké séparément du contenu officiel.

## Existant

Les prototypes antérieurs (`node_service/`, `character_service/` en Go, stubs Python, `Docker-Compose.yaml` Kong) et le crate Rust
`dnd_core/` sont conservés tels quels. Voir l'ADR 0005 pour l'articulation avec `dnd_core`.
