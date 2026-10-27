"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const links = [
  { href: "/dashboard", label: "Painel" },
  { href: "/dividas", label: "Dívidas" },
  { href: "/financeiro", label: "Financeiro" },
  { href: "/carteira", label: "Carteira" },
  { href: "/planejamento", label: "Planejamento" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/controle-contas", label: "Controle de contas" },
  { href: "/habitos", label: "Controle & Hábitos" },
  { href: "/perfil", label: "Perfil" },
];

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    if (signingOut) return;
    setSigningOut(true);
    setLogoutError("");

    try {
      const { error } = await getSupabaseBrowserClient().auth.signOut();
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError("Não foi possível sair. Tente novamente.");
      setSigningOut(false);
    }
  }

  return (
    <header className="app-header">
      <div className="app-header-top">
        <Link className="app-header-brand" href="/dashboard" aria-label="Resgata+ - Painel">
          <span className="app-header-mark">R+</span>
          <span>Resgata<span className="app-header-brand-light">+</span></span>
        </Link>

        <div className="app-header-mobile-actions">
          <button
            type="button"
            className="app-header-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="app-header-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="app-header-menu-icon" aria-hidden="true">
              {menuOpen ? "✕" : "☰"}
            </span>
            {menuOpen ? "Fechar" : "Menu"}
          </button>

          <button
            type="button"
            className="app-header-mobile-logout"
            onClick={logout}
            disabled={signingOut}
          >
            {signingOut ? "Saindo..." : "↗ Sair"}
          </button>
        </div>
      </div>

      <nav
        id="app-header-navigation"
        className={`app-header-nav${menuOpen ? " is-open" : ""}`}
        aria-label="Navegação principal"
      >
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`app-header-link${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </Link>
          );
        })}
        <button
          type="button"
          className="app-header-logout"
          onClick={logout}
          disabled={signingOut}
        >
          {signingOut ? "Saindo..." : "Sair ↗"}
        </button>
      </nav>
      {logoutError && <p className="app-header-error" role="alert">{logoutError}</p>}
    </header>
  );
}
