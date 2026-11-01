# Approbation des comptes et administration

## Activation sur une installation existante

1. Exécuter **uniquement** `supabase/migrations/202611010003_account_approval.sql` dans l’éditeur SQL ou par la CLI liée au projet. Ne pas relancer `install.sql` sur les tables existantes. Les comptes existants sont aussi placés en attente et doivent être approuvés.
2. Ajouter dans les variables serveur Vercel, environnement Production : `ADMIN_EMAIL` (email choisi), `ADMIN_PASSWORD` (mot de passe choisi), `ADMIN_SESSION_SECRET` (secret aléatoire d’au moins 32 caractères).
3. Pour générer le secret : `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Copier le résultat uniquement dans les paramètres sécurisés de l’hébergeur. Ce secret ne se termine pas par une URL et n’est pas une clé publique.
4. Déployer le code, ouvrir `https://VOTRE-DOMAINE/admin` et se connecter. Les identifiants administrateur sont indépendants des comptes commerçants Supabase ; il n’est pas nécessaire de créer le compte administrateur via le formulaire public.

Aucun identifiant administrateur n’est codé en dur ou publié dans Git. Sans les trois variables, l’administration reste fermée. Choisir un mot de passe robuste avant l’ouverture publique ; changer le mot de passe ou le secret invalide les sessions administrateur existantes.

## Parcours

L’inscription Supabase crée un profil `pending`. L’utilisateur voit `/attente`. La confirmation de l’adresse email reste exigée selon le paramétrage Auth : elle ne remplace pas l’approbation de l’administrateur. Une fois connecté, le compte en attente reste sur cette page et ne peut pas accéder aux boutiques.

L’administrateur ouvre `/admin`, consulte les demandes, recherche une adresse, puis approuve ou refuse le compte. Un compte approuvé peut aussi perdre son accès. Le rôle `admin` d’une boutique n’accorde pas l’accès à cette administration globale.

Une session utilisateur valide sur `/attente` vérifie la décision toutes les cinq secondes et ouvre `/app` automatiquement après approbation. Sans session valide (email non confirmé, navigateur fermé, session expirée), l’utilisateur doit confirmer son email/se reconnecter ; aucune connexion n’est forgée à distance et aucun mot de passe n’est stocké pour reconnecter l’utilisateur.

## Contrôles

- Contrôle de l’état du profil dans le garde serveur partagé et les règles RLS. Un cookie existant ou un appel direct à Supabase ne permet pas de contourner un refus.
- Les droits SQL sur `profiles` autorisent seulement la modification de `display_name` par le propriétaire ; aucune auto-approbation via API ou métadonnées Auth.
- Création de boutique, fonctions métier et Storage vérifient aussi l’approbation. Un retrait bloque les prochaines requêtes ; les fichiers déjà téléchargés et les URLs signées déjà émises restent utilisables jusqu’à leur expiration (15 minutes maximum pour l’interface catalogue).
- Les mutations globales passent par un garde administrateur puis des RPC réservées à `service_role`. Chaque décision est journalisée sans mot de passe ni contenu client.
- Session administrateur signée HMAC, cookie HttpOnly/Secure en production, SameSite strict, valable huit heures, limité au chemin `/admin`. La protection CSRF des Server Actions s’applique.
- Limitation persistante des connexions administrateur : 10 tentatives par adresse IP et 100 globalement sur 15 minutes. Empreinte IP HMAC, événements purgés après un jour. Vercel fournit l’adresse de confiance ; un autre reverse proxy doit écraser les en-têtes d’adresse fournis par les clients.
- L’API `/api/account-status` ne retourne que l’état du compte authentifié courant, sans paramètre d’identifiant, avec cache désactivé.

## Tests

`npm run db:test:postgres` couvre la création en attente, l’auto-approbation interdite, les RPC refusées, l’approbation et son audit, le retrait et les limites de connexion. `npm run test` couvre les jetons falsifiés/expirés et le changement de credentials.

`SELLORA_E2E_LIVE=true NODE_USE_ENV_PROXY=1 npm run test:e2e` active le parcours à deux navigateurs (demandeur et administrateur) lorsque les secrets et le projet de test sont configurés. Les comptes de test sont isolés et supprimés ; le journal d’approbation conserve l’historique sans adresse email du demandeur après suppression.
