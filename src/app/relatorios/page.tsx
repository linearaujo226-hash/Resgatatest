"use client";

import AppHeader from "@/components/AppHeader";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";

/* =========================================================
   TIPOS
========================================================= */

type Debt = {
  id: string;
  name: string;
  amount: number | string;
  paid_amount?: number | string | null;
  due_date: string;
  status: string;
};

type Wallet = {
  id: string;
  name: string;
  balance: number | string;
  account_type: string;
};

type Payment = {
  id: string;
  debt_id: string;
  account_id: string | null;
  amount: number | string;
  paid_at: string;
  created_at?: string;
};

type Account = {
  id: string;
  name: string;
  account_type: string;
  amount: number | string;
  due_date: string | null;
  status: string;
  created_at: string;
};

type Notice = {
  type: "success" | "error" | "warning" | "info";
  text: string;
};

/* =========================================================
   FUNÇÕES UTILITÁRIAS
========================================================= */

function num(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (value == null || value.trim() === "") {
    return 0;
  }

  let normalized = value.trim().replace(/\s/g, "");

  // Aceita valores brasileiros, como 1.250,50.
  if (normalized.includes(",")) {
    normalized = normalized
      .replace(/\./g, "")
      .replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/\./g, "");
  }

  const result = Number(normalized);

  return Number.isFinite(result) ? result : 0;
}

