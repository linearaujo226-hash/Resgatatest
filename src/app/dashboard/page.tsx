
"use client";
import AppHeader from "@/components/AppHeader";
import "./dashboard.css";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { Debt } from "@/types";

const money = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

function sumAmounts(items: Debt[]) {
  return items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

export default function DashboardPage() {
  const router = useRouter();

  const [debts, setDebts] = useState<Debt[]>([]);
  const [habitEntries, setHabitEntries] = useState<
    { id: string; status: string; amount_spent: number | string | null; entry_date: string }[]
  >([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: auth, error: authError } =
          await supabase.auth.getUser();

        if (authError) throw authError;

        if (!auth.user) {
          router.replace("/login");
          return;
        }

        const metadataName = auth.user.user_metadata?.name;
        const displayName =
          typeof metadataName === "string" && metadataName.trim()
            ? metadataName.trim()
            : auth.user.email?.split("@")[0] || "Olá";

        const [debtResult, habitResult, walletResult] = await Promise.all([
          supabase.from("debts").select("*").order("due_date"),
          supabase
            .from("habit_control_entries")
            .select("id,status,amount_spent,entry_date")
            .eq("user_id", auth.user.id)
            .order("entry_date", { ascending: false }),
          supabase
            .from("wallet_accounts")
            .select("balance")
            .eq("user_id", auth.user.id),
        ]);

        if (debtResult.error) throw debtResult.error;
        if (habitResult.error) throw habitResult.error;
        if (walletResult.error) throw walletResult.error;

        const balance = (walletResult.data || []).reduce(
          (sum: number, wallet: { balance: number | string | null }) =>
            sum + Number(wallet.balance || 0),
          0
        );

        if (active) {
          setName(displayName);
          setDebts((debtResult.data || []) as Debt[]);
          setHabitEntries(
            (habitResult.data || []) as {
              id: string;
              status: string;
              amount_spent: number | string | null;
              entry_date: string;
            }[]
          );
          setTotalBalance(balance);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar seus dados."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [router]);


  const today = new Date().toLocaleDateString("en-CA");

  const pending = debts.filter((debt) => debt.status !== "pago");
  const overdue = pending.filter(
    (debt) => Boolean(debt.due_date) && debt.due_date < today
  );
  const upcoming = pending.filter(
    (debt) => !debt.due_date || debt.due_date >= today
  );
  const paid = debts.filter((debt) => debt.status === "pago");

  const totalPending = sumAmounts(pending);
  const totalOverdue = sumAmounts(overdue);
  const totalUpcoming = sumAmounts(upcoming);
  const totalPaid = sumAmounts(paid);
  const balanceAfterDebts = totalBalance - totalPending;


  const totalSaved = habitEntries.reduce(
    (sum, item) =>
      sum + (item.status === "occurred" ? Number(item.amount_spent || 0) : 0),
    0
  );

  const hasDebts = debts.length > 0;
  const hasSavings = habitEntries.length > 0;

  return (
    <main className="dashboard-page">
      <AppHeader />

      <section className="dash-welcome">
        <div className="dash-welcome-copy">
          <span className="dash-eyebrow">
            <span className="dash-status-dot" />
            SEU PAINEL FINANCEIRO
          </span>
          <h1>
            Olá, {name || "bem-vindo"}!
          </h1>
          <p>
            Acompanhe suas contas, organize suas prioridades e consulte sua
            evolução financeira em um só lugar.
          </p>
        </div>
        <aside className="dash-balance-card" aria-label="Saldo disponível">
          <span className="dash-balance-label">SALDO DISPONÍVEL</span>
          <strong>{money(totalBalance)}</strong>
          <span className="dash-balance-note">Total das suas carteiras</span>
          <Link href="/financeiro" className="dash-balance-link">
            Ver meu financeiro →
          </Link>
        </aside>
    <nav className="dash-shortcuts" aria-label="Acessos rápidos">
    <Link className="dash-shortcut dash-shortcut-finance" href="/financeiro">
      Meu financeiro
    </Link>
    <Link className="dash-shortcut dash-shortcut-habits" href="/apostas">
      Hábitos &amp; Controle
    </Link>
    <Link className="dash-shortcut dash-shortcut-debts" href="/dividas">
      Minhas contas
    </Link>
  </nav>


      </section>



      {error && (
        <div className="dash-error" role="alert">
          <span aria-hidden="true">!</span>
          <span>{error}</span>
        </div>
      )}

      <section className="dash-section" aria-labelledby="debts-heading">
        <div className="dash-section-heading">
          <div>
            <span className="dash-section-kicker">RESUMO FINANCEIRO</span>
            <h2 id="debts-heading">Suas dívidas</h2>
            <p>Valores calculados a partir dos registros da sua conta.</p>
          </div>

          <Link className="dash-text-link" href="/dividas">
            Gerenciar dívidas <span aria-hidden="true">→</span>
          </Link>
        </div>

        {loading ? (
          <div className="dash-loading" role="status">
            <span className="dash-spinner" />
            <span>Carregando seus dados financeiros...</span>
          </div>
        ) : (
          <>
            <div className="dash-stat-grid">
              <article className="dash-stat-card dash-stat-main">
                <div className="dash-stat-top">
                  <span className="dash-stat-icon" aria-hidden="true">📊</span>
                  <span className="dash-stat-label">Saldo após quitar</span>
                </div>
                <strong className="dash-stat-value">
                  {money(balanceAfterDebts)}
                </strong>
                <span className="dash-stat-description">
                  Saldo das contas menos dívidas pendentes
                </span>
              </article>

              <article className="dash-stat-card dash-stat-main">
                <div className="dash-stat-top">
                  <span className="dash-stat-icon" aria-hidden="true">▤</span>
                  <span className="dash-stat-label">Dívidas em aberto</span>
                </div>
                <strong className="dash-stat-value">{money(totalPending)}</strong>
                <span className="dash-stat-description">
                  {pending.length}{" "}
                  {pending.length === 1 ? "conta pendente" : "contas pendentes"}
                </span>
              </article>

              <article className="dash-stat-card dash-stat-overdue">
                <div className="dash-stat-top">
                  <span className="dash-stat-icon" aria-hidden="true">!</span>
                  <span className="dash-stat-label">Valor vencido</span>
                </div>
                <strong className="dash-stat-value">{money(totalOverdue)}</strong>
                <span className="dash-stat-description">
                  {overdue.length}{" "}
                  {overdue.length === 1 ? "conta vencida" : "contas vencidas"}
                </span>
              </article>

              <article className="dash-stat-card dash-stat-upcoming">
                <div className="dash-stat-top">
                  <span className="dash-stat-icon" aria-hidden="true">◷</span>
                  <span className="dash-stat-label">A vencer</span>
                </div>
                <strong className="dash-stat-value">{money(totalUpcoming)}</strong>
                <span className="dash-stat-description">
                  Contas sem vencimento passado
                </span>
              </article>

              <article className="dash-stat-card dash-stat-paid">
                <div className="dash-stat-top">
                  <span className="dash-stat-icon" aria-hidden="true">✓</span>
                  <span className="dash-stat-label">Marcado como pago</span>
                </div>
                <strong className="dash-stat-value">{money(totalPaid)}</strong>
                <span className="dash-stat-description">
                  {paid.length}{" "}
                  {paid.length === 1 ? "registro pago" : "registros pagos"}
                </span>
              </article>
            </div>

            {!hasDebts && (
              <div className="dash-empty">
                <span className="dash-empty-icon" aria-hidden="true">＋</span>
                <div>
                  <h3>Comece registrando suas contas</h3>
                  <p>
                    Adicione suas dívidas para visualizar valores, vencimentos
                    e prioridades neste painel.
                  </p>
                </div>
                <Link className="dash-text-link" href="/dividas">
                  Adicionar primeira dívida →
                </Link>
              </div>
            )}
          </>
        )}
      </section>

      <section className="dash-savings-section" aria-labelledby="savings-heading">
        <div className="dash-savings-copy">
          <span className="dash-savings-icon" aria-hidden="true">🌱</span>
          <div>
            <span className="dash-section-kicker">SEUS HÁBITOS FINANCEIROS</span>
            <h2 id="savings-heading">Hábitos &amp; Controle</h2>
            <p>
              Acompanhe seus hábitos, registre gastos relacionados e defina metas pessoais.
              Você escolhe o que deseja monitorar e consulta seu histórico no seu ritmo.
            </p>
          </div>
        </div>

        <div className="dash-savings-stats">
          <div className="dash-savings-stat">
            <span>Total registrado</span>
            <strong>{loading ? "—" : money(totalSaved)}</strong>
          </div>
          <div className="dash-savings-stat">
            <span>Registros</span>
            <strong>{loading ? "—" : habitEntries.length}</strong>
          </div>
        </div>

        {!loading && !hasSavings && (
          <p className="dash-savings-empty">
            Você ainda não tem registros. Cadastre apenas os hábitos que deseja acompanhar
            e comece quando se sentir à vontade.
          </p>
        )}

        <div className="dash-savings-footer">
          <p>
            Seus registros são pessoais e representam as informações que você escolheu anotar.
            Nenhum hábito precisa ser selecionado se não fizer parte da sua rotina.
          </p>
          <Link className="dash-savings-button" href="/apostas">
            {hasSavings ? "Ver histórico" : "Começar a acompanhar"} →
          </Link>
        </div>
      </section>

      <footer className="dash-footer">
        <span>Resgata+</span>
        <span>Organização financeira com clareza e responsabilidade.</span>
      </footer>
    </main>
  );
}
