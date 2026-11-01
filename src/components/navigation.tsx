"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Sparkles,
  Store,
  Cable,
  Users,
  ShoppingBag,
  MessagesSquare,
  Settings,
  CreditCard,
  CircleHelp,
  Bell,
} from "lucide-react";
const items = [
  ["/app", "Vue d’ensemble", LayoutDashboard],
  ["/app/catalogue", "Catalogue", Package],
  ["/app/commandes", "Commandes", ShoppingBag],
  ["/app/clients", "Clients", Users],
  ["/app/conversations", "Conversations", MessagesSquare],
  ["/app/assistant", "Assistant IA", Sparkles],
  ["/app/canaux", "Canaux", Cable],
  ["/app/equipe", "Équipe", Users],
  ["/app/facturation", "Facturation", CreditCard],
  ["/app/notifications", "Notifications", Bell],
  ["/app/parametres", "Paramètres", Settings],
  ["/app/boutiques", "Boutiques", Store],
  ["/app/aide", "Aide", CircleHelp],
] as const;
export function Navigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation principale">
      {items.map(([href, label, Icon]) => (
        <Link
          key={href}
          href={href}
          className={`nav-item ${pathname === href ? "active" : ""}`}
          aria-current={pathname === href ? "page" : undefined}
        >
          <Icon size={19} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
