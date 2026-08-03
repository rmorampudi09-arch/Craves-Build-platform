import Link from "next/link";
import type { ReactNode } from "react";

const workspaceLinks = [
  { href: "/chef", label: "Overview" },
  { href: "/chef/application", label: "Application" },
  { href: "/chef/kitchen", label: "Kitchen" },
  { href: "/chef/menu", label: "Menu" },
  { href: "/chef/orders", label: "Orders" },
] as const;

export default function ChefLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="chef-panel-theme">
      <header className="chef-panel-header">
        <div className="chef-panel-header-inner">
          <div className="chef-panel-brand-group">
            <Link href="/" className="chef-panel-brand" aria-label="Craves customer home">
              Craves
            </Link>
            <span className="chef-panel-mode-badge">Chef workspace</span>
          </div>

          <nav className="chef-panel-navigation" aria-label="Chef workspace navigation">
            {workspaceLinks.map((link) => (
              <Link key={link.href} href={link.href} className="chef-panel-nav-link">
                {link.label}
              </Link>
            ))}
          </nav>

          <Link href="/" className="chef-panel-customer-link">
            Customer mode
          </Link>
        </div>
      </header>

      <div className="chef-panel-content">{children}</div>

      <footer className="chef-panel-footer">
        <p>Craves chef workspace · Kitchen, menu and order operations</p>
        <Link href="/">Return to customer experience</Link>
      </footer>
    </div>
  );
}