function money(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Usa a data local, evitando problemas causados por UTC
 * ao inicializar os filtros do relatório.
 */
function localDate(): string {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function currentMonth(): string {
  return localDate().slice(0, 7);
}

function firstDayOfCurrentMonth(): string {
  return `${currentMonth()}-01`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";

  const date = value.slice(0, 10);
  const parts = date.split("-");

  if (parts.length !== 3) return "—";

  const [year, month, day] = parts;

  if (!year || !month || !day) return "—";

  return `${day}/${month}/${year}`;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isCanceled(status: string): boolean {
  return [
    "cancelado",
    "cancelada",
    "canceled",
    "cancelled",
  ].includes(normalize(status));
}

function isPaid(status: string): boolean {
  return [
    "pago",
    "paga",
    "quitado",
    "quitada",
    "liquidado",
    "liquidada",
    "paid",
  ].includes(normalize(status));
}

function isDebtSettled(status: string): boolean {
  return [
    "pago",
    "paga",
    "quitado",
    "quitada",
    "liquidado",
    "liquidada",
    "quitada integralmente",
    "paid",
    "settled",
  ].includes(normalize(status));
}

function isRevenue(accountType: string): boolean {
  return normalize(accountType) === "receita";
}

/**
 * Limita o valor pago ao valor original da dívida.
 * Quando a dívida está marcada como quitada, mas não tem
 * paid_amount preenchido, considera o valor original como pago.
 */
function getDebtPaidAmount(debt: Debt): number {
  const amount = Math.max(0, num(debt.amount));

  if (isDebtSettled(debt.status)) {
    return amount;
  }

  return Math.min(
    amount,
    Math.max(0, num(debt.paid_amount)),
  );
}

function getDebtRemaining(debt: Debt): number {
  if (isCanceled(debt.status)) {
    return 0;
  }

  const amount = Math.max(0, num(debt.amount));

  return Math.max(0, amount - getDebtPaidAmount(debt));
}

function getAccountPeriodDate(account: Account): string {
  // Para contas, prioriza vencimento e usa criação como alternativa.
  return (
    account.due_date?.slice(0, 10) ||
    account.created_at?.slice(0, 10) ||
    ""
  );
}

function getPaymentPeriodDate(payment: Payment): string {
  return (
    payment.paid_at?.slice(0, 10) ||
    payment.created_at?.slice(0, 10) ||
    ""
  );
}

function dateInRange(
  date: string,
  start: string,
  end: string,
): boolean {
  return Boolean(date) && date >= start && date <= end;
}

function statusLabel(status: string): string {
  const value = normalize(status);

  if (isCanceled(value)) return "Cancelada";
  if (isDebtSettled(value)) return "Quitada";
  if (isPaid(value)) return "Paga";

  if (
    value === "pendente" ||
    value === "aberto" ||
    value === "em_aberto"
  ) {
    return "Em aberto";
  }

  return status || "Não informado";
}

function statusColor(status: string): string {
  const value = normalize(status);

  if (isCanceled(value)) return "#991b1b";
  if (isDebtSettled(value) || isPaid(value)) return "#166534";

  return "#92400e";
}

function statusBackground(status: string): string {
  const value = normalize(status);

  if (isCanceled(value)) return "#fee2e2";
  if (isDebtSettled(value) || isPaid(value)) return "#dcfce7";

  return "#fef3c7";
}

function csvCell(value: string | number): string {
  const text = String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/* =========================================================
   COMPONENTE
========================================================= */

export default function RelatoriosPage() {
  const router = useRouter();

  const [debts, setDebts] = useState<Debt[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [start, setStart] = useState(firstDayOfCurrentMonth);
  const [end, setEnd] = useState(localDate);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  /* =======================================================
     CARREGAR DADOS
  ======================================================= */

  const loadData = useCallback(
    async (initial = false) => {
      if (initial) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      setError("");
      setNotice(null);

      try {
        const supabase = getSupabaseBrowserClient();

        const {
          data: authData,
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;

        if (!authData.user) {
          router.replace("/login");
          return;
        }

        const userId = authData.user.id;

        const [
          debtResult,
          walletResult,
          paymentResult,
          accountResult,
        ] = await Promise.all([
          supabase
            .from("debts")
            .select(
              "id,name,amount,paid_amount,due_date,status",
            )
            .eq("user_id", userId),

          supabase
            .from("wallet_accounts")
            .select("id,name,balance,account_type")
            .eq("user_id", userId),

          supabase
            .from("debt_payments")
            .select(
              "id,debt_id,account_id,amount,paid_at,created_at",
            )
            .eq("user_id", userId),

          supabase
            .from("control_accounts")
            .select(
              "id,name,account_type,amount,due_date,status,created_at",
            )
            .eq("user_id", userId),
        ]);

        if (debtResult.error) throw debtResult.error;
        if (walletResult.error) throw walletResult.error;
        if (paymentResult.error) throw paymentResult.error;
        if (accountResult.error) throw accountResult.error;

        setDebts((debtResult.data ?? []) as Debt[]);
        setWallets((walletResult.data ?? []) as Wallet[]);
        setPayments((paymentResult.data ?? []) as Payment[]);
        setAccounts((accountResult.data ?? []) as Account[]);
      } catch (exception) {
        console.error("Erro ao carregar relatórios:", exception);

        setError(
          exception instanceof Error
            ? exception.message
            : "Não foi possível carregar os relatórios financeiros.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void loadData(true);
  }, [loadData]);

  /* =======================================================
     VALIDAR PERÍODO
  ======================================================= */

  const validPeriod = Boolean(start && end && start <= end);

  /* =======================================================
     CALCULAR INDICADORES
  ======================================================= */

  const totals = useMemo(() => {
    const activeDebts = debts.filter(
      (debt) => !isCanceled(debt.status),
    );

    const walletBalance = wallets.reduce(
      (sum, wallet) => sum + num(wallet.balance),
      0,
    );

    const debtTotal = activeDebts.reduce(
      (sum, debt) => sum + Math.max(0, num(debt.amount)),
      0,
    );

    const debtPaid = activeDebts.reduce(
      (sum, debt) => sum + getDebtPaidAmount(debt),
      0,
    );

    const debtOpen = activeDebts.reduce(
      (sum, debt) => sum + getDebtRemaining(debt),
      0,
    );

    const filteredPayments = validPeriod
      ? payments.filter((payment) =>
          dateInRange(
            getPaymentPeriodDate(payment),
            start,
            end,
          ),
        )
      : [];

    const periodAccounts = validPeriod
      ? accounts.filter((account) => {
          if (isCanceled(account.status)) return false;

          return dateInRange(
            getAccountPeriodDate(account),
            start,
            end,
          );
        })
      : [];

    const periodIncome = periodAccounts
      .filter((account) => isRevenue(account.account_type))
      .reduce(
        (sum, account) =>
          sum + Math.max(0, num(account.amount)),
        0,
      );

    const receivedIncome = periodAccounts
      .filter(
        (account) =>
          isRevenue(account.account_type) &&
          isPaid(account.status),
      )
      .reduce(
        (sum, account) =>
          sum + Math.max(0, num(account.amount)),
        0,
      );

    const pendingIncome = periodAccounts
      .filter(
        (account) =>
          isRevenue(account.account_type) &&
          !isPaid(account.status),
      )
      .reduce(
        (sum, account) =>
          sum + Math.max(0, num(account.amount)),
        0,
      );

    const expensesPaid = periodAccounts
      .filter(
        (account) =>
          !isRevenue(account.account_type) &&
          isPaid(account.status),
      )
      .reduce(
        (sum, account) =>
          sum + Math.max(0, num(account.amount)),
        0,
      );

    const expensesPending = periodAccounts
      .filter(
        (account) =>
          !isRevenue(account.account_type) &&
          !isPaid(account.status),
      )
      .reduce(
        (sum, account) =>
          sum + Math.max(0, num(account.amount)),
        0,
      );

    const paymentTotal = filteredPayments.reduce(
      (sum, payment) =>
        sum + Math.max(0, num(payment.amount)),
      0,
    );

    const overdueDebts = activeDebts.filter((debt) => {
      if (getDebtRemaining(debt) <= 0 || !debt.due_date) {
        return false;
      }

      return debt.due_date.slice(0, 10) < localDate();
    });

    const overdueDebtTotal = overdueDebts.reduce(
      (sum, debt) => sum + getDebtRemaining(debt),
      0,
    );

    const overdueAccounts = periodAccounts.filter((account) => {
      if (
        isRevenue(account.account_type) ||
        isPaid(account.status) ||
        !account.due_date
      ) {
        return false;
      }

      return account.due_date.slice(0, 10) < localDate();
    });

    const overdueAccountTotal = overdueAccounts.reduce(
      (sum, account) =>
        sum + Math.max(0, num(account.amount)),
      0,
    );

    return {
      walletBalance,
      debtTotal,
      debtPaid,
      debtOpen,

      activeDebtCount: activeDebts.length,
      overdueDebtCount: overdueDebts.length,
      overdueDebtTotal,

      filteredPayments,
      paymentTotal,

      periodIncome,
      receivedIncome,
      pendingIncome,

      expensesPaid,
      expensesPending,

      overdueAccountCount: overdueAccounts.length,
      overdueAccountTotal,

      periodAccountCount: periodAccounts.length,
    };
  }, [
    debts,
    wallets,
    payments,
    accounts,
    start,
    end,
    validPeriod,
  ]);

  /* =======================================================
     ORDENAÇÃO DAS DÍVIDAS
  ======================================================= */

  const sortedDebts = useMemo(() => {
    return [...debts].sort((a, b) => {
      const dateA = a.due_date || "9999-12-31";
      const dateB = b.due_date || "9999-12-31";

      return dateA.localeCompare(dateB);
    });
  }, [debts]);

  /* =======================================================
     EXPORTAR RELATÓRIO CSV
  ======================================================= */

  function exportCsv() {
    if (!validPeriod) {
      setNotice({
        type: "error",
        text: "Selecione um período válido antes de exportar.",
      });
      return;
    }

    try {
      const rows: (string | number)[][] = [
        ["Relatório financeiro Resgata+"],
        ["Data inicial", start],
        ["Data final", end],
        [],
        ["RESUMO FINANCEIRO"],
        ["Indicador", "Valor"],
        ["Saldo total da Carteira", totals.walletBalance],
        ["Valor original das dívidas ativas", totals.debtTotal],
        ["Total pago acumulado nas dívidas", totals.debtPaid],
        ["Saldo restante das dívidas", totals.debtOpen],
        ["Pagamentos de dívidas no período", totals.paymentTotal],
        ["Quantidade de pagamentos no período", totals.filteredPayments.length],
        ["Receitas cadastradas no período", totals.periodIncome],
        ["Receitas marcadas como recebidas", totals.receivedIncome],
        ["Receitas pendentes", totals.pendingIncome],
        ["Despesas pagas", totals.expensesPaid],
        ["Despesas pendentes", totals.expensesPending],
        [],
        ["DÍVIDAS"],
        [
          "Nome",
          "Vencimento",
          "Situação",
          "Valor original",
          "Pago acumulado",
          "Saldo restante",
        ],
        ...sortedDebts.map((debt) => [
          debt.name,
          debt.due_date || "",
          statusLabel(debt.status),
          num(debt.amount),
          getDebtPaidAmount(debt),
          getDebtRemaining(debt),
        ]),
        [],
        ["PAGAMENTOS DE DÍVIDAS NO PERÍODO"],
        ["Data", "ID da dívida", "ID da conta", "Valor"],
        ...totals.filteredPayments.map((payment) => [
          getPaymentPeriodDate(payment),
          payment.debt_id,
          payment.account_id ?? "",
          num(payment.amount),
        ]),
      ];

      const csv = "\uFEFF" + rows
        .map((row) => row.map(csvCell).join(";"))
        .join("\r\n");

      const blob = new Blob([csv], {
        type: "text/csv;charset=utf-8;",
      });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = `resgata-relatorio-${start}-a-${end}.csv`;

      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(url);

      setNotice({
        type: "success",
        text: "Relatório CSV exportado.",
      });
    } catch (exception) {
      console.error("Erro ao exportar relatório:", exception);

      setNotice({
        type: "error",
        text: "Não foi possível exportar o relatório.",
      });
    }
  }

  /* =======================================================
     ESTILOS
  ======================================================= */

  const card: CSSProperties = {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 20,
    minWidth: 0,
    boxShadow: "0 2px 8px rgba(15, 23, 42, 0.025)",
  };

  const field: CSSProperties = {
    width: "100%",
    minHeight: 44,
    padding: "10px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: 9,
    background: "#ffffff",
    color: "#172033",
    boxSizing: "border-box",
    fontSize: 14,
  };

  const button: CSSProperties = {
    minHeight: 44,
    padding: "10px 15px",
    borderRadius: 9,
    border: 0,
    background: "#176b52",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: 14,
  };

  const secondaryButton: CSSProperties = {
    ...button,
    background: "#e2e8f0",
    color: "#334155",
  };

  const muted: CSSProperties = {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 1.6,
  };

  const tableCell: CSSProperties = {
    padding: "12px 10px",
    borderBottom: "1px solid #edf0f4",
    textAlign: "left",
    fontSize: 13,
    verticalAlign: "middle",
  };

  /* =======================================================
     INTERFACE
  ======================================================= */

  return (
    <>
      <AppHeader />

      <main
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "28px 18px 50px",
          color: "#172033",
        }}
      >
        {/* CABEÇALHO */}

        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 24,
          }}
        >
          <div style={{ flex: "1 1 300px", minWidth: 0 }}>
            <p
              style={{
                color: "#176b52",
                margin: "0 0 7px",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: 1,
              }}
            >
              RESGATA+ · ANÁLISE FINANCEIRA
            </p>

            <h1
              style={{
                fontSize: "clamp(27px, 4vw, 36px)",
                lineHeight: 1.2,
                margin: 0,
                letterSpacing: "-0.6px",
              }}
            >
              Relatórios financeiros
            </h1>

            <p style={{ ...muted, marginBottom: 0 }}>
              Acompanhe suas dívidas, pagamentos, contas e saldos
              em um só lugar.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => void loadData(false)}
              disabled={refreshing || loading}
              style={{
                ...secondaryButton,
                opacity: refreshing || loading ? 0.6 : 1,
              }}
            >
              {refreshing ? "Atualizando..." : "↻ Atualizar"}
            </button>

            <button
              type="button"
              onClick={exportCsv}
              disabled={loading || Boolean(error)}
              style={{
                ...button,
                opacity: loading || error ? 0.6 : 1,
              }}
            >
              Exportar CSV
            </button>
          </div>
        </header>

        {/* FILTRO DE PERÍODO */}

        <section
          style={{
            ...card,
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            alignItems: "end",
            marginBottom: 20,
          }}
        >
          <label
            style={{
              display: "grid",
              gap: 6,
              fontWeight: 700,
              fontSize: 13,
              flex: "1 1 180px",
            }}
          >
            Data inicial

            <input
              type="date"
              value={start}
              max={end || undefined}
              onChange={(event) => {
                setStart(event.target.value);
                setNotice(null);
              }}
              style={field}
            />
          </label>

          <label
            style={{
              display: "grid",
              gap: 6,
              fontWeight: 700,
              fontSize: 13,
              flex: "1 1 180px",
            }}
          >
            Data final

            <input
              type="date"
              value={end}
              min={start || undefined}
              onChange={(event) => {
                setEnd(event.target.value);
                setNotice(null);
              }}
              style={field}
            />
          </label>

          <button
            type="button"
            onClick={() => {
              setStart(firstDayOfCurrentMonth());
              setEnd(localDate());
              setNotice(null);
            }}
            style={secondaryButton}
          >
            Mês atual
          </button>

          <button
            type="button"
            onClick={() => {
              const date = localDate();

              setStart(date);
              setEnd(date);
              setNotice(null);
            }}
            style={secondaryButton}
          >
            Hoje
          </button>
        </section>

        {!validPeriod && (
          <p
            role="alert"
            style={{
              background: "#fef2f2",
              color: "#991b1b",
              padding: 12,
              borderRadius: 10,
            }}
          >
            A data inicial não pode ser posterior à data final.
          </p>
        )}

        {notice && (
          <div
            role="status"
            aria-live="polite"
            style={{
              padding: 12,
              borderRadius: 10,
              marginBottom: 18,
              background:
                notice.type === "success"
                  ? "#ecfdf5"
                  : notice.type === "error"
                    ? "#fef2f2"
                    : notice.type === "warning"
                      ? "#fffbeb"
                      : "#eff6ff",
              color:
                notice.type === "success"
                  ? "#065f46"
                  : notice.type === "error"
                    ? "#991b1b"
                    : notice.type === "warning"
                      ? "#92400e"
                      : "#1d4ed8",
              fontSize: 14,
            }}
          >
            {notice.text}
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              background: "#fef2f2",
              color: "#991b1b",
              border: "1px solid #fecaca",
              padding: 16,
              borderRadius: 12,
              marginBottom: 20,
            }}
          >
            <strong>Não foi possível carregar os relatórios.</strong>

            <p style={{ marginBottom: 12, overflowWrap: "anywhere" }}>
              {error}
            </p>

            <button
              type="button"
              onClick={() => void loadData(true)}
              style={button}
            >
              Tentar novamente
            </button>
          </div>
        )}

        {loading ? (
          <section
            style={{
              ...card,
              textAlign: "center",
              padding: 38,
            }}
          >
            <strong>Carregando relatórios financeiros...</strong>

            <p style={muted}>
              Consultando os registros da sua conta.
            </p>
          </section>
        ) : (
          !error &&
          validPeriod && (
            <>
              {/* INDICADORES PRINCIPAIS */}

              <section
                aria-label="Resumo financeiro"
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
                  gap: 14,
                  marginBottom: 20,
                }}
              >
                {[
                  {
                    title: "Dívidas originais ativas",
                    value: money(totals.debtTotal),
                    note: `${totals.activeDebtCount} dívida(s) não cancelada(s)`,
                    color: "#172033",
                  },
                  {
                    title: "Pago acumulado nas dívidas",
                    value: money(totals.debtPaid),
                    note: "Conforme o campo pago de cada dívida",
                    color: "#176b52",
                  },
                  {
                    title: "Dívidas em aberto",
                    value: money(totals.debtOpen),
                    note: "Saldo devedor restante",
                    color: "#b45309",
                  },
                  {
                    title: "Saldo total da Carteira",
                    value: money(totals.walletBalance),
                    note: "Soma dos saldos cadastrados",
                    color: "#176b52",
                  },
                ].map((item) => (
                  <article key={item.title} style={card}>
                    <p
                      style={{
                        color: "#64748b",
                        fontSize: 13,
                        margin: "0 0 9px",
                        fontWeight: 600,
                      }}
                    >
                      {item.title}
                    </p>

                    <strong
                      style={{
                        display: "block",
                        fontSize: "clamp(21px, 3vw, 27px)",
                        color: item.color,
                        marginBottom: 8,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {item.value}
                    </strong>

                    <small style={{ color: "#64748b" }}>
                      {item.note}
                    </small>
                  </article>
                ))}
              </section>

              {/* ALERTAS DE ATRASO */}

              {(totals.overdueDebtCount > 0 ||
                totals.overdueAccountCount > 0) && (
                <section
                  style={{
                    ...card,
                    background: "#fffbeb",
                    borderColor: "#fde68a",
                    marginBottom: 20,
                  }}
                >
                  <h2
                    style={{
                      fontSize: 18,
                      margin: "0 0 12px",
                      color: "#92400e",
                    }}
                  >
                    Atenção aos vencimentos
                  </h2>

                  {totals.overdueDebtCount > 0 && (
                    <p
                      style={{
                        color: "#92400e",
                        fontSize: 14,
                        lineHeight: 1.6,
                      }}
                    >
                      Você possui {totals.overdueDebtCount} dívida(s)
                      com vencimento anterior a hoje e saldo em aberto,
                      totalizando {money(totals.overdueDebtTotal)}.
                    </p>
                  )}

                  {totals.overdueAccountCount > 0 && (
                    <p
                      style={{
                        color: "#92400e",
                        fontSize: 14,
                        lineHeight: 1.6,
                        marginBottom: 0,
                      }}
                    >
                      Há {totals.overdueAccountCount} conta(s)
                      pendente(s) com vencimento anterior a hoje,
                      totalizando {money(totals.overdueAccountTotal)}.
                    </p>
                  )}

                  <p
                    style={{
                      color: "#92400e",
                      fontSize: 12,
                      marginBottom: 0,
                    }}
                  >
                    Esses alertas consideram os registros disponíveis.
                    Confira as condições de pagamento com cada credor.
                  </p>
                </section>
              )}

              {/* MOVIMENTAÇÕES DO PERÍODO */}

              <section
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
                  gap: 18,
                  alignItems: "start",
                }}
              >
                <article style={card}>
                  <h2
                    style={{
                      margin: "0 0 6px",
                      fontSize: 21,
                    }}
                  >
                    Movimentações do período
                  </h2>

                  <p style={muted}>
                    {formatDate(start)} até {formatDate(end)}
                  </p>

                  {[
                    [
                      "Pagamentos de dívidas registrados",
                      money(totals.paymentTotal),
                    ],
                    [
                      "Quantidade de pagamentos",
                      String(totals.filteredPayments.length),
                    ],
                    [
                      "Receitas cadastradas",
                      money(totals.periodIncome),
                    ],
                    [
                      "Receitas marcadas como recebidas",
                      money(totals.receivedIncome),
                    ],
                    [
                      "Receitas pendentes",
                      money(totals.pendingIncome),
                    ],
                    [
                      "Despesas marcadas como pagas",
                      money(totals.expensesPaid),
                    ],
                    [
                      "Despesas pendentes",
                      money(totals.expensesPending),
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        gap: 12,
                        padding: "12px 0",
                        borderBottom: "1px solid #edf0f4",
                      }}
                    >
                      <span
                        style={{
                          color: "#475569",
                          fontSize: 13,
                        }}
                      >
                        {label}
                      </span>

                      <strong
                        style={{
                          textAlign: "right",
                          fontSize: 14,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {value}
                      </strong>
                    </div>
                  ))}

                  <p
                    style={{
                      ...muted,
                      fontSize: 12,
                      marginBottom: 0,
                      marginTop: 14,
                    }}
                  >
                    Os pagamentos individuais de dívidas são
                    filtrados pela data do pagamento. O valor pago
                    acumulado nas dívidas é apresentado separadamente
                    para evitar somar os dois indicadores.
                  </p>
                </article>

                {/* SALDOS POR CONTA */}

                <article style={card}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    <h2
                      style={{
                        margin: "0 0 6px",
                        fontSize: 21,
                      }}
                    >
                      Saldo por conta
                    </h2>

                    <a
                      href="/carteira"
                      style={{
                        color: "#176b52",
                        fontWeight: 700,
                        fontSize: 13,
                        textDecoration: "none",
                      }}
                    >
                      Gerenciar →
                    </a>
                  </div>

                  {wallets.length === 0 ? (
                    <div
                      style={{
                        padding: 18,
                        borderRadius: 10,
                        background: "#f8fafc",
                        marginTop: 12,
                      }}
                    >
                      <p style={{ marginTop: 0 }}>
                        Nenhuma conta cadastrada na Carteira.
                      </p>

                      <a
                        href="/carteira"
                        style={{
                          color: "#176b52",
                          fontWeight: 700,
                          textDecoration: "none",
                        }}
                      >
                        Cadastrar conta →
                      </a>
                    </div>
                  ) : (
                    wallets.map((wallet) => (
                      <div
                        key={wallet.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "13px 0",
                          borderBottom: "1px solid #edf0f4",
                        }}
                      >
                        <span
                          style={{
                            minWidth: 0,
                            overflowWrap: "anywhere",
                          }}
                        >
                          <strong
                            style={{
                              display: "block",
                              fontSize: 14,
                            }}
                          >
                            {wallet.name}
                          </strong>

                          <small
                            style={{
                              display: "block",
                              color: "#64748b",
                              marginTop: 4,
                            }}
                          >
                            {wallet.account_type || "Conta"}
                          </small>
                        </span>

                        <strong
                          style={{
                            whiteSpace: "nowrap",
                            fontSize: 14,
                          }}
                        >
                          {money(num(wallet.balance))}
                        </strong>
                      </div>
                    ))
                  )}

                  <p
                    style={{
                      ...muted,
                      fontSize: 12,
                      marginBottom: 0,
                      marginTop: 14,
                    }}
                  >
                    Os saldos exibidos são os valores atuais
                    cadastrados na Carteira, não apenas os valores
                    movimentados no período selecionado.
                  </p>
                </article>
              </section>

              {/* TABELA DE DÍVIDAS */}

              <section
                style={{
                  ...card,
                  marginTop: 18,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 12,
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: "0 0 6px",
                        fontSize: 21,
                      }}
                    >
                      Situação das dívidas
                    </h2>

                    <p style={{ ...muted, margin: 0 }}>
                      Visão geral das dívidas cadastradas,
                      independentemente do período selecionado.
                    </p>
                  </div>

                  <a
                    href="/dividas"
                    style={{
                      color: "#176b52",
                      fontWeight: 700,
                      fontSize: 14,
                      textDecoration: "none",
                    }}
                  >
                    Gerenciar dívidas →
                  </a>
                </div>

                {debts.length === 0 ? (
                  <div
                    style={{
                      padding: 24,
                      textAlign: "center",
                      background: "#f8fafc",
                      borderRadius: 12,
                    }}
                  >
                    <p style={{ fontWeight: 700 }}>
                      Nenhuma dívida cadastrada
                    </p>

                    <a
                      href="/dividas"
                      style={{
                        color: "#176b52",
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      Acessar área de dívidas →
                    </a>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        minWidth: 720,
                      }}
                    >
                      <thead>
                        <tr>
                          {[
                            "Dívida",
                            "Vencimento",
                            "Situação",
                            "Valor original",
                            "Pago acumulado",
                            "Em aberto",
                          ].map((heading) => (
                            <th
                              key={heading}
                              style={{
                                ...tableCell,
                                color: "#64748b",
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                                background: "#f8fafc",
                              }}
                            >
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody>
                        {sortedDebts.map((debt) => {
                          const amount = Math.max(
                            0,
                            num(debt.amount),
                          );

                          const paid = getDebtPaidAmount(debt);
                          const remaining = getDebtRemaining(debt);

                          return (
                            <tr key={debt.id}>
                              <td style={tableCell}>
                                <strong>{debt.name}</strong>
                              </td>

                              <td
                                style={{
                                  ...tableCell,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {formatDate(debt.due_date)}
                              </td>

                              <td style={tableCell}>
                                <span
                                  style={{
                                    display: "inline-block",
                                    borderRadius: 99,
                                    padding: "5px 9px",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: statusColor(debt.status),
                                    background: statusBackground(
                                      debt.status,
                                    ),
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {statusLabel(debt.status)}
                                </span>
                              </td>

                              <td
                                style={{
                                  ...tableCell,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {money(amount)}
                              </td>

                              <td
                                style={{
                                  ...tableCell,
                                  whiteSpace: "nowrap",
                                  color: "#166534",
                                }}
                              >
                                {money(paid)}
                              </td>

                              <td
                                style={{
                                  ...tableCell,
                                  whiteSpace: "nowrap",
                                  fontWeight: 700,
                                  color:
                                    remaining > 0
                                      ? "#b45309"
                                      : "#166534",
                                }}
                              >
                                {money(remaining)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <p
                  style={{
                    ...muted,
                    fontSize: 12,
                    marginBottom: 0,
                    marginTop: 15,
                  }}
                >
                  Os valores pagos e restantes são calculados com
                  base no campo acumulado de cada dívida. O histórico
                  de pagamentos individuais é exibido separadamente.
                  Dívidas canceladas não entram nos totais de dívida
                  ativa nem no saldo em aberto.
                </p>
              </section>

              {/* HISTÓRICO DE PAGAMENTOS */}

              <section
                style={{
                  ...card,
                  marginTop: 18,
                }}
              >
                <h2
                  style={{
                    margin: "0 0 6px",
                    fontSize: 21,
                  }}
                >
                  Histórico de pagamentos no período
                </h2>

                <p style={muted}>
                  Pagamentos individuais registrados entre{" "}
                  {formatDate(start)} e {formatDate(end)}.
                </p>

                {totals.filteredPayments.length === 0 ? (
                  <div
                    style={{
                      padding: 20,
                      borderRadius: 12,
                      background: "#f8fafc",
                      color: "#64748b",
                      fontSize: 14,
                    }}
                  >
                    Nenhum pagamento de dívida encontrado neste
                    período.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        minWidth: 500,
                      }}
                    >
                      <thead>
                        <tr>
                          {[
                            "Data",
                            "Dívida",
                            "Valor pago",
                          ].map((heading) => (
                            <th
                              key={heading}
                              style={{
                                ...tableCell,
                                color: "#64748b",
                                background: "#f8fafc",
                                fontWeight: 700,
                              }}
                            >
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody>
                        {[...totals.filteredPayments]
                          .sort((a, b) =>
                            getPaymentPeriodDate(b).localeCompare(
                              getPaymentPeriodDate(a),
                            ),
                          )
                          .map((payment) => {
                            const debt = debts.find(
                              (item) =>
                                item.id === payment.debt_id,
                            );

                            return (
                              <tr key={payment.id}>
                                <td style={tableCell}>
                                  {formatDate(
                                    getPaymentPeriodDate(payment),
                                  )}
                                </td>

                                <td style={tableCell}>
                                  {debt?.name ??
                                    "Dívida não encontrada"}
                                </td>

                                <td
                                  style={{
                                    ...tableCell,
                                    color: "#166534",
                                    fontWeight: 700,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {money(num(payment.amount))}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    paddingTop: 17,
                    marginTop: 12,
                    borderTop: "1px solid #e2e8f0",
                  }}
                >
                  <span
                    style={{
                      color: "#64748b",
                      fontSize: 14,
                    }}
                  >
                    Total de pagamentos individuais no período
                  </span>

                  <strong
                    style={{
                      color: "#176b52",
                      fontSize: 19,
                    }}
                  >
                    {money(totals.paymentTotal)}
                  </strong>
                </div>
              </section>

              {/* RODAPÉ */}

              <footer
                style={{
                  textAlign: "center",
                  color: "#64748b",
                  fontSize: 12,
                  lineHeight: 1.7,
                  marginTop: 25,
                }}
              >
                <p>
                  Resgata+ · Relatórios financeiros
                </p>

                <p>
                  Os indicadores refletem os registros disponíveis
                  no sistema. Eles não substituem extratos bancários
                  nem confirmam, por si só, que uma transação ocorreu.
                </p>
              </footer>
            </>
          )
        )}
      </main>
    </>
  );
          }
