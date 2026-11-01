# Déploiement Vercel

1. Appliquer les migrations avant de déployer le code qui les utilise. Base existante 001–003 : `supabase/upgrade.sql` une seule fois ; base neuve : `supabase/install.sql`. Sauvegarder la base et vérifier le projet ciblé.
2. Importer le dépôt GitHub dans Vercel, choisir Next.js, Node.js 24, répertoire racine du projet, build `npm run build`. Le module natif sharp doit être disponible.
3. Ajouter les variables de `.env.example` nécessaires dans Vercel → Settings → Environment Variables. Les clés serveur ne portent jamais le préfixe `NEXT_PUBLIC_`. Générer les secrets admin, cron et chiffrement indépendamment. Les clés partagées dans une conversation doivent être renouvelées avant exploitation.
4. Définir `NEXT_PUBLIC_APP_URL` avec l’origine HTTPS définitive et autoriser les callbacks dans Supabase Auth. Configurer le SMTP Auth, activer confirmation email et mot de passe minimum de 12 caractères. Redéployer après tout changement de variable.
5. Tester inscription, email, attente, approbation `/admin`, connexion, récupération et révocation depuis deux sessions. Les comptes existants attendent également une approbation explicite.
6. Valider une commande complète, sa réservation de stock, l’encaissement manuel et les permissions d’un agent/viewer. Les chiffres de ventes et paiements ne doivent inclure aucune simulation.
7. Configurer IA, Meta et emails facultatifs seulement avec des comptes de test au départ. Voir `meta.md` et `acceptance.md`.

## Exécution différée

`vercel.json` programme un passage quotidien à 03:00 UTC, adapté à un pilote à faible volume. Le worker traite un lot volontairement réduit pour respecter la durée d’exécution. **La messagerie en exploitation exige une planification plus fréquente**, par exemple un scheduler externe ou une offre Vercel adaptée, appelant `GET https://<origine>/api/jobs` avec `Authorization: Bearer <CRON_SECRET>`. Ne jamais mettre ce secret dans l’URL. Vérifier les limites de l’offre et surveiller le retard de file via `/admin/etat`.

Les appels IA peuvent durer 45 s ; les routes de travail permettent 60 s. Vérifier les limites réelles de l’hébergeur, la concurrence, le débit et les budgets du fournisseur. Un passage quotidien ne garantit pas une réponse rapide ni la reprise avant fermeture de la fenêtre Meta.

## Exploitation

- `/admin/etat` affiche configuration, files, erreurs et expiration de jetons sans afficher les secrets. Un traitement manuel de lot est disponible.
- `/admin/abonnements` configure les quotas et active les droits pour une durée bornée après vérification externe d’un accord/paiement. Cette action ne prélève pas de fonds et n’émet pas de facture.
- Les tarifs publics sont provisoires. Définir juridiquement offres, monnaie, taxes, renouvellement et remboursements avant commercialisation.
- Prévoir sauvegardes, test de restauration, alertes de file/coûts/quotas, région d’hébergement et procédure d’incident. Éviter la journalisation des corps clients ou des secrets.
- Les paramètres permettent export, rétention et suppression. L’anonymisation est bloquée avec des commandes ouvertes ; les enregistrements financiers suivent une politique légale séparée. Les fichiers sont nettoyés par les actions applicatives ; une suppression directe SQL nécessite sa propre maintenance Storage.
- Compléter identité de l’éditeur, contacts, conditions et confidentialité, vérifier les transferts de données, loi 09-08/CNDP et sous-traitants avec un professionnel. Aucun statut de conformité n’est revendiqué.

Aucun PSP n’a été choisi : les règlements et abonnements restent manuels. Ne pas présenter les reçus manuels comme des vérifications bancaires ou des factures fiscales certifiées.
