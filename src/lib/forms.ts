import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
export function finish(path: string, message: string): never {
  revalidatePath(path.split("?")[0]);
  redirect(
    path +
      (path.includes("?") ? "&" : "?") +
      "message=" +
      encodeURIComponent(message),
  );
}
export function dbMessage(message: string) {
  const known: [string, string][] = [
    [
      "Insufficient stock",
      "Stock insuffisant. Actualisez les quantités et réessayez.",
    ],
    [
      "Explicit customer",
      "Une preuve de confirmation explicite du client est obligatoire.",
    ],
    [
      "Customer name",
      "Renseignez nom, téléphone, ville, adresse et consentement du client.",
    ],
    [
      "Invalid order transition",
      "Cette transition de commande n’est pas autorisée.",
    ],
    [
      "Recorded payment",
      "Un encaissement est enregistré. Faites vérifier le remboursement avant toute annulation.",
    ],
    ["Forbidden", "Votre rôle ne permet pas cette action."],
    [
      "Shop inactive",
      "Cette boutique est désactivée. Réactivez-la dans les paramètres.",
    ],
    [
      "quota",
      "La limite de votre formule est atteinte. Consultez la facturation.",
    ],
    ["Trial expired", "L’essai a expiré. Consultez la facturation."],
    [
      "duplicate key",
      "Une référence identique existe déjà. Aucun doublon n’a été enregistré.",
    ],
  ];
  return (
    known.find(([key]) =>
      message.toLowerCase().includes(key.toLowerCase()),
    )?.[1] ||
    "L’opération n’a pas été enregistrée. Vérifiez les champs et votre accès."
  );
}
