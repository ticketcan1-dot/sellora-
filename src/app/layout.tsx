import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Sellora AI — Votre commerce, simplement",
    template: "%s | Sellora AI",
  },
  description:
    "Catalogue, boutiques et assistant multilingue pour les commerçants marocains.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
