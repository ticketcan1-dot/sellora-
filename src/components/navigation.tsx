"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, Sparkles, Store, Cable } from "lucide-react";
const items = [
  ["/app", "Vue d’ensemble", LayoutDashboard],
  ["/app/catalogue", "Catalogue", Package],
  ["/app/assistant", "Assistant IA", Sparkles],
  ["/app/canaux", "Canaux", Cable],
  ["/app/boutiques", "Boutiques", Store],
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
