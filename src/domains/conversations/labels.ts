export const deliveryLabels: Record<string, string> = {
  stored: "Enregistré",
  queued: "En attente",
  sending: "En cours",
  sent: "Accepté par le canal",
  delivered: "Livré",
  read: "Lu",
  failed: "Échec",
  unknown: "Réception à vérifier",
};
export function deliveryError(code: string) {
  const labels: Record<string, string> = {
    window_or_access_closed: "Fenêtre de réponse fermée ou accès retiré",
    entitlements_expired: "Droits d’usage expirés",
    owner_access_revoked: "Accès du propriétaire non autorisé",
    sender_access_revoked: "Accès de l’expéditeur retiré",
    channel_not_configured: "Canal non configuré ou déconnecté",
    channel_token_expired: "Autorisation du canal expirée",
    suggestion_outdated:
      "Prix, stock ou politique modifiés : régénérez la proposition",
    automation_paused: "Assistant suspendu ou reprise humaine active",
    newer_customer_message:
      "Un nouveau message client nécessite une nouvelle analyse",
    provider_rate_limit: "Limite temporaire du fournisseur : reprise différée",
    token_invalid: "Autorisation expirée ou révoquée",
    provider_rejected: "Message refusé par le fournisseur",
    delivery_uncertain: "Réception non confirmée : vérifier le canal",
    provider_delivery_failed: "Échec de livraison signalé par le canal",
    expired_send_lease: "Traitement interrompu : réception à vérifier",
    channel_revoked: "Canal déconnecté",
  };
  return labels[code] || "Traitement à vérifier avec l’administrateur";
}
