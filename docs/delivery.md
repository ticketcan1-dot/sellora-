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

## Validation Supabase distante

L’utilisateur a exécuté `supabase/upgrade.sql` sur la base existante. La disponibilité des tables et des champs des migrations 004–009 a été vérifiée, notamment les droits de formules, liens de commande, reçus et réglages d’achat IA.

L’intégration HTTP réelle a réussi : Auth, attente/approbation/retrait d’accès, refus de l’auto-approbation, création de boutique, catalogue, agrégats, isolation, Storage privé et refus d’accès aux credentials. Les parcours commerciaux desktop et mobile ont aussi confirmé les devis privés, la confirmation client, la réservation unique de stock, l’encaissement manuel, la simulation sans envoi, les notes, l’invitation, l’export et la demande de formule. Les comptes et boutiques temporaires ont été nettoyés.

**Ne pas réexécuter `upgrade.sql` ni `install.sql` sur ce projet déjà migré.** Pour les prochains changements, appliquer uniquement les nouvelles migrations. La configuration des fournisseurs et les callbacks du domaine de production restent propres au déploiement Vercel.

## Limites explicites

- Activation IA et validation linguistique/vision réelles : clé et modèle requis ; recherche vectorielle non activée.
- Activation Meta : application, actifs professionnels, permissions/revue et recette réelle requises. Pas d’envoi de templates/campagnes hors fenêtre dans Sellora.
- Production messagerie : scheduler fréquent nécessaire ; le cron quotidien livré convient au pilote et ne garantit pas un traitement rapide.
- Paiement : encaissements et activation des abonnements manuels ; aucun PSP, prélèvement ou facture fiscale certifiée.
- Exploitation et lancement public : SMTP, sauvegardes/restauration, alertes, budgets, identité juridique, textes définitifs, durées légales et démarches applicables à finaliser par l’exploitant.

Ces dépendances externes ne peuvent pas être déclarées terminées par les tests du code. Voir `production.md`, `meta.md` et `acceptance.md`.
