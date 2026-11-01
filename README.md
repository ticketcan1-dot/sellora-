# Sellora AI

Application SaaS pour commerçants marocains : boutiques, catalogue, clients, commandes, conversations Instagram/WhatsApp et assistant français, arabe et darija. Next.js App Router, TypeScript strict, Supabase/PostgreSQL et Tailwind.

## Fonctionnalités

- Authentification, confirmation email, récupération et approbation des comptes par `/admin`. Une session en attente rejoint automatiquement l’application après approbation.
- Multi-boutiques isolées par RLS ; rôles owner/admin/agent/viewer, invitations liées à l’email, transfert de propriété et révocation.
- Produits/variantes, SKU, prix MAD, stock, images privées réencodées et import CSV avec rapport.
- Clients, consentements, commandes et historique ; réservation transactionnelle du stock à confirmation et restitution à annulation autorisée. Encaissements manuels documentés, distincts d’un paiement bancaire vérifié.
- Liens de commande privés : récapitulatif, coordonnées, consentement et confirmation explicite du client ; confirmation idempotente. Les propositions IA utilisent uniquement les variantes, prix, frais et villes configurés par le commerçant.
- Inbox, notes privées, affectation, reprise humaine, suggestions IA et suivi réel des envois. Simulation séparée, exclue des indicateurs et des envois.
- Assistant multimodal configurable FR/AR/darija. Le modèle classe la demande ; le serveur compose les faits commerciaux à partir du catalogue. Une image exige une validation humaine. Aucun faux résultat en l’absence de fournisseur.
- Connexions officielles Instagram OAuth et WhatsApp Embedded Signup, webhooks signés, déduplication, jetons chiffrés, file d’envoi et reprises. Leur activation dépend des comptes, secrets, permissions et validations Meta.
- Tableau de bord réel, activité sur 30 jours, notifications, essai, quotas, demandes de formule et activation manuelle administrateur. Aucun prélèvement automatique.
- Paramètres, export JSON, anonymisation client, rétention des conversations closes et suppression de boutique ; manifeste installable, interface mobile et page d’impression des commandes.

Les adaptateurs IA/Meta/email sont implémentés mais leur fonctionnement réel exige les fournisseurs configurés et une recette externe. Il n’y a ni paiement en ligne, ni facture fiscale certifiée, ni recherche vectorielle calibrée, ni mode hors ligne pour les données privées. Voir [le bilan](docs/delivery.md).

## Installation

Node.js 24 et npm ; Docker uniquement pour les tests PostgreSQL/Supabase locaux.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Renseigner les variables dans un gestionnaire de secrets ou `.env.local` ignoré par Git. Ne jamais exposer les clés serveur dans `NEXT_PUBLIC_*`.

### Base de données

- **Projet neuf sans tables Sellora** : exécuter `supabase/install.sql` une seule fois dans l’éditeur SQL Supabase.
- **Projet existant avec migrations 001–003** : exécuter **`supabase/upgrade.sql`** une seule fois. Il regroupe 004–009 en transaction sans effacer les données. Ne pas relancer `install.sql`.
- Avec la CLI : appliquer les migrations dans l’ordre. Si elles ont été appliquées manuellement, réconcilier l’historique avant `db push` ; ne pas les appliquer une deuxième fois.

Les clés API Supabase ne permettent pas d’exécuter ce DDL. `node scripts/build-install.mjs` régénère les deux scripts à partir des migrations.

Activer la confirmation email et un SMTP de production dans Supabase Auth. Configurer Site URL et retours autorisés `<APP_URL>/auth/callback` et `<APP_URL>/auth/callback?next=/recuperation`. Le compte doit également être approuvé via `/admin` ; la confirmation email et l’approbation sont distinctes.

### Variables essentielles

| Variable                                                | Origine / fonction                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                              | Project Settings → API, URL du projet (sans `/rest/v1/`)                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                  | Supabase → API Keys, clé publishable                                      |
| `SUPABASE_SERVICE_ROLE_KEY`                             | Supabase → API Keys, secret serveur ; accepte aussi service_role legacy   |
| `NEXT_PUBLIC_APP_URL`                                   | Origine HTTPS définitive Vercel, sans chemin                              |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`                         | Identifiants choisis pour l’administration plateforme                     |
| `ADMIN_SESSION_SECRET`                                  | Secret aléatoire d’au moins 32 caractères                                 |
| `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL`                 | API multimodale OpenAI-compatible ; base OpenAI par défaut                |
| `AI_INPUT_USD_PER_MILLION`, `AI_OUTPUT_USD_PER_MILLION` | Tarifs optionnels, estimations non contractuelles                         |
| `CRON_SECRET`                                           | Secret de planification, au moins 24 caractères                           |
| `RESEND_API_KEY`, `EMAIL_FROM`                          | Emails de confirmation de commandes, optionnels et distincts du SMTP Auth |

Les variables Meta et les étapes officielles sont décrites dans [docs/meta.md](docs/meta.md). Voir [docs/production.md](docs/production.md) pour Vercel.

## Vérification

```bash
npm run lint
npm run typecheck
npm run format:check
npm test
npm run build
npm audit --omit=dev
npx playwright install chromium
npm run test:e2e -- tests/e2e/public.spec.ts
```

Harnais PostgreSQL isolé :

```bash
docker run -d --name sellora-test-db \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=sellora \
  -p 127.0.0.1:55432:5432 postgres:17-alpine
npm run db:test:postgres
```

Ce harnais applique réellement les migrations et teste les droits, transactions, stock, approbations, invitations, quotas, messages, reçus et liens de commande. Son bootstrap émule `auth.uid()` et quelques tables Auth/Storage ; il ne valide pas leurs services HTTP. Ne jamais appliquer ce bootstrap à un vrai Supabase.

Sur un projet Supabase **de test** migré, les scénarios suivants créent puis nettoient leurs propres comptes/boutiques :

```bash
SELLORA_ALLOW_TEST_USERS=true node --env-file=.env.local scripts/integration.mjs
SELLORA_E2E_LIVE=true npm run test:e2e
```

Playwright charge `.env.local`. Sans option live, les scénarios privés sont ignorés. Dans un environnement avec proxy Node, préfixer les commandes réseau par `NODE_USE_ENV_PROXY=1`.

Les tests de langues et Meta mockés vérifient les contrats, pas la qualité linguistique d’un fournisseur ou l’acceptation des permissions par Meta. La recette externe est dans [docs/acceptance.md](docs/acceptance.md).
