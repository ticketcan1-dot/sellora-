import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const root = "supabase/migrations";
const files = readdirSync(root)
  .filter((f) => f.endsWith(".sql"))
  .sort();
function bundle(selected, header) {
  return (
    header +
    "\nbegin;\n" +
    selected
      .map((f) => "\n-- " + f + "\n" + readFileSync(`${root}/${f}`, "utf8"))
      .join("") +
    "\nnotify pgrst, 'reload schema';\ncommit;\n"
  );
}
writeFileSync(
  "supabase/install.sql",
  bundle(
    files,
    "-- Sellora AI : installation initiale seulement, sur une base sans tables Sellora.\n-- Généré depuis les migrations, sans identifiants.",
  ),
);
writeFileSync(
  "supabase/upgrade.sql",
  bundle(
    files.filter((f) => f >= "202611010004"),
    "-- Sellora AI : mise à jour unique depuis les migrations 001 à 003 déjà appliquées.\n-- Ajoute clients/commandes, équipe, facturation, messagerie officielle et confirmation client.\n-- Ne pas utiliser install.sql sur votre base existante. Sauvegarder avant une mise à jour de production.",
  ),
);
