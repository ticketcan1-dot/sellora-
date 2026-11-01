import { Brand } from "@/components/ui";
import { Navigation } from "@/components/navigation";
import { signOut } from "@/domains/auth/actions";
import { session } from "@/domains/tenants/access";
import { ShieldCheck } from "lucide-react";
export const dynamic = "force-dynamic";
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await session();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only">
        Aller au contenu
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="nav-label">VOTRE ESPACE</div>
        <Navigation />
        <div className="sidebar-bottom">
          <ShieldCheck size={20} color="#4058d5" />
          <p style={{ fontSize: 12, margin: "8px 0" }}>
            Un espace pour votre boutique.
            <br />
            Des données sous votre contrôle.
          </p>
          <a href="/confidentialite" style={{ fontSize: 11 }}>
            Confidentialité →
          </a>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="desktop-only muted">
            Espace commerçant{" "}
            <span style={{ margin: "0 10px", color: "#cdd2de" }}>/</span>{" "}
            Sellora AI
          </span>
          <span className="mobile-brand">
            <Brand />
          </span>
          <div className="row">
            <span className="desktop-only muted" style={{ fontSize: 12 }}>
              {user.email}
            </span>
            <span className="avatar">{user.email?.[0]?.toUpperCase()}</span>
            <form action={signOut}>
              <button className="btn secondary small">Quitter</button>
            </form>
          </div>
        </header>
        <main id="main" className="workspace-main">
          {children}
        </main>
      </div>
    </>
  );
}
