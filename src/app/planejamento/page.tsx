"use client";

import AppHeader from "@/components/AppHeader";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CSSProperties } from "react";

/* =========================================================
   TIPOS
========================================================= */

type Wallet = {
  id: string;
  name: string;
  balance: number | string;
};

type Debt = {
  id: string;
  name: string;
  amount: number | string;
  paid_amount?: number | string | null;
  due_date: string;
  status: string;
};

type Account = {
  id: string;
  name: string;
  account_type: string;
  amount: number | string;
  due_date: string | null;
  status: string;
};

type Plan = {
  income: string;
  essentials: string;
  otherExpenses: string;
  debtGoal: string;
};

type Notice = {
  type: "success" | "error" | "warning" | "info";
  text: string;
};

/* =========================================================
   CONFIGURAÇÕES E UTILITÁRIOS
========================================================= */

const INITIAL_PLAN: Plan = {
  income: "",
  essentials: "",
  otherExpenses: "",
  debtGoal: "",
};

const PLAN_STORAGE_PREFIX = "resgata-planejamento-";

const money = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

/**
 * Converte números e valores digitados em formato brasileiro.
 *
 * Exemplos:
 * 1.250,50 -> 1250.5
 * 1250,50  -> 1250.5
 * 1250.50  -> 1250.5
 * 1250     -> 1250
 * vazio    -> 0
 */
function parseAmount(
  value: string | number | null | undefined,
): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (value == null || value.trim() === "") {
    return 0;
  }

  let normalized = value.trim().replace(/\s/g, "");

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

function getMonthKey(): string {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
  ].join("-");
}

function todayLocal(): string {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Sem vencimento";

  const datePart = value.slice(0, 10);
  const parts = datePart.split("-");

  if (parts.length !== 3) return value;

  const [year, month, day] = parts;

  if (!year || !month || !day) return value;

  return `${day}/${month}/${year}`;
}

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isCanceled(status: string): boolean {
  return [
    "cancelado",
    "cancelada",
    "cancelled",
    "canceled",
  ].includes(normalizeStatus(status));
}

function isPaid(status: string): boolean {
  return [
    "pago",
    "paga",
    "quitado",
    "quitada",
    "recebido",
    "recebida",
    "paid",
  ].includes(normalizeStatus(status));
}

function isRevenue(accountType: string): boolean {
  return normalizeStatus(accountType) === "receita";
}

function loadStoredPlan(month: string): Plan {
  if (typeof window === "undefined") {
    return INITIAL_PLAN;
  }

  try {
    const saved = localStorage.getItem(
      `${PLAN_STORAGE_PREFIX}${month}`,
    );

    if (!saved) {
      return INITIAL_PLAN;
    }

    const parsed = JSON.parse(saved) as Partial<Plan>;

    return {
      income:
        typeof parsed.income === "string"
          ? parsed.income
          : "",
      essentials:
        typeof parsed.essentials === "string"
          ? parsed.essentials
          : "",
      otherExpenses:
        typeof parsed.otherExpenses === "string"
          ? parsed.otherExpenses
          : "",
      debtGoal:
        typeof parsed.debtGoal === "string"
          ? parsed.debtGoal
          : "",
    };
  } catch {
    return INITIAL_PLAN;
  }
}

/* =========================================================
   COMPONENTE
========================================================= */

