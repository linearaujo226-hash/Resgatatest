"use client";

import AppHeader from "@/components/AppHeader";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { DebtPriority } from "@/types";

type Debt = {
  id: string;
  user_id: string;
  name: string;
  creditor: string | null;
  amount: number | string;
  paid_amount?: number | string | null;
  due_date: string | null;
  category: string | null;
  priority: DebtPriority;
  status?: string | null;
  payment_reported?: boolean | null;
  created_at?: string;
};

type DebtPayment = {
  id: string;
  debt_id: string;
  user_id: string;
  amount: number | string;
  payment_date: string;
  notes: string | null;
  created_at?: string;
};

type Feedback = {
  type: "success" | "error";
  message: string;
};

const CATEGORIES: Record<string, string> = {
  pessoal: "Dívida pessoal",
  boleto: "Boleto",
  cartao: "Cartão de crédito",
  emprestimo: "Empréstimo",
  conta: "Conta atrasada",
  financiamento: "Financiamento",
  acordo: "Acordo / renegociação",
  outra: "Outra dívida",
};

const money = (value: number) =>
  (Number.isFinite(value) ? value : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

function localDate() {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function dateLabel(value?: string | null) {
  if (!value) return "Não informada";

  const parts = value.slice(0, 10).split("-");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    return "Data inválida";
  }

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function debtValues(debt: Debt) {
  const original = Math.max(0, toNumber(debt.amount));
  const paid = Math.min(original, Math.max(0, toNumber(debt.paid_amount)));
  const remaining = Math.max(0, original - paid);

  return { original, paid, remaining };
}

function debtStatus(debt: Debt, today: string) {
  const { remaining } = debtValues(debt);

  if (remaining <= 0) return "pago";
  if (debt.due_date && debt.due_date.slice(0, 10) < today) {
    return "atrasado";
  }

  return "pendente";
}

function daysUntil(date: string, today: string) {
  const [y1, m1, d1] = date.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = today.split("-").map(Number);

  return Math.round(
    (Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) /
      86_400_000
  );
}

function readableError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);

    if (code === "23502") return "Preencha todos os campos obrigatórios.";
    if (code === "23503") return "Não foi possível relacionar esse registro.";
    if (code === "23514") return "Um dos valores não é permitido.";
    if (code === "23505") return "Este registro já existe.";
    if (code === "42501" || code === "PGRST301") {
      return "Operação não autorizada. Confira sua sessão e as permissões do banco.";
    }
    if (code === "PGRST202" || code === "42883") {
      return "A função de pagamentos ainda não está configurada no Supabase. Execute o SQL fornecido abaixo do código.";
    }
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = String(error.message);

    if (/network|fetch failed|failed to fetch/i.test(message)) {
      return "Falha de conexão. Verifique sua internet e tente novamente.";
    }

    return message;
  }

  return "Não foi possível concluir a operação. Tente novamente.";
}

const cardStyle = {
  background: "var(--card, #fff)",
  border: "1px solid var(--border, #e2e8f0)",
  borderRadius: 16,
  padding: 20,
  minWidth: 0,
} as const;

const labelStyle = {
  display: "block",
  marginBottom: 7,
  fontSize: 13,
  fontWeight: 700,
  color: "var(--foreground, #172033)",
} as const;

const inputStyle = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box" as const,
  minHeight: 44,
  padding: "11px 12px",
  borderRadius: 10,
  border: "1px solid var(--border, #dbe2ea)",
  background: "var(--input, #fff)",
  color: "var(--foreground, #172033)",
  fontSize: 14,
} as const;

const buttonStyle = {
  display: "inline-flex",
  justifyContent: "center",
  alignItems: "center",
  gap: 7,
  minHeight: 40,
  padding: "9px 13px",
  border: "1px solid var(--border, #dbe2ea)",
  borderRadius: 10,
  background: "var(--card, #fff)",
  color: "var(--foreground, #172033)",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
} as const;

