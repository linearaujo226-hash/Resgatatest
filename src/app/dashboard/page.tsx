"use client";

import AppHeader from "@/components/AppHeader";
import "./dashboard.css";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Debt } from "@/types";

type HabitEntry = {
  id: string;
  status: string;
  amount_spent: number | string | null;
  entry_date: string;
};

type WalletAccount = {
  balance: number | string | null;
};

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(value) ? value : 0);

function sumAmounts(items: Debt[]) {
  return items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeStatus(status: unknown) {
  return typeof status === "string"
    ? status.trim().toLocaleLowerCase("pt-BR")
    : "";
}

function readableError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;

  return "Não foi possível carregar seus dados financeiros. Tente novamente.";
}

export default function DashboardPage() {
  const router = useRouter();

  const [debts, setDebts] = useState<Debt[]>([]);
  const [habitEntries, setHabitEntries] = useState<HabitEntry[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setError("");

      try {
        const supabase = getSupabaseBrowserClient();

        const {
          data: authData,
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        const user = authData.user;

        if (!user) {
          router.replace("/login");
          return;
        }

        const metadataName = user.user_metadata?.name;

        const displayName =
          typeof metadataName === "string" && metadataName.trim()
            ? metadataName.trim()
            : user.email?.split("@")[0] || "Olá";

        // As consultas são limitadas ao usuário autenticado.
        // Configure também as políticas RLS no Supabase.
        const [debtResult, habitResult, walletResult] =
          await Promise.all([
            supabase
              .from("debts")
              .select("*")
              .eq("user_id", user.id)
              .order("due_date", {
                ascending: true,
                nullsFirst: false,
              }),

            supabase
              .from("habit_control_entries")
              .select("id,status,amount_spent,entry_date")
              .eq("user_id", user.id)
              .order("entry_date", {
                ascending: false,
              }),

            supabase
              .from("wallet_accounts")
              .select("balance")
              .eq("user_id", user.id),
          ]);

        if (debtResult.error) throw debtResult.error;
        if (habitResult.error) throw habitResult.error;
        if (walletResult.error) throw walletResult.error;

        const balance = (
          (walletResult.data || []) as WalletAccount[]
        ).reduce(
          (sum, wallet) => sum + Number(wallet.balance || 0),
          0
        );

        if (!active) return;

        setName(displayName);
        setDebts((debtResult.data || []) as Debt[]);
        setHabitEntries((habitResult.data || []) as HabitEntry[]);
        setTotalBalance(balance);
      } catch (err) {
        if (active) {
          setError(readableError(err));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [router]);

  const today = getLocalDateString();

  const paid = debts.filter(
    (debt) => normalizeStatus(debt.status) === "pago"
  );

  const pending = debts.filter(
    (debt) => normalizeStatus(debt.status) !== "pago"
  );

  const overdue = pending.filter(
    (debt) => Boolean(debt.due_date) && debt.due_date < today
  );

  const upcoming = pending.filter(
    (debt) => !debt.due_date || debt.due_date >= today
  );

  const totalPending = sumAmounts(pending);
  const totalOverdue = sumAmounts(overdue);
  const totalUpcoming = sumAmounts(upcoming);
  const totalPaid = sumAmounts(paid);

  const balanceAfterDebts = totalBalance - totalPending;

  // amount_spent representa gastos registrados,
  // não dinheiro economizado.
  const totalSpentRecorded = habitEntries.reduce(
    (sum, item) =>
      sum +
      (normalizeStatus(item.status) === "occurred"
        ? Number(item.amount_spent || 0)
        : 0),
    0
  );

  const hasDebts = debts.length > 0;
  const hasHabitEntries = habitEntries.length > 0;

  return (
    <main className="dashboard-page">
      <AppHeader />

      {/* CABEÇALHO DO PAINEL */}
      <section
        className="dash-welcome"
        aria-labelledby="dashboard-title"
      >
        <div className="dash-welcome-copy">
          <span className="dash-eyebrow">
            <span
              className="dash-status-dot"
              aria-hidden="true"
            />
            SEU PAINEL FINANCEIRO
          </span>

          <h1 id="dashboard-title">
            Olá, {name || "bem-vindo"}!
          </h1>

          <p>
            Acompanhe suas contas, organize suas prioridades
            e consulte sua evolução financeira em um só lugar.
          </p>
        </div>

        <aside
          className="dash-balance-card"
          aria-label="Saldo disponível nas carteiras"
        >
          <span className="dash-balance-label">
            SALDO NAS CARTEIRAS
          </span>

          <strong>
            {loading ? "Carregando…" : money(totalBalance)}
          </strong>

          <span className="dash-balance-note">
            Soma dos saldos cadastrados
          </span>

          <Link
            href="/financeiro"
            className="dash-balance-link"
          >
            Ver meu financeiro{" "}
            <span aria-hidden="true">→</span>
          </Link>
        </aside>

        <nav
          className="dash-shortcuts"
          aria-label="Acessos rápidos"
        >
          <Link
            className="dash-shortcut dash-shortcut-finance"
            href="/financeiro"
          >
            Meu financeiro
          </Link>

          <Link
            className="dash-shortcut dash-shortcut-habits"
            href="/apostas"
          >
            Hábitos &amp; Controle
          </Link>

          <Link
            className="dash-shortcut dash-shortcut-debts"
            href="/dividas"
          >
            Minhas contas
          </Link>
        </nav>
      </section>

      {/* ERRO DE CARREGAMENTO */}
      {error && (
        <div className="dash-error" role="alert">
          <strong>
            Não foi possível carregar o painel.
          </strong>

          <span>{error}</span>

          <button
            type="button"
            className="dash-retry-button"
            onClick={() => window.location.reload()}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* RESUMO DE CONTAS E DÍVIDAS */}
      <section
        className="dash-section"
        aria-labelledby="debts-heading"
      >
        <div className="dash-section-heading">
          <div>
            <span className="dash-section-kicker">
              RESUMO FINANCEIRO
            </span>

            <h2 id="debts-heading">
              Suas contas e dívidas
            </h2>

            <p>
              Resumo calculado com base nos registros da sua conta.
            </p>
          </div>

          <Link
            className="dash-text-link"
            href="/dividas"
          >
            Gerenciar contas{" "}
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        {loading ? (
          <div
            className="dash-loading"
            role="status"
            aria-live="polite"
          >
            <span
              className="dash-spinner"
              aria-hidden="true"
            />

            <span>
              Carregando seus dados financeiros…
            </span>
          </div>
        ) : (
          <>
            <div className="dash-stat-grid">
              {/* SALDO APÓS AS DÍVIDAS */}
              <article className="dash-stat-card dash-stat-main">
                <div className="dash-stat-top">
                  <span
                    className="dash-stat-icon"
                    aria-hidden="true"
                  >
                    ◈
                  </span>

                  <span className="dash-stat-label">
                    Saldo após dívidas
                  </span>
                </div>

                <strong className="dash-stat-value">
                  {money(balanceAfterDebts)}
                </strong>

                <span className="dash-stat-description">
                  Saldo das carteiras menos contas ainda não pagas
                </span>
              </article>

              {/* DÍVIDAS EM ABERTO */}
              <article className="dash-stat-card dash-stat-main">
                <div className="dash-stat-top">
                  <span
                    className="dash-stat-icon"
                    aria-hidden="true"
                  >
                    ▤
                  </span>

                  <span className="dash-stat-label">
                    Dívidas em aberto
                  </span>
                </div>

                <strong className="dash-stat-value">
                  {money(totalPending)}
                </strong>

                <span className="dash-stat-description">
                  {pending.length}{" "}
                  {pending.length === 1
                    ? "conta pendente"
                    : "contas pendentes"}
                </span>
              </article>

              {/* CONTAS VENCIDAS */}
              <article className="dash-stat-card dash-stat-overdue">
                <div className="dash-stat-top">
                  <span
                    className="dash-stat-icon"
                    aria-hidden="true"
                  >
                    !
                  </span>

                  <span className="dash-stat-label">
                    Valor vencido
                  </span>
                </div>

                <strong className="dash-stat-value">
                  {money(totalOverdue)}
                </strong>

                <span className="dash-stat-description">
                  {overdue.length}{" "}
                  {overdue.length === 1
                    ? "conta vencida"
                    : "contas vencidas"}
                </span>
              </article>

              {/* CONTAS A VENCER */}
              <article className="dash-stat-card dash-stat-upcoming">
                <div className="dash-stat-top">
                  <span
                    className="dash-stat-icon"
                    aria-hidden="true"
                  >
                    ◷
                  </span>

                  <span className="dash-stat-label">
                    A vencer / sem data
                  </span>
                </div>

                <strong className="dash-stat-value">
                  {money(totalUpcoming)}
                </strong>

                <span className="dash-stat-description">
                  Contas pendentes com vencimento hoje,
                  futuro ou não informado
                </span>
              </article>

              {/* CONTAS PAGAS */}
              <article className="dash-stat-card dash-stat-paid">
                <div className="dash-stat-top">
                  <span
                    className="dash-stat-icon"
                    aria-hidden="true"
                  >
                    ✓
                  </span>

                  <span className="dash-stat-label">
                    Marcado como pago
                  </span>
                </div>

                <strong className="dash-stat-value">
                  {money(totalPaid)}
                </strong>

                <span className="dash-stat-description">
                  {paid.length}{" "}
                  {paid.length === 1
                    ? "registro pago"
                    : "registros pagos"}
                </span>
              </article>
            </div>

            {!hasDebts && (
              <div className="dash-empty">
                <span
                  className="dash-empty-icon"
                  aria-hidden="true"
                >
                  ＋
                </span>

                <div>
                  <h3>
                    Comece registrando suas contas
                  </h3>

                  <p>
                    Adicione suas contas e dívidas para
                    visualizar valores, vencimentos e
                    prioridades neste painel.
                  </p>
                </div>

                <Link
                  className="dash-text-link"
                  href="/dividas"
                >
                  Adicionar primeira conta{" "}
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            )}
          </>
        )}
      </section>

      {/* HÁBITOS E CONTROLE */}
      <section
        className="dash-savings-section"
        aria-labelledby="savings-heading"
      >
        <div className="dash-savings-copy">
          <span
            className="dash-savings-icon"
            aria-hidden="true"
          >
            ◎
          </span>

          <div>
            <span className="dash-section-kicker">
              SEUS HÁBITOS FINANCEIROS
            </span>

            <h2 id="savings-heading">
              Hábitos &amp; Controle
            </h2>

            <p>
              Acompanhe os registros que você escolheu
              monitorar e consulte seus gastos registrados.
              Este resumo não representa economia automática
              nem movimentações bancárias verificadas.
            </p>
          </div>
        </div>

        <div className="dash-savings-stats">
          <div className="dash-savings-stat">
            <span>Total de gastos registrados</span>

            <strong>
              {loading ? "—" : money(totalSpentRecorded)}
            </strong>
          </div>

          <div className="dash-savings-stat">
            <span>Quantidade de registros</span>

            <strong>
              {loading ? "—" : habitEntries.length}
            </strong>
          </div>
        </div>

        {!loading && !hasHabitEntries && (
          <p className="dash-savings-empty">
            Você ainda não tem registros. Cadastre apenas
            os hábitos que deseja acompanhar e comece
            quando estiver pronto.
          </p>
        )}

        <div className="dash-savings-footer">
          <p>
            Os valores são baseados nos registros informados
            por você e podem não representar todas as suas
            movimentações financeiras.
          </p>

          <Link
            className="dash-savings-button"
            href="/apostas"
          >
            {hasHabitEntries
              ? "Ver histórico"
              : "Começar a acompanhar"}{" "}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {/* RODAPÉ */}
      <footer className="dash-footer">
        <span>Resgata+</span>

        <span>
          Organização financeira com clareza e responsabilidade.
        </span>
      </footer>
    </main>
  );
              }
