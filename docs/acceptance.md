# Recette externe avant lancement

Utiliser un projet de test migré et des destinataires Meta de test autorisés. Les tests unitaires/SQL ne remplacent pas ces validations externes.

1. Inscription → confirmation email → attente d’approbation → approbation `/admin` → arrivée automatique. Récupération réelle, lien expiré, révocation d’approbation et sessions anciennes. Tester le SMTP de production et les callbacks du domaine final.
2. Deux boutiques et rôles owner/admin/agent/viewer. Réutiliser des IDs et URL Storage d’une autre boutique, vérifier les refus. Inviter le bon email vérifié, refuser un autre email, consommer une fois, révoquer puis transférer la propriété. Une URL signée existante reste utilisable jusqu’à son échéance.
3. Catalogue : variantes, SKU dupliqué, import partiel et rapport, image invalide/trop grande/EXIF, suppression d’un produit référencé par commande sans perte de ses photos.
4. Commande : brouillon sans réservation, prix imposés par le serveur, confirmation explicite, deux achats concurrents sur dernier stock, double clic, annulation et restauration unique. Enregistrer paiements partiels puis solde avec preuve ; refuser doublon/surpaiement. Vérifier récapitulatif imprimé et dashboard sans simulation.
5. Lien client : refuser absence de consentement, stock insuffisant, prix modifié, lien expiré et changement des règles de livraison. Répéter la confirmation sans créer de doublon. Vérifier que le suivi n’expose pas les coordonnées du client.
6. Modèle multimodal réel : FR/AR/darija, fautes/mélanges, injection, faux paiement, demande de remise, produit absent, image ambiguë et produit d’une autre boutique. Comparer les réponses à la base ; image et ambiguïté doivent conduire à une validation humaine. Activer les propositions de commande avec frais/villes configurés : aucune commande sans accord explicite du client.
7. Fournisseur en panne, 429, quotas, pause pendant la requête et changement de stock avant approbation. Pas de faux succès ni de dépassement de quota ; un appel échoué peut compter et coûter.
8. Meta : suivre `meta.md`. Vérifier réception texte/image, signature, doublons, envoi approuvé et ID officiel, reçus arrivé tôt/livré/lu, jeton expiré/révoqué, fermeture de fenêtre et envoi indéterminé sans relance aveugle. Le mode automatique exige un accord explicite et s’arrête à la reprise humaine.
9. Planification : surveiller les files sous charge et après incident, vérifier temporisation/reprises et renouvellement des jetons. Tester email de commande avec domaine Resend vérifié ; sans fournisseur, aucune fausse confirmation d’envoi.
10. Essai expiré, plafonds configurés et nouvelle boutique, demande de formule sans prélèvement, activation/retrait manuel, calcul d’usage et estimation de coût. Les cartes ne prouvent pas un paiement bancaire.
11. Export sans secrets, anonymisation avec commande ouverte refusée, rétention des conversations closes/images et suppression de boutique. Sauvegarde et restauration testées ; durées financières adaptées au droit applicable.
12. Clavier, focus, zoom 200 %, mobile 360 px, lecteurs d’écran, RTL et contraste. Revue accessibilité et juridique avant lancement.
