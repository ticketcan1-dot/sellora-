# Architecture

Next.js App Router fournit pages serveur, Server Actions et endpoints Meta/cron. Chaque action sensible authentifie le compte et vérifie son approbation, son appartenance et son rôle. Le cookie de boutique sélectionne un contexte ; il ne donne aucun droit. Les lectures filtrent l’organisation et PostgreSQL applique RLS et clés étrangères composites. Les opérations privilégiées sont des RPC à permissions explicites ; les clés serveur restent hors du navigateur.

L’administration plateforme utilise une session signée HttpOnly séparée des rôles de boutique, avec limitation des tentatives, expiration et invalidation à changement d’identifiants. Les approbations sont auditées ; leur retrait bloque aussi les appels directs RLS.

## Commerce

Prix entiers en centimes MAD, quantités entières, variantes persistantes. Les brouillons ne réservent pas le stock. La confirmation explicite verrouille les variantes et réserve une seule fois ; les annulations autorisées restituent une seule fois. Les états expédiés ou les encaissements imposent une revue avant annulation. Les encaissements manuels exigent une référence et ne prétendent pas vérifier un virement. Le document imprimé est un récapitulatif, pas une facture fiscale.

Un lien de commande conserve un devis, expire après 24 h et ne stocke que le hash du jeton. Le client confirme ses coordonnées, son consentement et le total. Le serveur revérifie prix, disponibilité et politique de livraison avant confirmation atomique ; les répétitions retournent la même commande. Les devis d’assistant exigent une activation commerçant et reprennent exclusivement ses frais/villes. Les simulations ne réservent aucun stock et restent exclues des indicateurs.

## IA

L’adaptateur multimodal OpenAI-compatible reçoit un contexte borné : historique récent, catalogue limité, FAQ et éventuellement images. Il classe langue/intention/références/variante/quantité ; le serveur produit les prix, stocks et politiques depuis la base. Les changements du catalogue invalident les propositions avant envoi. Une identification visuelle incertaine ou une image impose une reprise humaine. La recherche vectorielle optionnelle n’est pas active : modèle et dimension doivent être évalués avant activation.

Les images sont décodées et réencodées avec sharp, limitées à 5 Mo/20 MP et 1600 px, sans EXIF. Les images de messages reçus sont privées ; le bac à sable IA direct traite son image en mémoire. Les URL signées expirent rapidement. Le masquage textuel des coordonnées réduit les données envoyées mais ne garantit pas leur anonymisation, notamment dans les images.

## Messagerie

OAuth officiel/Embedded Signup, nonce court lié au compte et à la boutique, vérification serveur des actifs, jetons AES-GCM. Les webhooks sont vérifiés HMAC sur le corps brut, normalisés puis conservés avec déduplication et leases. Les messages entrants valides sont ingérés avant l’acquittement ; IA et médias sont traités par worker.

La file sortante vérifie rôle actuel, compte approuvé, abonnement, fenêtre de 24 h, quotas, canal et suggestion. Seul un identifiant retourné par Meta autorise le statut envoyé. Les reçus sont monotones, y compris reçus arrivés avant la réponse d’envoi. Les timeouts, 5xx et leases d’envoi expirés deviennent indéterminés : aucune relance aveugle pouvant dupliquer un message. Les 429 explicites sont réessayables avec temporisation. La pause, le mode suggestion et la reprise humaine sont contrôlés avant les envois automatiques.

`/api/jobs` exige un bearer secret et traite des lots bornés. Les tâches après réponse accélèrent le traitement, mais la file durable exige une planification fréquente en exploitation. Les emails de commandes utilisent une file Resend optionnelle avec clé d’idempotence ; l’absence de fournisseur ne produit pas de faux email envoyé.

## Équipe, droits et exploitation

Les invitations stockent un hash et exigent le bon email vérifié, une approbation et une consommation unique. Seul le propriétaire transfère la propriété ; un administrateur ne peut pas se promouvoir. Les abonnements sont des droits temporaires d’essai ou activés manuellement, jamais un paiement simulé. Les plafonds produits/membres/IA/messages sont vérifiés côté base, et les compteurs/métriques sont agrégés en SQL.

Export, anonymisation, rétention et suppression nécessitent des droits explicites. Les actions UI nettoient les fichiers concernés et journalisent les opérations. Les pièces financières sont conservées selon la politique légale à définir. Le nettoyage technique réduit les payloads Meta anciens ; une politique de sauvegarde/restauration et les durées légales restent à configurer par l’exploitant. Aucun cache hors ligne de données privées.
