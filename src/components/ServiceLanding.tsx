"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import styles from "../app/page.module.css";

const menu = [
  { label: "Início", href: "/", icon: "⌂" },
  { label: "Finanças", href: "/servicos/financeiro", icon: "◫" },
  { label: "Dívidas", href: "/servicos/dividas", icon: "▤" },
  { label: "Hábitos & Controle", href: "/servicos/habitos-controle", icon: "✳" },
];

const content = {
  financeiro: {
    eyebrow: "ORGANIZE SEU DINHEIRO",
    title: "Mais clareza para cuidar das suas finanças.",
    description:
      "Organize suas contas, acompanhe entradas e saídas, planeje o mês e defina metas. Útil tanto para quem está cuidando de dívidas quanto para quem quer prevenir apertos e construir uma vida financeira mais tranquila.",
    icon: "◫",
    accent: "finance",
    features: [
      {
        number: "01",
        title: "Contas e saldos",
        description: "Consulte os saldos registrados nas suas contas e acompanhe sua organização financeira.",
      },
      {
        number: "02",
        title: "Entradas e saídas",
        description: "Organize as movimentações e entenda melhor para onde seu dinheiro está indo.",
      },
      {
        number: "03",
        title: "Pagamentos e histórico",
        description: "Consulte os pagamentos registrados e acompanhe seus compromissos financeiros.",
      },
      {
        number: "04",
        title: "Planejamento mensal",
        description: "Compare suas entradas e saídas e planeje as despesas do mês com base nos valores que registrar.",
      },
      {
        number: "05",
        title: "Metas financeiras",
        description: "Defina objetivos realistas, como quitar uma conta, fazer uma compra planejada ou guardar dinheiro.",
      },
      {
        number: "06",
        title: "Reserva financeira",
        description: "Acompanhe seu objetivo de reserva e avance no seu ritmo, conforme suas possibilidades.",
      },
    ],
    action: "Acessar meu financeiro",
    href: "/login?next=%2Ffinanceiro",
    note: "Você pode usar Finanças mesmo sem ter dívidas. Planejamento, metas e reserva são orientações; os saldos exibidos dependem dos dados registrados.",
  },
  habitos: {
    eyebrow: "HÁBITOS & CONTROLE",
    title: "Pequenos passos para retomar o controle.",
    description:
      "Acompanhe hábitos e comportamentos que deseja mudar, como apostas, consumo de bebidas alcoólicas, compras por impulso e outros padrões que afetam sua rotina ou seu orçamento.",
    icon: "✳",
    accent: "documents",
    features: [
      {
        number: "01",
        title: "Registre seus hábitos",
        description: "Escolha o que deseja acompanhar e registre seus dias de forma simples, privada e sem julgamentos.",
      },
      {
        number: "02",
        title: "Observe gastos e padrões",
        description: "Anote gastos associados aos hábitos e observe tendências ao longo do tempo.",
      },
      {
        number: "03",
        title: "Acompanhe seu progresso",
        description: "Reveja seus registros e reconheça avanços, sem exigir perfeição ou comparar sua jornada com a de outras pessoas.",
      },
    ],
    action: "Acessar Hábitos & Controle",
    href: "/login?next=%2Fapostas",
    note: "Esta ferramenta ajuda no registro e na reflexão pessoal, mas não substitui atendimento profissional. Se um comportamento estiver causando sofrimento ou risco, procure apoio especializado.",
  },
  dividas: {
    eyebrow: "RETOME O CONTROLE",
    title: "Entenda suas dívidas. Organize seus próximos passos.",
    description:
      "Reúna informações sobre credores, valores e vencimentos para acompanhar o que está pendente e os pagamentos que já realizou.",
    icon: "▤",
    accent: "debts",
    features: [
      {
        number: "01",
        title: "Valores pendentes",
        description: "Consulte os valores registrados e acompanhe quanto ainda falta pagar.",
      },
      {
        number: "02",
        title: "Vencimentos",
        description: "Identifique compromissos vencidos e datas próximas para se planejar melhor.",
      },
      {
        number: "03",
        title: "Registro de pagamentos",
        description: "Acesse o controle das suas dívidas e registre pagamentos na funcionalidade existente.",
      },
    ],
    action: "Acessar minhas dívidas",
    href: "/login?next=%2Fdividas",
    note: "A situação e os totais são calculados a partir das informações registradas no sistema.",
  },
  documentos: {
    eyebrow: "PLANO FUTURO · EM DESENVOLVIMENTO",
    title: "Leitura Inteligente",
    description:
      "Estamos planejando um recurso para ajudar a identificar e organizar informações de documentos. Ele ainda não está disponível nesta versão.",
    icon: "▧",
    accent: "documents",
    features: [
      {
        number: "01",
        title: "Importação de documentos",
        description: "Recurso planejado para uma versão futura.",
      },
      {
        number: "02",
        title: "Leitura e organização",
        description: "A extração e a visualização das informações ainda estão em desenvolvimento.",
      },
      {
        number: "03",
        title: "Conferência dos dados",
        description: "Quando estiver disponível, os dados poderão ser revisados antes de serem utilizados.",
      },
    ],
    action: "Recurso ainda indisponível",
    href: "/",
    note: "Por enquanto, cadastre suas dívidas manualmente na área de Dívidas.",
  },
};

