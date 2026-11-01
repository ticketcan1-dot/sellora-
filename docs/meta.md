# Connexions officielles Meta

Le code utilise les API officielles ; aucun scraping ni mot de passe social. Une application Meta, les actifs professionnels éligibles, les permissions et la revue éventuellement requise restent nécessaires. La présence des variables n’atteste pas d’une connexion réussie.

## Variables serveur

| Variable                                   | Usage                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `META_ENABLED`                             | `true` pour autoriser les connexions et workers Meta                                              |
| `META_GRAPH_VERSION`                       | Version supportée choisie dans votre app Meta, format `vXX.0` ; aucune version devinée par défaut |
| `META_APP_ID`, `META_APP_SECRET`           | Application Facebook/WhatsApp et vérification des signatures WhatsApp                             |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | Application/produit Instagram Login et signatures Instagram                                       |
| `WHATSAPP_CONFIG_ID`                       | Configuration WhatsApp Embedded Signup                                                            |
| `META_WEBHOOK_VERIFY_TOKEN`                | Jeton de vérification webhook choisi par l’exploitant                                             |
| `CHANNEL_ENCRYPTION_KEY`                   | 32 octets aléatoires encodés base64 pour chiffrer les jetons                                      |
| `NEXT_PUBLIC_APP_URL`                      | Origine HTTPS canonique                                                                           |

Ne pas changer la clé de chiffrement sans rotation des jetons stockés : les anciens jetons deviendraient illisibles et les canaux devraient être reconnectés.

## Instagram

Configurer Instagram API avec Instagram Login pour compte professionnel. Autoriser le callback exact `https://<origine>/api/meta/instagram/callback`, les domaines applicatifs et les permissions `instagram_business_basic` et `instagram_business_manage_messages`. Configurer le webhook `https://<origine>/api/meta/webhooks/instagram` avec votre verify token et les champs de messages requis.

Depuis Canaux, un owner/admin lance l’autorisation. Le serveur vérifie le nonce, échange le code, obtient le jeton longue durée, lit l’identité et souscrit aux événements avant de marquer le canal connecté. Le worker renouvelle les jetons Instagram proches de leur expiration ; surveiller les erreurs et reconnecter si nécessaire.

## WhatsApp

Configurer Facebook Login for Business/WhatsApp Embedded Signup, les domaines autorisés et les permissions de gestion/messagerie nécessaires. Configurer le webhook `https://<origine>/api/meta/webhooks/whatsapp` et la souscription du compte WhatsApp Business.

Depuis Canaux, préparer puis lancer la fenêtre Meta. Le numéro doit être éligible, sa possession vérifiée dans le parcours Meta et le WABA accessible. L’application vérifie côté serveur le jeton, les permissions et l’appartenance du numéro, enregistre le numéro via l’API officielle avec le PIN de vérification en deux étapes (6 chiffres), puis souscrit l’app. Ce PIN n’est ni un code SMS, ni un mot de passe Meta et n’est pas conservé par Sellora.

Les réponses libres sont limitées à la fenêtre de service de 24 h après le dernier message client. L’interface n’envoie pas de campagnes ni de templates hors fenêtre : utiliser les outils officiels appropriés avec les modèles approuvés et consentements requis. Les opt-ins marketing ne sont jamais déduits d’une simple réception de message.

## Recette obligatoire

1. Garder le mode suggestion et utiliser des destinataires de test autorisés.
2. Recevoir texte/image, vérifier signature, boutique, déduplication et affichage des heures d’origine.
3. Approuver une réponse, vérifier l’identifiant retourné par Meta et les reçus livré/lu. Une erreur ou un timeout ne doit pas devenir « envoyé ».
4. Tester révocation, jeton expiré, fenêtre fermée, quotas, pause et reprise humaine ; vérifier absence d’envoi.
5. Configurer le scheduler fréquent et vérifier les reprises 429, les événements en attente et les statuts indéterminés avant d’activer explicitement le mode automatique.

Le simulateur interne ne connecte aucun compte Meta et n’effectue aucun envoi. Les tests unitaires des API utilisent des réponses mockées ; la recette réelle dépend de votre application Meta et n’est pas réputée effectuée.

Références officielles à revérifier avec la version choisie : [Instagram API (Meta)](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api), [WhatsApp Cloud API (Meta)](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api), [enregistrement du numéro](https://www.postman.com/meta/whatsapp-business-platform/request/zb2u18b/register-phone).
