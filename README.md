# Sellora AI

Socle SaaS pour commerçants marocains : boutiques isolées, catalogue Supabase, dashboard réel et assistant de simulation FR / AR / darija. Next.js App Router, TypeScript strict, Tailwind, composants selon les conventions shadcn/ui, Zod et Supabase.

## État de la livraison

**Implémenté** : inscription/connexion/confirmation email/récupération, multi-boutiques, quatre rôles en base et contrôlés côté serveur, onboarding sauvegardé, CRUD produits et variantes, photos privées réencodées, recherche/filtres, CSV avec mapping/aperçu/rapport, statistiques SQL, personnalisation IA, historique de simulation, adaptateur multimodal et réponses ancrées dans le catalogue, essai sept jours et quota journalier atomique.

**Validation Supabase effectuée** : connexion, création de boutiques, produits, photos privées, isolation entre boutiques et parcours navigateur desktop/mobile.

**Sous configuration et validation externe** : envoi des emails de confirmation/récupération et appels au modèle multimodal. Sans configuration, l’authentification indique le blocage et l’assistant affiche « modèle non configuré ». Aucun résultat IA fictif ne remplace un fournisseur absent.

**Préparé, non actif** : contrats Meta, primitives HMAC/chiffrement, schéma des commandes/inbox/abonnements, interface paiement, adaptateur embeddings et SQL vectoriel optionnel. Aucun compte Meta connecté, aucun paiement en ligne, aucune transaction ni commande de démonstration dans les comptes ordinaires.

**Pas encore livré** : UI équipe/invitations, workflow complet de commandes et clients, export/suppression autonomes, recherche vectorielle calibrée, workers Meta, PWA et administration de facturation. Ces éléments nécessitent des lots ultérieurs. La première version ne doit pas être annoncée « production-ready ».

## Démarrer

Prérequis : Node.js 24 LTS et npm. Docker est nécessaire uniquement à Supabase local et au harnais PostgreSQL.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Ouvrir `http://localhost:3000`. Les pages publiques fonctionnent sans identifiants. Les espaces privés nécessitent Supabase. Le nom local du dépôt est `/workspace/sellora` (minuscules, exigées par npm).

### Supabase local

```bash
npm run db:start
npm run db:reset
npx supabase status
```

La CLI peut télécharger plusieurs Go d’images et nécessite davantage de disque pour l’extraction. Le démarrage minimal désactive Studio et les services inutilisés. Copier les valeurs locales dans `.env.local` de manière privée ; ne pas partager la sortie contenant les clés. Auth confirme les emails et impose au moins 12 caractères. Les emails locaux sont visibles dans Mailpit (`http://127.0.0.1:54324`) et ne sont pas envoyés à Internet.

### Supabase hébergé

Créer un projet, choisir sa région, puis appliquer les deux migrations SQL de `supabase/migrations/` dans l’ordre avec la CLI liée au projet (`npx supabase link --project-ref ...`, puis `npx supabase db push`). Vérifier le projet ciblé avant de pousser. Si vous utilisez l’éditeur SQL du Dashboard plutôt que la CLI, exécuter `supabase/install.sql` une seule fois sur une base sans tables Sellora ; ce fichier regroupe les migrations dans une transaction. Ne pas le réappliquer par la CLI sur cette même base sans réconcilier l’historique des migrations.

Configurer Auth : confirmation email activée, mot de passe minimum 12 caractères, Site URL correspondant à l’application et URLs de retour autorisées :

- `<APP_URL>/auth/callback`
- `<APP_URL>/auth/callback?next=/recuperation`

Configurer un SMTP de production dans Supabase pour les emails de confirmation/récupération. Les limites de l’émetteur de développement ne conviennent pas à un lancement. La récupération affiche toujours une réponse neutre pour ne pas révéler l’existence d’un compte.

### Variables (sans valeurs)