type ServiceKey = keyof typeof content;

export default function ServiceLanding({ service }: { service: ServiceKey }) {
  const pathname = usePathname();
  const data = content[service];
  const [menuOpen, setMenuOpen] = useState(true);

  function toggleMenu() {
    setMenuOpen(!menuOpen);
  }

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
          onClick={toggleMenu}
          aria-label={menuOpen ? "Recolher menu" : "Expandir menu"}
          aria-expanded={menuOpen}
        >
          <span>{menuOpen ? "‹" : "›"}</span>
          {menuOpen && <span>Recolher menu</span>}
        </button>

        <div className={styles.sideCaption}>{menuOpen ? "SEU ESPAÇO" : "MENU"}</div>

        <nav className={styles.sideNav} aria-label="Navegação principal">
          {menu.map((item) => {
            const active = item.href === pathname ||
              (item.href === "/" && pathname === "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.sideNavLink} ${active ? styles.sideNavActive : ""}`}
                title={item.label}
                aria-current={active ? "page" : undefined}
              >
                <span className={styles.sideNavIcon} aria-hidden="true">{item.icon}</span>
                {menuOpen && <span className={styles.sideNavLabel}>{item.label}</span>}
                {menuOpen && active && <span className={styles.activeDot} />}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className={styles.homeMain}>
        <header className={styles.homeTopbar}>
          <span className={styles.topbarLabel}>
            RESGATA+ <span>/</span> {data.eyebrow}
          </span>
          <div className={styles.topbarActions}>
            <Link href="/login" className={styles.topbarLogin}>Entrar</Link>
            <Link href="/register" className={styles.topbarCta}>
              Começar agora <span>↗</span>
            </Link>
          </div>
        </header>

        <section className={styles.serviceStage}>
          <div className={styles.serviceHero}>
            <div className={`${styles.serviceIcon} ${styles[data.accent]}`}>
              {data.icon}
            </div>
            <div className={styles.serviceEyebrow}>{data.eyebrow}</div>
            <h1>{data.title}</h1>
            <p className={styles.serviceDescription}>{data.description}</p>
            {service === "documentos" ? (
              <span className={styles.startButton} aria-disabled="true">
                Em desenvolvimento · Plano futuro
              </span>
            ) : (
              <Link href={data.href} className={styles.startButton}>
                {data.action} <span>↗</span>
              </Link>
            )}
          </div>

          <div className={styles.serviceSectionHeading}>
            <div>
              <span>O QUE VOCÊ PODE FAZER</span>
              <h2>Serviços disponíveis</h2>
            </div>
            <p>Mais organização, no seu ritmo.</p>
          </div>

          <div className={styles.serviceGrid}>
            {data.features.map((feature) => (
              <article className={styles.serviceCard} key={feature.number}>
                <span className={styles.serviceNumber}>{feature.number}</span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>

          <div className={styles.serviceNotice}>
            <span aria-hidden="true">ⓘ</span>
            <p>{data.note}</p>
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
