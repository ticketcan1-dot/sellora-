# Validation externe avant pilote

Utiliser exclusivement une instance de test. Aucune conversation de test ne doit être envoyée à de vrais clients.

1. Créer un compte par `/inscription`. Vérifier que l’accès reste refusé avant confirmation. Ouvrir le lien depuis l’email dans le même navigateur ; confirmer l’arrivée sur l’espace boutiques. Demander une récupération, ouvrir son lien, changer le mot de passe et revérifier la connexion. Tester les liens expirés/réutilisés et les retours externes refusés.
2. Créer deux boutiques et des utilisateurs owner/admin/agent/viewer. Vérifier les restrictions d’écriture en UI et via API. Changer de boutique, tenter un ancien ID produit, une ancienne conversation et une URL Storage. Un lien signé reste utilisable jusqu’à sa courte échéance : vérifier que sa création exige l’appartenance et qu’aucun lien n’est public permanent.
3. Ajouter un produit et deux variantes distinctes ; modifier prix et stock, recharger la page. Vérifier qu’un SKU dupliqué annule la transaction. Importer CSV valide, incomplet et dupliqué ; consulter le rapport. Envoyer des images invalides, SVG, trop grandes et une photo avec EXIF ; vérifier réencodage et suppression.
4. Configurer un fournisseur multimodal de test. Utiliser les exemples FR/darija/arabe de l’interface, leurs fautes et mélanges. Vérifier les références/prix/stock contre la base. Modifier le stock pendant une requête et vérifier la relecture avant réponse. Tester demandes de remise, injection, paiement fictif et référence absente d’une autre boutique.
5. Fournir une photo catalogue connue, une capture avec plusieurs produits, puis un objet absent. La vision doit proposer des candidats à confirmer ou demander des précisions, jamais promettre une correspondance certaine. Mesurer les résultats sur des images annotées avant d’activer des embeddings ou un seuil.
6. Interrompre le fournisseur, provoquer un 429 et atteindre la limite quotidienne. Vérifier message d’erreur, quota, consommation et absence d’envoi réel. Mettre l’assistant en pause pendant une requête : aucune réponse ne doit être persistée après la vérification de pause.
7. Vérifier que toutes les simulations restent exclues du dashboard. Sans données réelles, commandes et montants restent à zéro. Confirmer que les cartes Meta restent non configurées.
8. Vérifier clavier, focus, zoom 200 %, 360 px, lecteurs d’écran, messages d’erreur et paragraphes RTL. Effectuer une revue WCAG AA et corriger les défauts avant lancement.

Aucun de ces points externes n’est réputé validé par les tests unitaires ou le harnais PostgreSQL.