export default function PlanejamentoPage() {
  const router = useRouter();

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [plan, setPlan] = useState<Plan>(INITIAL_PLAN);
  const [month, setMonth] = useState(getMonthKey());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Notice | null>(null);

  /* =======================================================
     CARREGAR PLANEJAMENTO DO MÊS
  ======================================================= */

  useEffect(() => {
    setPlan(loadStoredPlan(month));
    setMessage(null);
  }, [month]);

  /* =======================================================
     CARREGAR DADOS DO SUPABASE
  ======================================================= */

  const loadFinancialData = useCallback(async () => {
    setLoading(true);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();

      const {
        data: authData,
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        throw authError;
      }

      if (!authData.user) {
        router.replace("/login");
        return;
      }

      const userId = authData.user.id;

      const [walletResult, debtResult, accountResult] =
        await Promise.all([
          supabase
            .from("wallet_accounts")
            .select("id,name,balance")
            .eq("user_id", userId),

          supabase
            .from("debts")
            .select(
              "id,name,amount,paid_amount,due_date,status",
            )
            .eq("user_id", userId),

          supabase
            .from("control_accounts")
            .select(
              "id,name,account_type,amount,due_date,status",
            )
            .eq("user_id", userId),
        ]);

      if (walletResult.error) {
        throw walletResult.error;
      }

      if (debtResult.error) {
        throw debtResult.error;
      }

      if (accountResult.error) {
        throw accountResult.error;
      }

      setWallets((walletResult.data ?? []) as Wallet[]);
      setDebts((debtResult.data ?? []) as Debt[]);
      setAccounts((accountResult.data ?? []) as Account[]);
    } catch (error) {
      console.error(
        "Erro ao carregar planejamento financeiro:",
        error,
      );

      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os dados financeiros.",
      });
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadFinancialData();
  }, [loadFinancialData]);

  /* =======================================================
     TOTAIS FINANCEIROS
  ======================================================= */

  const totals = useMemo(() => {
    const walletBalance = wallets.reduce(
      (sum, wallet) => sum + parseAmount(wallet.balance),
      0,
    );

    /*
     * Calcula o saldo restante das dívidas.
     * Dívidas canceladas ou quitadas não entram no total.
     */
    const openDebts = debts.reduce((sum, debt) => {
      const status = normalizeStatus(debt.status);

      if (
        isCanceled(status) ||
        [
          "pago",
          "paga",
          "quitado",
          "quitada",
          "liquidado",
          "liquidada",
        ].includes(status)
      ) {
        return sum;
      }

      const originalAmount = Math.max(
        0,
        parseAmount(debt.amount),
      );

      const paidAmount = Math.max(
        0,
        parseAmount(debt.paid_amount),
      );

      const remaining = Math.max(
        0,
        originalAmount - paidAmount,
      );

      return sum + remaining;
    }, 0);

    /*
     * Considera somente os registros do mês escolhido.
     */
    const monthAccounts = accounts.filter((account) => {
      if (isCanceled(account.status)) {
        return false;
      }

      if (!account.due_date) {
        return false;
      }

      return account.due_date.slice(0, 7) === month;
    });

    /*
     * Despesas pendentes.
     * Receitas não são tratadas como contas a pagar.
     */
    const pendingBills = monthAccounts
      .filter(
        (account) =>
          !isRevenue(account.account_type) &&
          !isPaid(account.status),
      )
      .reduce(
        (sum, account) =>
          sum + Math.max(0, parseAmount(account.amount)),
        0,
      );

    /*
     * Receitas cadastradas no mês.
     * Inclui receitas pendentes e recebidas, para mostrar
     * o total registrado e não apenas o dinheiro recebido.
     */
    const recordedIncome = monthAccounts
      .filter((account) =>
        isRevenue(account.account_type),
      )
      .reduce(
        (sum, account) =>
          sum + Math.max(0, parseAmount(account.amount)),
        0,
      );

    /*
     * Despesas efetivamente marcadas como pagas.
     */
    const recordedExpenses = monthAccounts
      .filter(
        (account) =>
          !isRevenue(account.account_type) &&
          isPaid(account.status),
      )
      .reduce(
        (sum, account) =>
          sum + Math.max(0, parseAmount(account.amount)),
        0,
      );

    /*
     * Valores planejados.
     */
    const income = parseAmount(plan.income);
    const essentials = parseAmount(plan.essentials);
    const otherExpenses = parseAmount(plan.otherExpenses);
    const debtGoal = parseAmount(plan.debtGoal);

    const totalPlannedExpenses =
      essentials + otherExpenses;

    const available =
      income - totalPlannedExpenses;

    const afterGoal =
      available - debtGoal;

    const committedPercentage =
      income > 0
        ? (totalPlannedExpenses / income) * 100
        : 0;

    const goalPercentage =
      openDebts > 0
        ? (debtGoal / openDebts) * 100
        : 0;

    const monthlySurplus =
      recordedIncome - recordedExpenses;

    return {
      walletBalance,
      openDebts,
      pendingBills,
      recordedIncome,
      recordedExpenses,
      monthlySurplus,

      income,
      essentials,
      otherExpenses,
      debtGoal,

      totalPlannedExpenses,
      available,
      afterGoal,

      committedPercentage,
      goalPercentage,
    };
  }, [wallets, debts, accounts, plan, month]);

  /* =======================================================
     ATUALIZAR CAMPOS
  ======================================================= */

  function updatePlan(
    field: keyof Plan,
    value: string,
  ) {
    setPlan((current) => ({
      ...current,
      [field]: value,
    }));

    setMessage(null);
  }

  /* =======================================================
     SALVAR PLANEJAMENTO NO NAVEGADOR
  ======================================================= */

  function savePlan() {
    setSaving(true);
    setMessage(null);

    try {
      const values = [
        plan.income,
        plan.essentials,
        plan.otherExpenses,
        plan.debtGoal,
      ];

      for (const value of values) {
        if (!value.trim()) {
          continue;
        }

        const normalized = value.trim();

        /*
         * Não permite valores negativos ou entradas inválidas.
         */
        if (
          !/^\d[\d.,\s]*$/.test(normalized) ||
          !Number.isFinite(parseAmount(normalized))
        ) {
          throw new Error(
            "Digite valores monetários válidos, como 1250,50.",
          );
        }

        if (parseAmount(normalized) < 0) {
          throw new Error(
            "Os valores do planejamento não podem ser negativos.",
          );
        }
      }

      localStorage.setItem(
        `${PLAN_STORAGE_PREFIX}${month}`,
        JSON.stringify(plan),
      );

      setMessage({
        type: "success",
        text: `Planejamento de ${month} salvo neste navegador.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o planejamento.",
      });
    } finally {
      setSaving(false);
    }
  }

  /* =======================================================
     LIMPAR PLANEJAMENTO DO MÊS
  ======================================================= */

  function clearPlan() {
    const confirmed = window.confirm(
      `Deseja realmente apagar o planejamento de ${month}?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      localStorage.removeItem(
        `${PLAN_STORAGE_PREFIX}${month}`,
      );

      setPlan(INITIAL_PLAN);

      setMessage({
        type: "success",
        text: "Planejamento do mês apagado.",
      });
    } catch {
      setMessage({
        type: "error",
        text: "Não foi possível apagar o planejamento.",
      });
    }
  }

  /* =======================================================
     ESTILOS
  ======================================================= */

  const pageStyle: CSSProperties = {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "28px 18px 50px",
    color: "#172033",
  };

  const cardStyle: CSSProperties = {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 20,
    minWidth: 0,
    boxShadow: "0 2px 8px rgba(15,23,42,0.025)",
  };

  const fieldStyle: CSSProperties = {
    width: "100%",
    minHeight: 46,
    padding: "11px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    fontSize: 15,
    boxSizing: "border-box",
    background: "#ffffff",
    color: "#172033",
    outlineColor: "#176b52",
  };

  const primaryButtonStyle: CSSProperties = {
    border: 0,
    borderRadius: 10,
    padding: "13px 17px",
    background: "#176b52",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    minHeight: 46,
  };

  const secondaryButtonStyle: CSSProperties = {
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "12px 15px",
    background: "#ffffff",
    color: "#334155",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
    minHeight: 44,
  };

  const mutedStyle: CSSProperties = {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 1.6,
  };

  /* =======================================================
     CARREGAMENTO
  ======================================================= */

  return (
    <>
      <AppHeader />

      <main style={pageStyle}>
        {/* CABEÇALHO */}

        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 18,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 26,
          }}
        >
          <div style={{ minWidth: 0, flex: "1 1 300px" }}>
            <p
              style={{
                color: "#176b52",
                fontWeight: 700,
                fontSize: 13,
                textTransform: "uppercase",
                letterSpacing: 1,
                margin: "0 0 8px",
              }}
            >
              RESGATA+ · ORGANIZAÇÃO FINANCEIRA
            </p>

            <h1
              style={{
                fontSize: "clamp(27px, 4vw, 37px)",
                lineHeight: 1.15,
                letterSpacing: "-0.7px",
                margin: 0,
              }}
            >
              Planejamento mensal
            </h1>

            <p style={{ ...mutedStyle, marginBottom: 0 }}>
              Organize seu orçamento, acompanhe suas contas e
              defina metas realistas para reduzir suas dívidas.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gap: 7,
              minWidth: 190,
            }}
          >
            <label
              htmlFor="reference-month"
              style={{
                fontWeight: 700,
                fontSize: 13,
                color: "#334155",
              }}
            >
              Mês de referência
            </label>

            <input
              id="reference-month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              style={fieldStyle}
            />
          </div>
        </header>

        {/* MENSAGENS */}

        {message && (
          <div
            role="status"
            aria-live="polite"
            style={{
              padding: "13px 15px",
              borderRadius: 11,
              marginBottom: 20,
              border:
                message.type === "success"
                  ? "1px solid #a7f3d0"
                  : message.type === "error"
                    ? "1px solid #fecaca"
                    : "1px solid #bfdbfe",
              background:
                message.type === "success"
                  ? "#ecfdf5"
                  : message.type === "error"
                    ? "#fef2f2"
                    : message.type === "warning"
                      ? "#fffbeb"
                      : "#eff6ff",
              color:
                message.type === "success"
                  ? "#065f46"
                  : message.type === "error"
                    ? "#991b1b"
                    : message.type === "warning"
                      ? "#92400e"
                      : "#1d4ed8",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {message.text}
          </div>
        )}

        {/* CARREGAMENTO */}

        {loading ? (
          <div
            style={{
              ...cardStyle,
              textAlign: "center",
              padding: 38,
            }}
          >
            <p style={{ fontWeight: 700, marginTop: 0 }}>
              Carregando seus dados financeiros...
            </p>

            <p style={mutedStyle}>
              Estamos consultando sua Carteira, suas dívidas e
              suas contas cadastradas.
            </p>
          </div>
        ) : (
          <>
            {/* RESUMO FINANCEIRO */}

            <section
              aria-label="Resumo financeiro"
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
                gap: 14,
                marginBottom: 22,
              }}
            >
              {[
                {
                  title: "Saldo da Carteira",
                  value: money(totals.walletBalance),
                  description:
                    "Soma dos saldos cadastrados na Carteira.",
                  color: "#176b52",
                },
                {
                  title: "Dívidas restantes",
                  value: money(totals.openDebts),
                  description:
                    "Saldo devedor após descontar os pagamentos registrados.",
                  color: "#b45309",
                },
                {
                  title: "Contas pendentes",
                  value: money(totals.pendingBills),
                  description:
                    "Despesas pendentes com vencimento neste mês.",
                  color: "#b91c1c",
                },
                {
                  title: "Despesas pagas",
                  value: money(totals.recordedExpenses),
                  description:
                    "Despesas do mês marcadas como pagas.",
                  color: "#176b52",
                },
              ].map((item) => (
                <article
                  key={item.title}
                  style={cardStyle}
                >
                  <p
                    style={{
                      margin: "0 0 9px",
                      color: "#64748b",
                      fontSize: 13,
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
                      letterSpacing: "-0.5px",
                      overflowWrap: "anywhere",
                      marginBottom: 9,
                    }}
                  >
                    {item.value}
                  </strong>

                  <p
                    style={{
                      ...mutedStyle,
                      margin: 0,
                      fontSize: 12,
                    }}
                  >
                    {item.description}
                  </p>
                </article>
              ))}
            </section>

            {/* ORÇAMENTO E SIMULAÇÃO */}

            <section
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
                gap: 18,
                alignItems: "start",
              }}
            >
              {/* FORMULÁRIO */}

              <article style={cardStyle}>
                <div style={{ marginBottom: 21 }}>
                  <p
                    style={{
                      margin: "0 0 6px",
                      color: "#176b52",
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.8,
                    }}
                  >
                    ETAPA 1
                  </p>

                  <h2
                    style={{
                      margin: 0,
                      fontSize: 22,
                      letterSpacing: "-0.3px",
                    }}
                  >
                    Monte seu orçamento
                  </h2>

                  <p style={mutedStyle}>
                    Informe quanto pretende receber, gastar e
                    destinar ao pagamento das dívidas.
                  </p>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 17,
                  }}
                >
                  {(
                    [
                      {
                        key: "income",
                        label: "Renda prevista no mês",
                        description:
                          "Salários e outras entradas previstas.",
                      },
                      {
                        key: "essentials",
                        label: "Gastos essenciais",
                        description:
                          "Moradia, alimentação, água, energia e transporte.",
                      },
                      {
                        key: "otherExpenses",
                        label: "Outros gastos previstos",
                        description:
                          "Despesas pessoais e gastos não essenciais.",
                      },
                      {
                        key: "debtGoal",
                        label: "Meta para pagamento de dívidas",
                        description:
                          "Valor que você pretende destinar às dívidas.",
                      },
                    ] as {
                      key: keyof Plan;
                      label: string;
                      description: string;
                    }[]
                  ).map((field) => (
                    <div
                      key={field.key}
                      style={{
                        display: "grid",
                        gap: 6,
                      }}
                    >
                      <label
                        htmlFor={field.key}
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                        }}
                      >
                        {field.label}
                      </label>

                      <div style={{ position: "relative" }}>
                        <span
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            left: 12,
                            top: "50%",
                            transform: "translateY(-50%)",
                            color: "#64748b",
                            fontSize: 13,
                            pointerEvents: "none",
                          }}
                        >
                          R$
                        </span>

                        <input
                          id={field.key}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0,00"
                          value={plan[field.key]}
                          onChange={(event) =>
                            updatePlan(
                              field.key,
                              event.target.value,
                            )
                          }
                          style={{
                            ...fieldStyle,
                            paddingLeft: 40,
                          }}
                        />
                      </div>

                      <small
                        style={{
                          color: "#64748b",
                          fontSize: 12,
                          lineHeight: 1.5,
                        }}
                      >
                        {field.description}
                      </small>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(130px, 1fr))",
                    gap: 10,
                    marginTop: 23,
                  }}
                >
                  <button
                    type="button"
                    onClick={savePlan}
                    disabled={saving}
                    style={{
                      ...primaryButtonStyle,
                      opacity: saving ? 0.7 : 1,
                    }}
                  >
                    {saving
                      ? "Salvando..."
                      : "Salvar planejamento"}
                  </button>

                  <button
                    type="button"
                    onClick={clearPlan}
                    disabled={saving}
                    style={secondaryButtonStyle}
                  >
                    Limpar mês
                  </button>
                </div>

                <div
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: "#f8fafc",
                    marginTop: 17,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      color: "#64748b",
                      fontSize: 12,
                      lineHeight: 1.6,
                    }}
                  >
                    Os valores são previsões. Salvar o
                    planejamento não movimenta dinheiro nem
                    altera os saldos da Carteira.
                  </p>
                </div>
              </article>

              {/* SIMULAÇÃO */}

              <article style={cardStyle}>
                <div style={{ marginBottom: 16 }}>
                  <p
                    style={{
                      margin: "0 0 6px",
                      color: "#176b52",
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.8,
                    }}
                  >
                    ETAPA 2
                  </p>

                  <h2
                    style={{
                      margin: 0,
                      fontSize: 22,
                      letterSpacing: "-0.3px",
                    }}
                  >
                    Simulação do mês
                  </h2>

                  <p style={mutedStyle}>
                    Os resultados são recalculados enquanto
                    você altera os valores do orçamento.
                  </p>
                </div>

                <div>
                  {[
                    {
                      label: "Renda prevista",
                      value: totals.income,
                      color: "#172033",
                    },
                    {
                      label: "Gastos essenciais",
                      value: -totals.essentials,
                      color: "#172033",
                    },
                    {
                      label: "Outros gastos",
                      value: -totals.otherExpenses,
                      color: "#172033",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        padding: "14px 0",
                        borderBottom: "1px solid #edf0f4",
                      }}
                    >
                      <span
                        style={{
                          color: "#475569",
                          fontSize: 14,
                        }}
                      >
                        {item.label}
                      </span>

                      <strong
                        style={{
                          color: item.color,
                          fontSize: 14,
                          textAlign: "right",
                        }}
                      >
                        {money(item.value)}
                      </strong>
                    </div>
                  ))}
                </div>

                {/* DISPONÍVEL */}

                <div
                  style={{
                    padding: "20px 0",
                    borderBottom: "1px solid #edf0f4",
                  }}
                >
                  <span
                    style={{
                      color: "#64748b",
                      fontSize: 13,
                    }}
                  >
                    Disponível após gastos planejados
                  </span>

                  <strong
                    style={{
                      display: "block",
                      fontSize: "clamp(25px, 4vw, 31px)",
                      color:
                        totals.available < 0
                          ? "#b91c1c"
                          : "#176b52",
                      marginTop: 7,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {money(totals.available)}
                  </strong>
                </div>

                {/* SALDO APÓS A META */}

                <div style={{ paddingTop: 19 }}>
                  <span
                    style={{
                      color: "#64748b",
                      fontSize: 13,
                    }}
                  >
                    Saldo após a meta de dívidas
                  </span>

                  <strong
                    style={{
                      display: "block",
                      fontSize: "clamp(25px, 4vw, 31px)",
                      color:
                        totals.afterGoal < 0
                          ? "#b91c1c"
                          : "#176b52",
                      marginTop: 7,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {money(totals.afterGoal)}
                  </strong>
                </div>

                {/* COMPROMETIMENTO */}

                <div style={{ marginTop: 23 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        color: "#64748b",
                      }}
                    >
                      Renda comprometida
                    </span>

                    <strong style={{ fontSize: 13 }}>
                      {totals.income > 0
                        ? `${totals.committedPercentage.toLocaleString(
                            "pt-BR",
                            { maximumFractionDigits: 1 },
                          )}%`
                        : "—"}
                    </strong>
                  </div>

                  <div
                    style={{
                      height: 9,
                      borderRadius: 99,
                      background: "#e2e8f0",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            0,
                            totals.committedPercentage,
                          ),
                        )}%`,
                        height: "100%",
                        background:
                          totals.committedPercentage > 100
                            ? "#dc2626"
                            : "#176b52",
                        borderRadius: 99,
                        transition: "width 0.2s ease",
                      }}
                    />
                  </div>
                </div>

                {/* ALERTAS */}

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    marginTop: 22,
                  }}
                >
                  {totals.income === 0 && (
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        background: "#eff6ff",
                        color: "#1d4ed8",
                        fontSize: 13,
                        lineHeight: 1.6,
                      }}
                    >
                      Informe sua renda prevista para calcular
                      o orçamento mensal.
                    </div>
                  )}

                  {totals.available < 0 && (
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        background: "#fef2f2",
                        color: "#991b1b",
                        fontSize: 13,
                        lineHeight: 1.6,
                      }}
                    >
                      <strong>Atenção:</strong> seus gastos
                      planejados ultrapassam sua renda em{" "}
                      {money(Math.abs(totals.available))}.
                      Revise o orçamento antes de assumir novos
                      compromissos.
                    </div>
                  )}

                  {totals.available >= 0 &&
                    totals.debtGoal > totals.available && (
                      <div
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          background: "#fffbeb",
                          color: "#92400e",
                          fontSize: 13,
                          lineHeight: 1.6,
                        }}
                      >
                        <strong>Revise sua meta:</strong> o
                        valor destinado às dívidas supera o
                        dinheiro disponível após os gastos
                        planejados em{" "}
                        {money(
                          totals.debtGoal - totals.available,
                        )}
                        .
                      </div>
                    )}

                  {totals.income > 0 &&
                    totals.available >= 0 &&
                    totals.debtGoal <= totals.available && (
                      <div
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          background: "#ecfdf5",
                          color: "#065f46",
                          fontSize: 13,
                          lineHeight: 1.6,
                        }}
                      >
                        <strong>Orçamento dentro do limite:</strong>{" "}
                        a meta de dívidas cabe no valor disponível
                        calculado para este mês.
                      </div>
                    )}

                  {totals.openDebts === 0 &&
                    totals.debtGoal > 0 && (
                      <div
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          fontSize: 13,
                          lineHeight: 1.6,
                        }}
                      >
                        Você informou uma meta para dívidas,
                        mas não há saldo devedor em aberto
                        identificado nos registros consultados.
                        Confira seus cadastros antes de usar
                        essa meta.
                      </div>
                    )}
                </div>

                {/* CONTEXTO */}

                <p
                  style={{
                    ...mutedStyle,
                    fontSize: 12,
                    marginTop: 20,
                    marginBottom: 0,
                  }}
                >
                  A simulação considera somente os valores
                  informados no orçamento. O saldo da Carteira,
                  as receitas cadastradas e as contas existentes
                  são apresentados separadamente para evitar
                  somar previsões e saldos sem confirmação.
                </p>
              </article>
            </section>

            {/* INDICADORES DAS CONTAS CADASTRADAS */}

            <section
              style={{
                ...cardStyle,
                marginTop: 18,
              }}
            >
              <h2
                style={{
                  margin: "0 0 6px",
                  fontSize: 21,
                }}
              >
                Movimentação registrada no mês
              </h2>

              <p style={mutedStyle}>
                Resumo das receitas e despesas cadastradas em
                Controle de Contas para o mês selecionado.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
                  gap: 12,
                  marginTop: 18,
                }}
              >
                <div
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: "#166534",
                    }}
                  >
                    Receitas registradas
                  </span>

                  <strong
                    style={{
                      display: "block",
                      fontSize: 23,
                      color: "#166534",
                      marginTop: 7,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {money(totals.recordedIncome)}
                  </strong>
                </div>

                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: "#991b1b",
                    }}
                  >
                    Despesas pagas
                  </span>

                  <strong
                    style={{
                      display: "block",
                      fontSize: 23,
                      color: "#991b1b",
                      marginTop: 7,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {money(totals.recordedExpenses)}
                  </strong>
                </div>

                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: "#475569",
                    }}
                  >
                    Diferença registrada
                  </span>

                  <strong
                    style={{
                      display: "block",
                      fontSize: 23,
                      color:
                        totals.monthlySurplus < 0
                          ? "#b91c1c"
                          : "#176b52",
                      marginTop: 7,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {money(totals.monthlySurplus)}
                  </strong>
                </div>
              </div>

              <p
                style={{
                  ...mutedStyle,
                  fontSize: 12,
                  marginBottom: 0,
                  marginTop: 15,
                }}
              >
                A diferença registrada é calculada subtraindo
                as despesas marcadas como pagas das receitas
                cadastradas no mês. Ela não representa
                necessariamente o saldo bancário real.
              </p>
            </section>

            {/* CARTEIRA */}

            <section
              style={{
                ...cardStyle,
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
                  marginBottom: 17,
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: "0 0 5px",
                      fontSize: 21,
                    }}
                  >
                    Contas da Carteira
                  </h2>

                  <p
                    style={{
                      ...mutedStyle,
                      margin: 0,
                    }}
                  >
                    Consulte os saldos registrados em cada conta.
                  </p>
                </div>

                <a
                  href="/carteira"
                  style={{
                    color: "#176b52",
                    fontWeight: 700,
                    textDecoration: "none",
                    fontSize: 14,
                  }}
                >
                  Abrir Carteira →
                </a>
              </div>

              {wallets.length === 0 ? (
                <div
                  style={{
                    padding: 22,
                    textAlign: "center",
                    background: "#f8fafc",
                    borderRadius: 12,
                  }}
                >
                  <p
                    style={{
                      fontWeight: 700,
                      marginTop: 0,
                    }}
                  >
                    Nenhuma conta cadastrada
                  </p>

                  <p style={mutedStyle}>
                    Cadastre uma conta na Carteira para acompanhar
                    os saldos nesta página.
                  </p>

                  <a
                    href="/carteira"
                    style={{
                      display: "inline-block",
                      color: "#176b52",
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    Cadastrar ou consultar contas →
                  </a>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(min(100%, 210px), 1fr))",
                    gap: 12,
                  }}
                >
                  {wallets.map((wallet) => (
                    <article
                      key={wallet.id}
                      style={{
                        padding: 16,
                        borderRadius: 12,
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          color: "#64748b",
                          fontSize: 13,
                          marginBottom: 7,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {wallet.name}
                      </div>

                      <strong
                        style={{
                          display: "block",
                          fontSize: 22,
                          color: "#172033",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {money(parseAmount(wallet.balance))}
                      </strong>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* ATALHOS */}

            <section
              style={{
                ...cardStyle,
                marginTop: 18,
              }}
            >
              <h2
                style={{
                  margin: "0 0 14px",
                  fontSize: 20,
                }}
              >
                Acesso rápido
              </h2>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
                  gap: 12,
                }}
              >
                <a
                  href="/carteira"
                  style={{
                    display: "block",
                    padding: 16,
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    textDecoration: "none",
                    color: "#172033",
                    background: "#ffffff",
                  }}
                >
                  <strong style={{ display: "block" }}>
                    Minha Carteira
                  </strong>

                  <span
                    style={{
                      ...mutedStyle,
                      display: "block",
                      marginTop: 5,
                      fontSize: 12,
                    }}
                  >
                    Consultar contas e saldos.
                  </span>
                </a>

                <a
                  href="/controle-contas"
                  style={{
                    display: "block",
                    padding: 16,
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    textDecoration: "none",
                    color: "#172033",
                    background: "#ffffff",
                  }}
                >
                  <strong style={{ display: "block" }}>
                    Controle de Contas
                  </strong>

                  <span
                    style={{
                      ...mutedStyle,
                      display: "block",
                      marginTop: 5,
                      fontSize: 12,
                    }}
                  >
                    Acompanhar vencimentos e pagamentos.
                  </span>
                </a>

                <a
                  href="/dividas"
                  style={{
                    display: "block",
                    padding: 16,
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    textDecoration: "none",
                    color: "#172033",
                    background: "#ffffff",
                  }}
                >
                  <strong style={{ display: "block" }}>
                    Minhas Dívidas
                  </strong>

                  <span
                    style={{
                      ...mutedStyle,
                      display: "block",
                      marginTop: 5,
                      fontSize: 12,
                    }}
                  >
                    Consultar dívidas e pagamentos registrados.
                  </span>
                </a>
              </div>
            </section>

            {/* RODAPÉ */}

            <footer
              style={{
                textAlign: "center",
                marginTop: 25,
                color: "#64748b",
                fontSize: 12,
                lineHeight: 1.7,
              }}
            >
              <p>
                Resgata+ · Planejamento financeiro pessoal
              </p>

              <p>
                Os cálculos são estimativas baseadas nos dados
                cadastrados e nos valores informados. Confira
                vencimentos, saldos e pagamentos antes de tomar
                decisões financeiras.
              </p>
            </footer>
          </>
        )}
      </main>
    </>
  );
      }