| Variable | Utilisation |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clé publique publishable, ou anon legacy du projet local |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé serveur secrète `sb_secret_…` ou service_role legacy ; nécessaire aux simulations persistantes |
| `NEXT_PUBLIC_APP_URL` | Origine canonique autorisée pour les retours Auth |
| `AI_BASE_URL` | Racine HTTPS d’une API OpenAI-compatible ; défaut OpenAI `/v1/` |
| `AI_API_KEY`, `AI_MODEL` | Fournisseur avec vision et réponses JSON ; serveur uniquement |
| `AI_INPUT_USD_PER_MILLION`, `AI_OUTPUT_USD_PER_MILLION` | Tarifs optionnels, pour l’estimation de coût ; vérifier ceux du fournisseur |
| `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` | Réservés au futur lot Meta, inutilisés pour la connexion actuellement |
| `CHANNEL_ENCRYPTION_KEY` | Clé base64 de 32 octets, pour les futurs jetons chiffrés |

Ne jamais utiliser une clé privilégiée dans une variable `NEXT_PUBLIC_*`. Ne committer aucun `.env.local`. Les variables publiques doivent être disponibles avant le build. Fournir également toutes les variables serveur au runtime. Redémarrer/reconstruire après changement de configuration.

## Comportement et limites

- **Accès** : owner/admin modifient catalogue et assistant ; agent consulte et simule ; viewer consulte seulement. Les affectations de rôles sont réservées au backend contrôlé. Aucun endpoint navigateur ne permet de se promouvoir ou d’inviter arbitrairement.
- **Catalogue** : produit simple = variante Standard ; prix en centimes MAD ; stock entier. Les modifications produit/variantes sont transactionnelles. Les variantes existantes sont conservées. Photos JPEG/PNG/WebP, 5 Mo / 20 MP maximum, réencodées en WebP 1600 px. Pas de SVG.
- **CSV** : UTF-8, en-tête requis, séparateur détecté par Papa Parse, maximum 1 Mo/500 lignes. Une ligne crée un produit et une variante ; les SKU existants échouent sans écrasement. Import partiel explicite, rapport de lignes invalide/échouées. Modèle vide téléchargeable depuis l’application.
- **Dashboard** : statistiques agrégées en SQL, jamais aléatoires. Les montants confirmés sont distincts des montants réglés. Commandes confirmées = confirmed/processing/shipped/delivered, simulations exclues. Conversion = conversations réelles distinctes ayant au moins une commande confirmée / conversations réelles. Sans conversations : « — ». Les commandes sont encore un schéma de préparation, donc les nouveaux comptes ont zéro commande.
- **IA** : le modèle identifie langue/intention/références ; le serveur compose les réponses depuis les données réelles. Aucun envoi commercial. Les politiques/FAQ sont renvoyées dans leur langue de saisie. La personnalisation textuelle est volontairement encadrée : elle ne peut faire rédiger librement des prix, stocks, remises ou confirmations de paiement.
- **Vision** : jusqu’à 100 produits actifs récents en contexte et 12 photos classées par pertinence textuelle ; aucune recherche exhaustive garantie. Une image implique toujours une confirmation humaine. Pas de seuil de confiance calibré ni d’embeddings actifs ; le contrat et `supabase/optional/visual-index.sql` préparent la suite.
- **Confidentialité IA** : les images clients sont analysées en mémoire, sans stockage Sellora. Le texte des simulations reste enregistré et visible aux membres autorisés. Le modèle reçoit catalogue, historique limité et éventuellement liens temporaires vers des photos privées. Examiner région, rétention et conditions du fournisseur avant usage réel.
- **Essai** : 7 jours dès création de boutique, 50 tentatives/jour UTC par défaut. Les échecs comptent aussi. Les appels durent au maximum 45 s. Une panne peut avoir un coût fournisseur sans tokens récupérés ; l’estimation affichée n’est pas une facture. Aucun abonnement payant activé automatiquement.
- **Meta** : aucune OAuth/webhook/worker actif. Vérifier les documents officiels actuels, l’éligibilité du compte, les permissions, revue Meta, consentements, fenêtres WhatsApp et modèles avant activation. Pas de scraping ni collecte de mot de passe social.

