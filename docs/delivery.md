# Bilan de livraison — extension applicative

## Modules livrés

L’extension conserve l’authentification, l’approbation administrateur, les boutiques, le catalogue et le CSV. Elle ajoute clients et consentements, commandes transactionnelles, confirmation client par lien privé, propositions d’achat IA encadrées, encaissements manuels, récapitulatifs imprimables, inbox, notes, affectation, suggestions, reprise humaine, équipe/invitations, transfert de propriété, notifications, export/anonymisation/rétention/suppression, droits et quotas de formules, administration des abonnements et suivi opérationnel.

Les connexions Instagram/WhatsApp utilisent OAuth/Embedded Signup, webhooks signés, stockage chiffré des jetons et workers avec déduplication, reçus et traitement des erreurs. Elles restent **non connectées** tant que l’application Meta et ses permissions ne sont pas configurées. Le fournisseur IA et l’email de commandes sont également externes et facultatifs. Aucun résultat IA, message envoyé ou paiement accepté n’est inventé.

## Vérifications de cette extension

| Vérification                            | Résultat                                             |
| --------------------------------------- | ---------------------------------------------------- |
| TypeScript et compilation de production | Réussis                                              |
| Tests unitaires                         | 71 réussis                                           |
| Harnais PostgreSQL 17                   | 132 contrôles réussis, migrations 001–009 appliquées |
| Parcours navigateur publics             | 10 réussis, desktop et mobile 360 px                 |
| Audit des dépendances de production     | Aucune vulnérabilité signalée                        |

Les contrôles SQL couvrent notamment isolation, approbation, droits, réservations de stock, doubles confirmations, annulations, encaissements partiels et doublons, invitations, transfert de propriété, quotas, événements/reçus, fenêtres de réponse et confirmation de devis humains/IA. Le harnais émule les surfaces minimales Auth/Storage : ce n’est pas une pile Supabase HTTP complète.

Les tests IA/Meta utilisent des adaptateurs mockés et ne valident pas un fournisseur réel. Aucun message n’a été envoyé à un client réel. Les scénarios E2E privés supplémentaires sont fournis dans `tests/e2e/commerce.spec.ts` : devis, confirmation client, stock, paiement manuel, simulation, invitation, export et demande de formule, avec nettoyage des fixtures.

## Activation distante en attente

La base Supabase existante contient les migrations 001–003, déjà validées lors de la livraison précédente (Auth/Storage HTTP, catalogue, approbation et 14 scénarios navigateur). Au dernier contrôle de cette extension, les tables des migrations suivantes étaient encore absentes. **La recette HTTP complète des nouveaux modules attend donc l’exécution de `supabase/upgrade.sql`**, puis les tests d’intégration/live décrits dans le README. Ce script a été testé localement et ne doit être exécuté qu’une fois sur la base existante.

Ne pas déployer cette extension sur le domaine de production avant la migration : les nouvelles pages utilisent ces tables et fonctions. Les clés API disponibles ne peuvent pas exécuter du DDL. Ne pas réexécuter `install.sql` sur la base existante.

## Limites explicites

- Activation IA et validation linguistique/vision réelles : clé et modèle requis ; recherche vectorielle non activée.
- Activation Meta : application, actifs professionnels, permissions/revue et recette réelle requises. Pas d’envoi de templates/campagnes hors fenêtre dans Sellora.
- Production messagerie : scheduler fréquent nécessaire ; le cron quotidien livré convient au pilote et ne garantit pas un traitement rapide.
- Paiement : encaissements et activation des abonnements manuels ; aucun PSP, prélèvement ou facture fiscale certifiée.
- Exploitation et lancement public : SMTP, sauvegardes/restauration, alertes, budgets, identité juridique, textes définitifs, durées légales et démarches applicables à finaliser par l’exploitant.

Ces dépendances externes ne peuvent pas être déclarées terminées par les tests du code. Voir `production.md`, `meta.md` et `acceptance.md`.