export default function DebtsPage() {
  const router = useRouter();

  const [items, setItems] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const [name, setName] = useState("");
  const [creditor, setCreditor] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [category, setCategory] = useState("outra");
  const [priority, setPriority] = useState<DebtPriority>("normal");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todas");

  const [paymentDebt, setPaymentDebt] = useState<Debt | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(localDate());
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentHistory, setPaymentHistory] = useState<DebtPayment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const today = localDate();

  const refresh = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data: auth, error: authError } =
      await supabase.auth.getUser();

    if (authError) throw authError;

    if (!auth.user) {
      router.replace("/login");
      return;
    }

    const { data, error } = await supabase
      .from("debts")
      .select("*")
      .eq("user_id", auth.user.id)
      .order("due_date", { ascending: true });

    if (error) throw error;

    setItems((data ?? []) as Debt[]);
  }, [router]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        await refresh();
      } catch (error) {
        if (active) {
          setFeedback({ type: "error", message: readableError(error) });
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [refresh]);

  const totals = useMemo(
    () =>
      items.reduce(
        (result, item) => {
          const values = debtValues(item);
          const status = debtStatus(item, today);

          result.original += values.original;
          result.paid += values.paid;
          result.open += values.remaining;

          if (status === "atrasado") result.overdue += values.remaining;
          if (status === "pendente") result.upcoming += values.remaining;

          return result;
        },
        { original: 0, paid: 0, open: 0, overdue: 0, upcoming: 0 }
      ),
    [items, today]
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");

    return items.filter((item) => {
      const status = debtStatus(item, today);
      const matchesStatus = filter === "todas" || status === filter;

      const text = [
        item.name,
        item.creditor ?? "",
        CATEGORIES[item.category ?? "outra"] ?? item.category ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR");

      return matchesStatus && (!query || text.includes(query));
    });
  }, [items, search, filter, today]);

  const nextDebt = useMemo(() => {
    return items
      .filter((item) => debtValues(item).remaining > 0 && item.due_date)
      .sort((a, b) =>
        String(a.due_date).localeCompare(String(b.due_date))
      )[0] ?? null;
  }, [items]);

  async function addDebt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const cleanName = name.trim();
    const cleanCreditor = creditor.trim();
    const numericAmount = Number(amount);

    if (!cleanName || !amount.trim() || !dueDate) {
      setFeedback({
        type: "error",
        message: "Preencha o nome, o valor e o vencimento.",
      });
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFeedback({
        type: "error",
        message: "Informe um valor maior que zero.",
      });
      return;
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
      Number.isNaN(new Date(`${dueDate}T12:00:00`).getTime()) ||
      dueDate < "1900-01-01"
    ) {
      setFeedback({
        type: "error",
        message: "Informe uma data de vencimento válida.",
      });
      return;
    }

    if (cleanName.length > 120 || cleanCreditor.length > 120) {
      setFeedback({
        type: "error",
        message: "Nome e credor devem ter no máximo 120 caracteres.",
      });
      return;
    }

    setSaving(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: auth, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      if (!auth.user) {
        router.replace("/login");
        return;
      }

      const { error } = await supabase.from("debts").insert({
        user_id: auth.user.id,
        name: cleanName,
        creditor: cleanCreditor || "Não informado",
        amount: Math.round(numericAmount * 100) / 100,
        due_date: dueDate,
        category,
        priority,
        status: "pendente",
      });

      if (error) throw error;

      setName("");
      setCreditor("");
      setAmount("");
      setDueDate("");
      setCategory("outra");
      setPriority("normal");

      await refresh();

      setFeedback({
        type: "success",
        message: "Dívida cadastrada com sucesso.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: `Não foi possível cadastrar a dívida: ${readableError(error)}`,
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeDebt(item: Debt) {
    if (
      !window.confirm(
        `Deseja excluir "${item.name}"? Essa operação não pode ser desfeita.`
      )
    ) {
      return;
    }

    setActionId(item.id);
    setFeedback(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: auth, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;
      if (!auth.user) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("debts")
        .delete()
        .eq("id", item.id)
        .eq("user_id", auth.user.id)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error(
          "A dívida não foi excluída. Atualize a página e confira as permissões."
        );
      }

      await refresh();
      setFeedback({ type: "success", message: "Dívida excluída." });
    } catch (error) {
      setFeedback({ type: "error", message: readableError(error) });
    } finally {
      setActionId(null);
    }
  }

  async function openPayment(item: Debt) {
    setPaymentDebt(item);
    setPaymentAmount("");
    setPaymentDate(localDate());
    setPaymentNotes("");
    setPaymentHistory([]);
    setHistoryLoading(true);
    setFeedback(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: auth, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;
      if (!auth.user) {
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("debt_payments")
        .select("id, debt_id, user_id, amount, payment_date, notes, created_at")
        .eq("debt_id", item.id)
        .eq("user_id", auth.user.id)
        .order("payment_date", { ascending: false });

      if (error) throw error;
      setPaymentHistory((data ?? []) as DebtPayment[]);
    } catch (error) {
      setFeedback({
        type: "error",
        message: `Não foi possível carregar o histórico: ${readableError(error)}`,
      });
    } finally {
      setHistoryLoading(false);
    }
  }

  async function registerPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!paymentDebt) return;
    setFeedback(null);

    const value = Number(paymentAmount);
    const remaining = debtValues(paymentDebt).remaining;

    if (!Number.isFinite(value) || value <= 0) {
      setFeedback({
        type: "error",
        message: "Informe um valor de pagamento maior que zero.",
      });
      return;
    }

    if (value > remaining + 0.001) {
      setFeedback({
        type: "error",
        message: `O pagamento não pode ser maior que o saldo restante de ${money(remaining)}.`,
      });
      return;
    }

    if (!paymentDate || paymentDate > localDate()) {
      setFeedback({
        type: "error",
        message: "Informe uma data de pagamento válida, não futura.",
      });
      return;
    }

    setPaymentSaving(true);

    try {
      const supabase = getSupabaseBrowserClient();

      // A função SQL registra o pagamento e atualiza paid_amount
      // em uma única transação no banco.
      const { error } = await supabase.rpc("registrar_pagamento_divida", {
        p_debt_id: paymentDebt.id,
        p_amount: Math.round(value * 100) / 100,
        p_payment_date: paymentDate,
        p_notes: paymentNotes.trim() || null,
      });

      if (error) throw error;

      const debtName = paymentDebt.name;

      await refresh();
      setPaymentDebt(null);
      setPaymentHistory([]);

      setFeedback({
        type: "success",
        message: `Pagamento de ${money(value)} registrado para "${debtName}".`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: `Não foi possível registrar o pagamento: ${readableError(error)}`,
      });
    } finally {
      setPaymentSaving(false);
    }
  }

  async function reload() {
    setLoading(true);
    setFeedback(null);

    try {
      await refresh();
    } catch (error) {
      setFeedback({ type: "error", message: readableError(error) });
    } finally {
      setLoading(false);
    }
  }

  const summaryCards = [
    {
      title: "Total original",
      value: totals.original,
      note: "Valor inicial das dívidas",
      color: "#1d4ed8",
      bg: "#eff6ff",
    },
    {
      title: "Total pago",
      value: totals.paid,
      note: "Pagamentos registrados",
      color: "#15803d",
      bg: "#f0fdf4",
    },
    {
      title: "Saldo em aberto",
      value: totals.open,
      note: "Valor que ainda falta pagar",
      color: "#0f766e",
      bg: "#f0fdfa",
    },
    {
      title: "Valor vencido",
      value: totals.overdue,
      note: "Saldo com vencimento passado",
      color: "#b91c1c",
      bg: "#fef2f2",
    },
  ];

  return (
    <main
      className="container page"
      style={{
        maxWidth: 1200,
        width: "100%",
        boxSizing: "border-box",
        paddingBottom: 40,
      }}
    >
      <AppHeader />

      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 18,
          margin: "28px 0",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 300px" }}>
          <span
            style={{
              color: "#0f766e",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 1.2,
            }}
          >
            RESGATA+ · ORGANIZAÇÃO FINANCEIRA
          </span>

          <h1
            style={{
              margin: "9px 0",
              fontSize: "clamp(28px, 4vw, 38px)",
              lineHeight: 1.2,
              letterSpacing: -1,
            }}
          >
            Minhas dívidas
          </h1>

          <p
            style={{
              margin: 0,
              maxWidth: 650,
              color: "var(--muted, #64748b)",
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            Controle seus compromissos, acompanhe os vencimentos e registre
            pagamentos para manter seu saldo devedor atualizado.
          </p>
        </div>

        <a
          href="#nova-divida"
          className="btn primary"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 44,
            padding: "11px 16px",
            borderRadius: 10,
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          + Nova dívida
        </a>
      </header>

      {feedback && (
        <div
          role={feedback.type === "error" ? "alert" : "status"}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            padding: "13px 15px",
            marginBottom: 20,
            borderRadius: 11,
            border:
              feedback.type === "error"
                ? "1px solid #fecaca"
                : "1px solid #a7f3d0",
            background:
              feedback.type === "error" ? "#fef2f2" : "#ecfdf5",
            color: feedback.type === "error" ? "#991b1b" : "#065f46",
            fontSize: 13,
            lineHeight: 1.65,
            overflowWrap: "anywhere",
          }}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            aria-label="Fechar mensagem"
            onClick={() => setFeedback(null)}
            style={{
              border: 0,
              background: "transparent",
              color: "inherit",
              fontSize: 22,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>
      )}

      <section
        aria-label="Próximo vencimento"
        style={{ ...cardStyle, marginBottom: 22, background: "#f8fafc" }}
      >
        <span
          style={{
            color: "#0369a1",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.8,
          }}
        >
          PRÓXIMO VENCIMENTO EM ABERTO
        </span>

        {nextDebt ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 16,
              marginTop: 10,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h2
                style={{
                  margin: "0 0 5px",
                  fontSize: 19,
                  overflowWrap: "anywhere",
                }}
              >
                {nextDebt.name}
              </h2>
              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                {nextDebt.creditor || "Credor não informado"} · Vencimento:{" "}
                {dateLabel(nextDebt.due_date)}
                {nextDebt.due_date && (
                  <>
                    {" · "}
                    {daysUntil(nextDebt.due_date, today) < 0
                      ? `Vencida há ${Math.abs(daysUntil(nextDebt.due_date, today))} dia(s)`
                      : daysUntil(nextDebt.due_date, today) === 0
                        ? "Vence hoje"
                        : daysUntil(nextDebt.due_date, today) === 1
                          ? "Vence amanhã"
                          : `Vence em ${daysUntil(nextDebt.due_date, today)} dias`}
                  </>
                )}
              </p>
            </div>

            <strong
              style={{
                fontSize: 22,
                color: "#b91c1c",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {money(debtValues(nextDebt).remaining)}
            </strong>
          </div>
        ) : (
          <p style={{ margin: "10px 0 0", color: "#15803d", fontSize: 14 }}>
            Nenhuma dívida com saldo em aberto.
          </p>
        )}
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ margin: "0 0 14px", fontSize: 21 }}>
          Resumo financeiro
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
            gap: 14,
          }}
        >
          {summaryCards.map((card) => (
            <article
              key={card.title}
              style={{
                ...cardStyle,
                background: card.bg,
                borderColor: card.bg,
              }}
            >
              <span
                style={{ color: card.color, fontSize: 13, fontWeight: 750 }}
              >
                {card.title}
              </span>

              <p
                style={{
                  margin: "13px 0 7px",
                  color: card.color,
                  fontSize: "clamp(21px, 2.5vw, 27px)",
                  lineHeight: 1.3,
                  fontWeight: 850,
                  overflowWrap: "anywhere",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {money(card.value)}
              </p>

              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
              >
                {card.note}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="nova-divida"
        style={{
          ...cardStyle,
          marginBottom: 24,
          scrollMarginTop: 20,
        }}
      >
        <h2 style={{ margin: "0 0 7px", fontSize: 21 }}>
          Cadastrar nova dívida
        </h2>
        <p
          style={{
            margin: "0 0 20px",
            color: "var(--muted, #64748b)",
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          O cadastro registra o compromisso. Ele não movimenta automaticamente
          o saldo da carteira.
        </p>

        <form
          onSubmit={addDebt}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))",
            gap: 16,
          }}
        >
          <div>
            <label htmlFor="debt-name" style={labelStyle}>
              Nome da dívida *
            </label>
            <input
              id="debt-name"
              style={inputStyle}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              placeholder="Ex.: Fatura do cartão"
              required
            />
          </div>

          <div>
            <label htmlFor="debt-creditor" style={labelStyle}>
              Credor ou empresa
            </label>
            <input
              id="debt-creditor"
              style={inputStyle}
              value={creditor}
              onChange={(event) => setCreditor(event.target.value)}
              maxLength={120}
              placeholder="Ex.: Banco ou loja"
            />
          </div>

          <div>
            <label htmlFor="debt-amount" style={labelStyle}>
              Valor original (R$) *
            </label>
            <input
              id="debt-amount"
              style={inputStyle}
              type="number"
              min="0.01"
              max="9999999999.99"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0,00"
              required
            />
          </div>

          <div>
            <label htmlFor="debt-date" style={labelStyle}>
              Vencimento *
            </label>
            <input
              id="debt-date"
              style={inputStyle}
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="debt-category" style={labelStyle}>
              Categoria
            </label>
            <select
              id="debt-category"
              style={inputStyle}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {Object.entries(CATEGORIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="debt-priority" style={labelStyle}>
              Prioridade
            </label>
            <select
              id="debt-priority"
              style={inputStyle}
              value={priority}
              onChange={(event) =>
                setPriority(event.target.value as DebtPriority)
              }
            >
              <option value="baixa">Baixa</option>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
            </select>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <button
              className="btn primary"
              type="submit"
              disabled={saving}
              style={{
                width: "100%",
                minHeight: 46,
                borderRadius: 10,
                fontWeight: 800,
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Salvando..." : "Salvar dívida"}
            </button>
          </div>
        </form>
      </section>

      <section
        id="lista-dividas"
        style={{ ...cardStyle, scrollMarginTop: 20 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 6px", fontSize: 21 }}>
              Dívidas cadastradas
            </h2>
            <p
              style={{
                margin: 0,
                color: "var(--muted, #64748b)",
                fontSize: 13,
              }}
            >
              {filteredItems.length}{" "}
              {filteredItems.length === 1 ? "registro" : "registros"}
            </p>
          </div>

          <button
            type="button"
            style={buttonStyle}
            disabled={loading}
            onClick={() => void reload()}
          >
            ↻ Atualizar
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div>
            <label htmlFor="debt-search" style={labelStyle}>
              Pesquisar
            </label>
            <input
              id="debt-search"
              type="search"
              style={inputStyle}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome, credor ou categoria"
            />
          </div>

          <div>
            <label htmlFor="debt-filter" style={labelStyle}>
              Situação
            </label>
            <select
              id="debt-filter"
              style={inputStyle}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="todas">Todas</option>
              <option value="pendente">Em aberto</option>
              <option value="atrasado">Vencidas</option>
              <option value="pago">Pagas</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div role="status" style={{ padding: 35, textAlign: "center" }}>
            Carregando suas dívidas...
          </div>
        ) : filteredItems.length === 0 ? (
          <div
            style={{
              padding: 30,
              textAlign: "center",
              border: "1px dashed var(--border, #dbe2ea)",
              borderRadius: 12,
              background: "var(--surface, #f8fafc)",
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 17 }}>
              {items.length === 0
                ? "Nenhuma dívida cadastrada"
                : "Nenhum resultado encontrado"}
            </h3>
            <p
              style={{
                margin: 0,
                color: "var(--muted, #64748b)",
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              {items.length === 0
                ? "Cadastre sua primeira dívida para começar."
                : "Altere a pesquisa ou os filtros."}
            </p>
            {(search || filter !== "todas") && (
              <button
                type="button"
                style={{ ...buttonStyle, marginTop: 14 }}
                onClick={() => {
                  setSearch("");
                  setFilter("todas");
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              width: "100%",
              overflowX: "auto",
              border: "1px solid var(--border, #e2e8f0)",
              borderRadius: 12,
            }}
          >
            <table
              style={{
                width: "100%",
                minWidth: 850,
                borderCollapse: "collapse",
                fontSize: 12,
                textAlign: "left",
                lineHeight: 1.5,
              }}
            >
              <thead>
                <tr style={{ background: "#f1f5f9", color: "#334155" }}>
                  {[
                    "Dívida / credor",
                    "Categoria",
                    "Valor original",
                    "Pago",
                    "Saldo",
                    "Vencimento",
                    "Situação",
                    "Ações",
                  ].map((title) => (
                    <th
                      key={title}
                      scope="col"
                      style={{
                        padding: "12px 10px",
                        whiteSpace: "nowrap",
                        borderBottom: "1px solid #e2e8f0",
                        fontSize: 11,
                      }}
                    >
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredItems.map((item) => {
                  const values = debtValues(item);
                  const status = debtStatus(item, today);

                  const badge = {
                    pago: { text: "Paga", bg: "#dcfce7", color: "#166534" },
                    atrasado: {
                      text: "Vencida",
                      bg: "#fee2e2",
                      color: "#991b1b",
                    },
                    pendente: {
                      text: "Em aberto",
                      bg: "#dbeafe",
                      color: "#1d4ed8",
                    },
                  }[status];

                  return (
                    <tr
                      key={item.id}
                      style={{ borderBottom: "1px solid #edf1f5" }}
                    >
                      <td style={{ padding: "13px 10px", maxWidth: 230 }}>
                        <strong
                          style={{
                            display: "block",
                            color: "#172033",
                            fontSize: 13,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {item.name}
                        </strong>
                        <span
                          style={{
                            display: "block",
                            marginTop: 4,
                            color: "#64748b",
                            fontSize: 11,
                          }}
                        >
                          {item.creditor || "Credor não informado"}
                        </span>
                      </td>

                      <td style={{ padding: "13px 10px", color: "#475569" }}>
                        {CATEGORIES[item.category ?? "outra"] ??
                          item.category ??
                          "Outra dívida"}
                      </td>

                      <td
                        style={{
                          padding: "13px 10px",
                          whiteSpace: "nowrap",
                          fontWeight: 700,
                        }}
                      >
                        {money(values.original)}
                      </td>

                      <td
                        style={{
                          padding: "13px 10px",
                          whiteSpace: "nowrap",
                          color: "#15803d",
                          fontWeight: 700,
                        }}
                      >
                        {money(values.paid)}
                      </td>

                      <td
                        style={{
                          padding: "13px 10px",
                          whiteSpace: "nowrap",
                          color: values.remaining > 0 ? "#b91c1c" : "#15803d",
                          fontWeight: 800,
                        }}
                      >
                        {money(values.remaining)}
                      </td>

                      <td
                        style={{
                          padding: "13px 10px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {dateLabel(item.due_date)}
                      </td>

                      <td style={{ padding: "13px 10px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "5px 9px",
                            borderRadius: 20,
                            background: badge.bg,
                            color: badge.color,
                            fontSize: 11,
                            fontWeight: 800,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {badge.text}
                        </span>
                      </td>

                      <td style={{ padding: "13px 10px" }}>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 7,
                            minWidth: 150,
                          }}
                        >
                          {values.remaining > 0 && (
                            <button
                              type="button"
                              style={{
                                ...buttonStyle,
                                minHeight: 35,
                                padding: "7px 9px",
                                background: "#ecfdf5",
                                color: "#047857",
                              }}
                              disabled={actionId === item.id}
                              onClick={() => void openPayment(item)}
                            >
                              Registrar pagamento
                            </button>
                          )}

                          <button
                            type="button"
                            style={{
                              ...buttonStyle,
                              minHeight: 35,
                              padding: "7px 9px",
                            }}
                            disabled={actionId === item.id}
                            onClick={() => void openPayment(item)}
                          >
                            Ver histórico
                          </button>

                          <button
                            type="button"
                            style={{
                              ...buttonStyle,
                              minHeight: 35,
                              padding: "7px 9px",
                              color: "#b91c1c",
                            }}
                            disabled={actionId === item.id}
                            onClick={() => void removeDebt(item)}
                          >
                            {actionId === item.id
                              ? "Processando..."
                              : "Excluir dívida"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr
                  style={{
                    background: "#f8fafc",
                    fontWeight: 800,
                    borderTop: "2px solid #e2e8f0",
                  }}
                >
                  <td colSpan={2} style={{ padding: "13px 10px" }}>
                    TOTAL EXIBIDO
                  </td>
                  <td style={{ padding: "13px 10px", whiteSpace: "nowrap" }}>
                    {money(
                      filteredItems.reduce(
                        (sum, item) => sum + debtValues(item).original,
                        0
                      )
                    )}
                  </td>
                  <td
                    style={{
                      padding: "13px 10px",
                      whiteSpace: "nowrap",
                      color: "#15803d",
                    }}
                  >
                    {money(
                      filteredItems.reduce(
                        (sum, item) => sum + debtValues(item).paid,
                        0
                      )
                    )}
                  </td>
                  <td
                    style={{
                      padding: "13px 10px",
                      whiteSpace: "nowrap",
                      color: "#b91c1c",
                    }}
                  >
                    {money(
                      filteredItems.reduce(
                        (sum, item) => sum + debtValues(item).remaining,
                        0
                      )
                    )}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p
          style={{
            margin: "13px 0 0",
            color: "var(--muted, #64748b)",
            fontSize: 12,
            lineHeight: 1.7,
          }}
        >
          O saldo é calculado pelo valor original menos os pagamentos
          registrados. Os totais da tabela respeitam os filtros selecionados.
        </p>
      </section>

      {paymentDebt && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !paymentSaving) {
              setPaymentDebt(null);
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(15, 23, 42, .55)",
            overflowY: "auto",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-dialog-title"
            style={{
              width: "100%",
              maxWidth: 580,
              maxHeight: "90vh",
              overflowY: "auto",
              background: "var(--card, #fff)",
              color: "var(--foreground, #172033)",
              borderRadius: 16,
              padding: 22,
              boxShadow: "0 25px 70px rgba(0,0,0,.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                marginBottom: 18,
              }}
            >
              <div>
                <h2
                  id="payment-dialog-title"
                  style={{ margin: "0 0 6px", fontSize: 21 }}
                >
                  Pagamentos da dívida
                </h2>
                <p
                  style={{
                    margin: 0,
                    color: "var(--muted, #64748b)",
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  {paymentDebt.name}
                </p>
              </div>

              <button
                type="button"
                aria-label="Fechar"
                disabled={paymentSaving}
                onClick={() => setPaymentDebt(null)}
                style={{ ...buttonStyle, minWidth: 40, padding: 8 }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                ...cardStyle,
                background: "#f8fafc",
                marginBottom: 20,
                padding: 15,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <span style={{ color: "#64748b", fontSize: 13 }}>
                  Valor original
                </span>
                <strong>{money(debtValues(paymentDebt).original)}</strong>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 8,
                }}
              >
                <span style={{ color: "#64748b", fontSize: 13 }}>
                  Já pago
                </span>
                <strong style={{ color: "#15803d" }}>
                  {money(debtValues(paymentDebt).paid)}
                </strong>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span style={{ color: "#64748b", fontSize: 13 }}>
                  Saldo restante
                </span>
                <strong style={{ color: "#b91c1c" }}>
                  {money(debtValues(paymentDebt).remaining)}
                </strong>
              </div>
            </div>

            {debtValues(paymentDebt).remaining > 0 && (
              <form
                onSubmit={registerPayment}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
                  gap: 14,
                  marginBottom: 22,
                }}
              >
                <div>
                  <label htmlFor="payment-amount" style={labelStyle}>
                    Valor pago (R$) *
                  </label>
                  <input
                    id="payment-amount"
                    style={inputStyle}
                    type="number"
                    min="0.01"
                    max={debtValues(paymentDebt).remaining.toFixed(2)}
                    step="0.01"
                    inputMode="decimal"
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    placeholder="0,00"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="payment-date" style={labelStyle}>
                    Data do pagamento *
                  </label>
                  <input
                    id="payment-date"
                    style={inputStyle}
                    type="date"
                    max={localDate()}
                    value={paymentDate}
                    onChange={(event) => setPaymentDate(event.target.value)}
                    required
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label htmlFor="payment-notes" style={labelStyle}>
                    Observações (opcional)
                  </label>
                  <textarea
                    id="payment-notes"
                    style={{ ...inputStyle, minHeight: 75, resize: "vertical" }}
                    maxLength={500}
                    value={paymentNotes}
                    onChange={(event) => setPaymentNotes(event.target.value)}
                    placeholder="Ex.: pagamento da primeira parcela"
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <button
                    className="btn primary"
                    type="submit"
                    disabled={paymentSaving}
                    style={{
                      width: "100%",
                      minHeight: 45,
                      borderRadius: 10,
                      fontWeight: 800,
                      cursor: paymentSaving ? "wait" : "pointer",
                    }}
                  >
                    {paymentSaving
                      ? "Registrando pagamento..."
                      : "Confirmar pagamento"}
                  </button>
                </div>
              </form>
            )}

            <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>
              Histórico de pagamentos
            </h3>

            {historyLoading ? (
              <p style={{ color: "#64748b", fontSize: 13 }}>
                Carregando histórico...
              </p>
            ) : paymentHistory.length === 0 ? (
              <p
                style={{
                  color: "#64748b",
                  fontSize: 13,
                  lineHeight: 1.6,
                  padding: 15,
                  border: "1px dashed #cbd5e1",
                  borderRadius: 10,
                }}
              >
                Ainda não há pagamentos registrados para esta dívida.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 9 }}>
                {paymentHistory.map((payment) => (
                  <article
                    key={payment.id}
                    style={{
                      padding: 13,
                      border: "1px solid var(--border, #e2e8f0)",
                      borderRadius: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      <strong style={{ color: "#15803d" }}>
                        {money(toNumber(payment.amount))}
                      </strong>
                      <span style={{ color: "#64748b", fontSize: 12 }}>
                        {dateLabel(payment.payment_date)}
                      </span>
                    </div>
                    {payment.notes && (
                      <p
                        style={{
                          margin: "7px 0 0",
                          fontSize: 12,
                          color: "#64748b",
                          lineHeight: 1.6,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {payment.notes}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}

            <p
              style={{
                margin: "16px 0 0",
                color: "#64748b",
                fontSize: 11,
                lineHeight: 1.6,
              }}
            >
              Este registro atualiza o saldo da dívida. Ele não movimenta
              automaticamente uma conta bancária ou carteira; essa integração
              deve ser feita com a tabela de transações real do projeto.
            </p>
          </section>
        </div>
      )}

      <footer
        style={{
          marginTop: 26,
          textAlign: "center",
          color: "var(--muted, #64748b)",
          fontSize: 12,
          lineHeight: 1.8,
        }}
      >
        Resgata+ · Controle de dívidas e pagamentos.
      </footer>
    </main>
  );
  }
