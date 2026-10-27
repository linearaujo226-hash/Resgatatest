"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./page.module.css";

const menu = [
  { label: "Início", href: "/", icon: "⌂" },
  { label: "Finanças", href: "/servicos/financeiro", icon: "◫" },
  { label: "Dívidas", href: "/servicos/dividas", icon: "▤" },
  { label: "Hábitos & Controle", href: "/servicos/habitos-controle", icon: "✳" },
];

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(true);

  return (
    <main className={`${styles.dashboardHome} ${menuOpen ? styles.menuExpanded : styles.menuCollapsed}`}>
      <aside className={styles.sidePanel} aria-label="Menu principal">
        <Link href="/" className={styles.sideBrand} aria-label="Resgata+ início">
          <span className={styles.brandMark}>R+</span>
          {menuOpen && <span className={styles.sideBrandName}>resgata<span>+</span></span>}
        </Link>

        <button
          type="button"
          className={styles.menuToggle}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "Recolher menu" : "Expandir menu"}
          aria-expanded={menuOpen}
          title={menuOpen ? "Recolher menu" : "Expandir menu"}
        >
          <span>{menuOpen ? "‹" : "›"}</span>
          {menuOpen && <span>Recolher menu</span>}
        </button>

        <div className={styles.sideCaption}>
          {menuOpen ? "SEU ESPAÇO" : "MENU"}
        </div>

        <nav className={styles.sideNav} aria-label="Navegação principal">
          {menu.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.sideNavLink} ${index === 0 ? styles.sideNavActive : ""}`}
              title={item.label}
              aria-current={index === 0 ? "page" : undefined}
            >
              <span className={styles.sideNavIcon} aria-hidden="true">{item.icon}</span>
              {menuOpen && <span className={styles.sideNavLabel}>{item.label}</span>}
              {menuOpen && index === 0 && <span className={styles.activeDot} />}
            </Link>
          ))}
        </nav>

      </aside>

      <div className={styles.homeMain}>
        <header className={styles.homeTopbar}>
          <span className={styles.topbarLabel}>RESGATA+ <span>/</span> INÍCIO</span>
          <div className={styles.topbarActions}>
            <Link href="/login" className={styles.topbarLogin}>Entrar</Link>
            <Link href="/register" className={styles.topbarCta}>Começar agora <span>↗</span></Link>
          </div>
        </header>

        <section className={styles.centerStage}>
          <div className={styles.centerGlow} aria-hidden="true" />
          <div className={styles.centerContent}>
            <div className={styles.welcomePill}>
              <span className={styles.welcomeDot} />
              RESGATA+ · SUA JORNADA COMEÇA AQUI
            </div>
            <h1>
              Sua vida pode avançar.
              <br />
              <span>Um passo de cada vez.</span>
            </h1>
            <p className={styles.centerDescription}>
              Cuide das suas finanças, acompanhe suas dívidas e desenvolva
              hábitos melhores. Tenha mais clareza para tomar decisões e
              avançar no seu ritmo.
            </p>
            <div className={styles.centerActions}>
              <Link href="/register" className={styles.startButton}>
                Começar agora <span>↗</span>
              </Link>
              <Link href="/login" className={styles.accessButton}>
                Já tenho uma conta
              </Link>
            </div>
            <div className={styles.centerFootnote}>
              <span>✳</span> Finanças, hábitos e progresso — no seu ritmo.
            </div>
          </div>
          <div className={styles.centerBottomMark} aria-hidden="true">R+</div>
        </section>

        <section className={styles.homeInfoSection} aria-label="Como o Resgata+ pode ajudar">
          <div className={styles.homeInfoHeading}>
            <span>SEU PRÓXIMO PASSO</span>
            <h2>Mais clareza para cuidar do que importa.</h2>
            <p>Escolha por onde começar. Cada pequena mudança conta.</p>
          </div>

          <div className={styles.homeInfoGrid}>
            <article className={`${styles.homeInfoCard} ${styles.financeInfoCard}`}>
              <div className={styles.homeInfoIcon} aria-hidden="true">↗</div>
              <div className={styles.homeInfoCardContent}>
                <span className={styles.homeInfoLabel}>VIDA FINANCEIRA</span>
                <h3>Seu dinheiro, mais organizado.</h3>
                <p>
                  Visualize suas contas, acompanhe seus gastos e planeje seus
                  próximos objetivos — com dívidas ou sem elas.
                </p>
                <div className={styles.homeInfoAction}>
                  Mais clareza no dia a dia <span aria-hidden="true">↗</span>
                </div>
              </div>
            </article>

            <article className={`${styles.homeInfoCard} ${styles.habitsInfoCard}`}>
              <div className={styles.homeInfoIcon} aria-hidden="true">✳</div>
              <div className={styles.homeInfoCardContent}>
                <span className={styles.homeInfoLabel}>HÁBITOS E PROGRESSO</span>
                <h3>Pequenos passos. Novos hábitos.</h3>
                <p>
                  Acompanhe sua rotina, reconheça seus avanços e desenvolva
                  hábitos mais conscientes, um dia de cada vez.
                </p>
                <div className={styles.homeInfoAction}>
                  Seu progresso importa <span aria-hidden="true">↗</span>
                </div>
              </div>
            </article>
          </div>
        </section>

        <footer className={styles.homeFooter}>
          <span>Resgata+ © 2026</span>
          <span>Organize suas dívidas. Recupere seu controle.</span>
        </footer>
      </div>
    </main>
  );
}