## Validation

```bash
npm run lint
npm run typecheck
npm run format:check
npm run test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit --omit=dev
```

Tests unitaires : montants, CSV, contrats IA, ancrage catalogue, cas FR/AR/darija transmis au fournisseur, échecs, image/MIME, chiffrement/signatures et expiration. Les tests de langue utilisent un adaptateur mocké : ils ne constituent pas une évaluation de qualité d’un modèle réel.

### RLS sur PostgreSQL léger

```bash
docker run -d --name sellora-test-db \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=sellora \
  -p 127.0.0.1:55432:5432 postgres:17-alpine
npm run db:test:postgres
```

Ce script crée une base temporaire, applique les migrations, vérifie les rôles/isolation/contraintes/stock/quotas/métriques, puis supprime la base. `scripts/test-bootstrap.sql` émule seulement `auth.uid()` et les tables Storage utilisées par les policies. **Ce test ne valide pas les services Supabase Auth, PostgREST ou Storage HTTP.** Ne jamais appliquer le bootstrap à Supabase réel.

### Tests sur Supabase complet isolé

```bash
npm run db:test
# Depuis un shell contenant les variables du projet de test :
SELLORA_ALLOW_TEST_USERS=true npm run test:integration
SELLORA_E2E_LIVE=true npm run test:e2e
```

`db:test` cible le conteneur Supabase local et exécute les fixtures SQL dans une transaction annulée. Les tests d’intégration créent deux utilisateurs/boutiques isolés et vérifient Auth, RPC, catalogue, dashboard, isolation et URLs Storage signées. Le test navigateur réel couvre connexion, création boutique, produit, photo, personnalisation et dashboard. Ils nettoient leurs fixtures ; à exécuter **exclusivement sur un projet de test**. Les variables doivent être exportées par le shell/gestionnaire de secrets ; les scripts Node ne chargent pas automatiquement `.env.local`. Node 24 permet aussi `node --env-file=.env.local scripts/integration.mjs` (avec les autres options de test). Playwright charge `.env.local` localement. Dans cet environnement cloud avec proxy, démarrer les commandes réseau avec `NODE_USE_ENV_PROXY=1`.

Sans Supabase configuré, les tests navigateur publics et les protections de routes sont exécutés, et les tests live sont marqués ignorés. Confirmation email, récupération et simulation avec fournisseur/image demandent encore une validation réelle, décrite dans `docs/acceptance.md`.

## Déploiement

Compatible Vercel ou hébergement Next.js Node 24 avec module natif sharp et HTTPS. Configurer variables, migrations et callbacks Auth avant `npm run build`, puis `npm run start`. Ajuster la durée maximale d’exécution du serveur aux appels IA de 45 secondes ; un hébergeur gratuit peut imposer moins. Les migrations initiales ont été appliquées au projet Supabase fourni et les tests réels ont réussi. Aucun déploiement de l’application ni push GitHub n’a été effectué par cette livraison.

Les offres gratuites ont des limites de DB, stockage, trafic, email et exécution ; le fournisseur IA peut être payant dès le premier appel. Mesurer la consommation et fixer des budgets fournisseurs. Aucun tarif de lancement ni promesse d’usage illimité.

Avant commercialisation : terminer les tests Supabase/fournisseur, revue sécurité, gestion opérationnelle des invitations et départs de membres, rétention/export/suppression, sauvegardes et restauration, alertes, SMTP, validation juridique (dont loi 09-08/CNDP), identité/contact éditeur, et revue des transferts de données. Voir `docs/architecture.md` et `docs/delivery.md`.
