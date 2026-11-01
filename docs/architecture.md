# Architecture Sellora AI

Next.js App Router, composants serveur par défaut ; formulaires interactifs en composants clients. Les actions serveur commencent par `getUser`, puis une vérification d’appartenance et de rôle. Le cookie de boutique n’est qu’un sélecteur, jamais une autorisation. Chaque lecture/écriture sensible filtre l’organisation ; PostgreSQL vérifie à nouveau via RLS. Les clés étrangères composites interdisent les références croisées.

Les variantes portent les prix entiers (centimes de MAD) et stocks. `save_product` crée/modifie produit et variantes dans une transaction. Les variantes existantes ne sont pas supprimées implicitement afin de préserver les futures références de commandes. Les métriques sont agrégées en SQL, sans limite de pagination ni données fictives. Les commandes restent un schéma de préparation, sans parcours de commande livré.

L’IA est un adaptateur serveur OpenAI-compatible multimodal. Le modèle classe l’intention et sélectionne des identifiants ; il ne rédige pas librement les faits commerciaux. Le serveur relit les prix/stocks et compose la réponse à partir des données autorisées. Les politiques sont renvoyées telles que configurées, sans traduction inventée. Cette protection limite volontairement la liberté conversationnelle du MVP.

Images : décodage avec sharp, limite 5 Mo/20 MP, rotation et réencodage WebP sans métadonnées. Images catalogue privées, liens signés de 15 minutes dans l’interface et 2 minutes pour le modèle. Une image client est traitée en mémoire et non stockée ; le fournisseur peut appliquer ses propres règles de conservation. Pour l’image, jusqu’à 12 photos du catalogue sont proposées au modèle, après un classement textuel simple, parmi les 100 derniers produits actifs. Toujours clarifier une ressemblance visuelle ; aucun seuil non calibré n’autorise une correspondance certaine.

`VisualEmbeddingAdapter` réserve le contrat d’un fournisseur d’embeddings. pgvector et l’index de recherche seront activés avec une dimension et un modèle explicitement choisis après évaluation. Il n’y a pas de recherche vectorielle active dans cette version ; le repli multimodal est opérationnel sous réserve de configuration et de validation du fournisseur.

L’essai commence à la création de la boutique et dure sept jours. La réservation d’une tentative verrouille l’abonnement pour empêcher les dépassements concurrents du quota quotidien (UTC). Échecs compris, 50 tentatives par défaut. Les coûts sont des estimations facultatives selon les tarifs fournis ; une requête interrompue peut avoir été facturée par le fournisseur sans tokens disponibles.

Les interfaces Meta incluent l’événement normalisé et la commande d’envoi approuvé. La vérification HMAC et le chiffrement AES-GCM sont des primitives testées, pas une intégration connectée. Aucun endpoint webhook, OAuth ni worker actif. L’unicité des événements et les champs de reprise préparent l’implémentation ultérieure. La fenêtre WhatsApp, l’opt-in et les permissions devront être vérifiés avant tout envoi.

Les autres domaines sont préparés par le schéma et les contrats, sans prétendre livrer inbox réelle, équipe/invitations UI, paiement, export/suppression autonomes ou PWA. Les journaux d’audit ne conservent que l’acteur, l’action et l’identifiant de l’entité. Les credentials et événements techniques ne sont pas lisibles depuis le navigateur.
