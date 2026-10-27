"use client";

import AppHeader from "@/components/AppHeader";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type AccountType =
  | "conta"
  | "cartao"
  | "assinatura"
  | "despesa"
  | "receita"
  | "outro";

type AccountStatus = "pendente" | "pago" | "cancelado";

type ControlAccount = {
  id: string;
  user_id: string;
  name: string;
  account_type: AccountType;
  amount: number;
  due_date: string | null;
  status: AccountStatus;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
};

type FilterStatus =
  | "todas"
  | "pendente"
  | "vencida"
  | "hoje"
  | "pago"
  | "cancelado"
  | "receita"
  | "despesa";

const typeLabels: Record<AccountType, string> = {
  conta: "Conta de consumo",
  cartao: "Cartão",
  assinatura: "Assinatura",
  despesa: "Despesa",
  receita: "Receita",
  outro: "Outro",
};

const statusLabels: Record<AccountStatus, string> = {
  pendente: "Em aberto",
  pago: "Paga",
  cancelado: "Cancelada",
};

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(value) ? value : 0);

function today() {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function dateLabel(value: string | null) {
  if (!value) return "Sem vencimento";

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) return "Data inválida";

  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}

/**
 * Aceita formatos como:
 * 1250
 * 1250,50
 * 1.250,50
 * 1250.50
 *
 * Sem vírgula, um ponto seguido de três algarismos
 * é interpretado como separador de milhar.
 */
function parseBrazilianAmount(value: string): number {
  const normalized = value.trim().replace(/\s/g, "");

  if (!normalized) return Number.NaN;

  let parsed = normalized;

  if (normalized.includes(",")) {
    parsed = normalized.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) {
    parsed = normalized.replace(/\./g, "");
  }

  return Number(parsed);
}

function errorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") return fallback;

  const candidate = error as {
    message?: string;
    code?: string;
  };

  if (candidate.code === "42501") {
    return "Operação não autorizada. Confira as permissões da sua conta.";
  }

  if (candidate.code === "23503") {
    return "Não foi possível concluir a operação porque existem registros relacionados.";
  }

  if (candidate.code === "23505") {
    return "Este registro já existe.";
  }

  if (
    candidate.message?.toLowerCase().includes("failed to fetch") ||
    candidate.message?.toLowerCase().includes("network")
  ) {
    return "Falha de conexão. Confira sua internet e tente novamente.";
  }

  return candidate.message || fallback;
}

export default function ControleContasPage() {
  const router = useRouter();

  const [items, setItems] = useState<ControlAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const [feedback, setFeedback] = useState("");
  const [feedbackType, setFeedbackType] = useState<"success" | "error">("success");

  const [filter, setFilter] = useState<FilterStatus>("todas");
  const [search, setSearch] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("conta");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const currentDate = today();

  function notify(message: string, kind: "success" | "error" = "success") {
    setFeedback(message);
    setFeedbackType(kind);
  }

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
      .from("control_accounts")
      .select(
        "id,user_id,name,account_type,amount,due_date,status,paid_at,notes,created_at"
      )
      .eq("user_id", auth.user.id)
      .order("due_date", {
        ascending: true,
        nullsFirst: false,
      })
      .order("created_at", {
        ascending: false,
      });

    if (error) throw error;

    setItems((data ?? []) as ControlAccount[]);
  }, [router]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        await refresh();
      } catch (error) {
        if (active) {
          notify(
            errorMessage(error, "Não foi possível carregar suas contas."),
            "error"
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
  }, [refresh]);

  // Atualiza a lista quando o usuário volta para a página.
  useEffect(() => {
    let active = true;

    const reload = () => {
      if (!active || document.visibilityState === "hidden") return;

      void refresh().catch((error) => {
        if (active) {
          notify(
            errorMessage(error, "Não foi possível atualizar as contas."),
            "error"
          );
        }
      });
    };

    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reload);

    return () => {
      active = false;
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [refresh]);

  const visibleItems = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");

    return items.filter((item) => {
      const overdue =
        item.status === "pendente" &&
        !!item.due_date &&
        item.due_date < currentDate;

      const dueToday =
        item.status === "pendente" &&
        item.due_date === currentDate;

      let matchesFilter = true;

      switch (filter) {
        case "pendente":
          matchesFilter = item.status === "pendente";
          break;
        case "vencida":
          matchesFilter = overdue;
          break;
        case "hoje":
          matchesFilter = dueToday;
          break;
        case "pago":
          matchesFilter = item.status === "pago";
          break;
        case "cancelado":
          matchesFilter = item.status === "cancelado";
          break;
        case "receita":
          matchesFilter = item.account_type === "receita";
          break;
        case "despesa":
          matchesFilter = item.account_type !== "receita";
          break;
        default:
          matchesFilter = true;
      }

      if (!matchesFilter) return false;

      if (!normalizedSearch) return true;

      return (
        item.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
        typeLabels[item.account_type]
          .toLocaleLowerCase("pt-BR")
          .includes(normalizedSearch) ||
        (item.notes ?? "")
          .toLocaleLowerCase("pt-BR")
          .includes(normalizedSearch)
      );
    });
  }, [items, filter, search, currentDate]);

  const summary = useMemo(() => {
    const activeItems = items.filter(
      (item) => item.status !== "cancelado"
    );

    const expenses = activeItems.filter(
      (item) => item.account_type !== "receita"
    );

    const revenues = activeItems.filter(
      (item) => item.account_type === "receita"
    );

    const openExpenses = expenses.filter(
      (item) => item.status === "pendente"
    );

    const overdueExpenses = openExpenses.filter(
      (item) => !!item.due_date && item.due_date < currentDate
    );

    const paidExpenses = expenses.filter(
      (item) => item.status === "pago"
    );

    const total = (list: ControlAccount[]) =>
      list.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const revenueTotal = total(revenues);
    const expenseTotal = total(expenses);

    return {
      revenueTotal,
      expenseTotal,
      openExpenseTotal: total(openExpenses),
      overdueExpenseTotal: total(overdueExpenses),
      paidExpenseTotal: total(paidExpenses),
      overdueCount: overdueExpenses.length,
      projectedBalance: revenueTotal - expenseTotal,
      openCount: openExpenses.length,
    };
  }, [items, currentDate]);

  const upcomingItems = useMemo(() => {
    return items
      .filter(
        (item) =>
          item.status === "pendente" &&
          item.account_type !== "receita" &&
          !!item.due_date &&
          item.due_date >= currentDate
      )
      .sort((a, b) =>
        (a.due_date ?? "").localeCompare(b.due_date ?? "")
      )
      .slice(0, 3);
  }, [items, currentDate]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setType("conta");
    setAmount("");
    setDueDate("");
    setNotes("");
  }

  function startEditing(item: ControlAccount) {
    if (item.status === "cancelado") {
      notify("Não é possível editar um registro cancelado.", "error");
      return;
    }

    setEditingId(item.id);
    setName(item.name);
    setType(item.account_type);
    setAmount(
      Number(item.amount).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
    setDueDate(item.due_date ?? "");
    setNotes(item.notes ?? "");
    setFeedback("");

    document
      .getElementById("nova-conta")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");

    const trimmedName = name.trim();
    const numericAmount = parseBrazilianAmount(amount);

    if (!trimmedName) {
      notify("Informe a descrição da conta.", "error");
      return;
    }

    if (trimmedName.length > 120) {
      notify("A descrição deve ter no máximo 120 caracteres.", "error");
      return;
    }

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      notify("Informe um valor válido maior que zero.", "error");
      return;
    }

    if (numericAmount > 999999999) {
      notify("O valor informado ultrapassa o limite permitido.", "error");
      return;
    }

    if (notes.trim().length > 1000) {
      notify("As observações devem ter no máximo 1.000 caracteres.", "error");
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

      const payload = {
        name: trimmedName,
        account_type: type,
        amount: numericAmount,
        due_date: dueDate || null,
        notes: notes.trim() || null,
      };

      if (editingId) {
        const { data, error } = await supabase
          .from("control_accounts")
          .update({
            ...payload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId)
          .eq("user_id", auth.user.id)
          .neq("status", "cancelado")
          .select("id");

        if (error) throw error;

        if (!data?.length) {
          throw new Error(
            "A conta não foi atualizada. Ela pode ter sido removida ou cancelada."
          );
        }

        resetForm();
        await refresh();
        notify("Alterações salvas com sucesso.");
      } else {
        const { error } = await supabase
          .from("control_accounts")
          .insert({
            ...payload,
            user_id: auth.user.id,
            status: "pendente",
            paid_at: null,
          });

        if (error) throw error;

        resetForm();
        await refresh();
        notify("Conta cadastrada com sucesso.");
      }
    } catch (error) {
      notify(
        errorMessage(error, "Não foi possível salvar a conta."),
        "error"
      );
    } finally {
      setSaving(false);
    }
  }

  async function togglePaid(item: ControlAccount) {
    if (item.status === "cancelado") return;

    const nextStatus: AccountStatus =
      item.status === "pago" ? "pendente" : "pago";

    const confirmation =
      nextStatus === "pago"
        ? `Confirmar que "${item.name}" foi paga?`
        : `Reabrir "${item.name}" e remover a data de pagamento registrada?`;

    if (!window.confirm(confirmation)) return;

    setActionId(item.id);
    setFeedback("");

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
        .from("control_accounts")
        .update({
          status: nextStatus,
          paid_at: nextStatus === "pago" ? today() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("user_id", auth.user.id)
        .neq("status", "cancelado")
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error(
          "A situação não foi alterada. Atualize a página e tente novamente."
        );
      }

      await refresh();

      notify(
        nextStatus === "pago"
          ? "Pagamento registrado no controle de contas."
          : "Conta reaberta. A data de pagamento foi removida."
      );
    } catch (error) {
      notify(
        errorMessage(error, "Não foi possível atualizar a situação."),
        "error"
      );
    } finally {
      setActionId(null);
    }
  }

  async function cancelAccount(item: ControlAccount) {
    if (item.status === "cancelado") return;

    const confirmed = window.confirm(
      `Cancelar "${item.name}"?\n\nO registro será mantido no histórico, mas deixará de compor os totais financeiros.`
    );

    if (!confirmed) return;

    setActionId(item.id);
    setFeedback("");

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
        .from("control_accounts")
        .update({
          status: "cancelado",
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("user_id", auth.user.id)
        .neq("status", "cancelado")
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error(
          "Não foi possível cancelar a conta. Atualize a página e tente novamente."
        );
      }

      if (editingId === item.id) resetForm();

      await refresh();
      notify("Registro cancelado e mantido no histórico.");
    } catch (error) {
      notify(
        errorMessage(error, "Não foi possível cancelar a conta."),
        "error"
      );
    } finally {
      setActionId(null);
    }
  }

  async function deleteAccount(item: ControlAccount) {
    const confirmed = window.confirm(
      `Excluir definitivamente "${item.name}"?\n\nEssa ação não pode ser desfeita. Se quiser apenas removê-la dos totais, use Cancelar.`
    );

    if (!confirmed) return;

    setActionId(item.id);
    setFeedback("");

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
        .from("control_accounts")
        .delete()
        .eq("id", item.id)
        .eq("user_id", auth.user.id)
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        throw new Error(
          "A conta não foi excluída. Confira se ela ainda existe."
        );
      }

      if (editingId === item.id) resetForm();

      await refresh();
      notify("Conta excluída.");
    } catch (error) {
      notify(
        errorMessage(error, "Não foi possível excluir a conta."),
        "error"
      );
    } finally {
      setActionId(null);
    }
  }

  const cardStyle = {
    background: "var(--card, #ffffff)",
    border: "1px solid var(--border, #e2e8f0)",
    borderRadius: 18,
    padding: 20,
    minWidth: 0,
    boxShadow: "0 5px 20px rgba(15, 23, 42, 0.035)",
  } as const;

  const fieldStyle = {
    width: "100%",
    boxSizing: "border-box" as const,
    border: "1px solid var(--border, #dbe3ec)",
    borderRadius: 11,
    padding: "12px 13px",
    minHeight: 44,
    background: "var(--input, #ffffff)",
    color: "var(--foreground, #172033)",
    fontSize: 14,
    outlineOffset: 2,
  };

  const buttonStyle = {
    border: 0,
    borderRadius: 11,
    minHeight: 42,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  } as const;

  const summaryCards = [
    {
      title: "Receitas cadastradas",
      value: money(summary.revenueTotal),
      detail: "Receitas não canceladas",
      color: "#1d4ed8",
      background: "#eff6ff",
      icon: "↗",
    },
    {
      title: "Despesas em aberto",
      value: money(summary.openExpenseTotal),
      detail: `${summary.openCount} compromisso(s) pendente(s)`,
      color: "#0f766e",
      background: "#f0fdfa",
      icon: "▤",
    },
    {
      title: "Despesas em atraso",
      value: money(summary.overdueExpenseTotal),
      detail:
        summary.overdueCount === 1
          ? "1 despesa vencida"
          : `${summary.overdueCount} despesas vencidas`,
      color: "#b91c1c",
      background: "#fef2f2",
      icon: "!",
    },
    {
      title: "Despesas já pagas",
      value: money(summary.paidExpenseTotal),
      detail: "Despesas marcadas como pagas",
      color: "#15803d",
      background: "#f0fdf4",
      icon: "✓",
    },
    {
      title: "Saldo previsto",
      value: money(summary.projectedBalance),
      detail: "Receitas cadastradas menos despesas cadastradas",
      color: summary.projectedBalance >= 0 ? "#047857" : "#b91c1c",
      background:
        summary.projectedBalance >= 0 ? "#ecfdf5" : "#fef2f2",
      icon: "∑",
    },
  ];

  return (
    <main
      className="container page"
      style={{
        maxWidth: 1280,
        paddingBottom: 40,
      }}
    >
      <AppHeader />

      {/* Cabeçalho */}
      <header
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
          gap: 20,
          margin: "28px 0",
          alignItems: "stretch",
        }}
      >
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "clamp(22px, 4vw, 36px)",
            borderRadius: 24,
            color: "#ffffff",
            background:
              "linear-gradient(135deg, #0f766e 0%, #115e59 58%, #134e4a 100%)",
            boxShadow: "0 14px 32px rgba(15, 118, 110, 0.16)",
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: 1.6,
              color: "#99f6e4",
            }}
          >
            RESGATA+ · ORGANIZAÇÃO FINANCEIRA
          </span>

          <h1
            style={{
              margin: "13px 0 12px",
              maxWidth: 540,
              fontSize: "clamp(28px, 4vw, 42px)",
              lineHeight: 1.1,
              letterSpacing: "-0.04em",
            }}
          >
            Controle suas contas com mais clareza.
          </h1>

          <p
            style={{
              maxWidth: 560,
              margin: "0 0 20px",
              color: "#e0f2f1",
              fontSize: 14,
              lineHeight: 1.8,
            }}
          >
            Organize vencimentos, acompanhe despesas, registre pagamentos e
            visualize as receitas e os compromissos cadastrados em um só lugar.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={() =>
                document
                  .getElementById("nova-conta")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              style={{
                ...buttonStyle,
                background: "#ffffff",
                color: "#115e59",
                padding: "12px 17px",
              }}
            >
              + Cadastrar conta
            </button>

            <span
              style={{
                color: "#ccfbf1",
                fontSize: 12,
              }}
            >
              {items.length} registro(s) no controle
            </span>
          </div>
        </section>

        {/* Próximos vencimentos */}
        <section
          aria-label="Próximos vencimentos"
          style={{
            ...cardStyle,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div>
            <span
              style={{
                color: "#0f766e",
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: 1.3,
              }}
            >
              FIQUE ATENTO
            </span>

            <h2 style={{ margin: "5px 0", fontSize: 19 }}>
              Próximos vencimentos
            </h2>

            <p
              style={{
                margin: 0,
                color: "var(--muted, #64748b)",
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              Contas em aberto com vencimento a partir de hoje.
            </p>
          </div>

          {upcomingItems.length === 0 ? (
            <div
              style={{
                padding: "24px 12px",
                textAlign: "center",
                border: "1px dashed var(--border, #cbd5e1)",
                borderRadius: 14,
                color: "var(--muted, #64748b)",
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              <div style={{ fontSize: 25, marginBottom: 6 }}>✓</div>
              <strong style={{ color: "var(--foreground, #172033)" }}>
                Nenhum vencimento próximo
              </strong>
              <div>Contas futuras aparecerão aqui.</div>
            </div>
          ) : (
            upcomingItems.map((item) => (
              <article
                key={item.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  alignItems: "center",
                  gap: 12,
                  padding: 13,
                  border: "1px solid var(--border, #e2e8f0)",
                  borderRadius: 14,
                  background: "var(--background, #f8fafc)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <strong
                    style={{
                      display: "block",
                      fontSize: 13,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {item.name}
                  </strong>
                  <span
                    style={{
                      display: "block",
                      marginTop: 5,
                      color: "var(--muted, #64748b)",
                      fontSize: 12,
                    }}
                  >
                    Vence em {dateLabel(item.due_date)}
                  </span>
                </div>

                <strong
                  style={{
                    color: "#0f766e",
                    fontSize: 13,
                    textAlign: "right",
                    overflowWrap: "anywhere",
                  }}
                >
                  {money(Number(item.amount))}
                </strong>
              </article>
            ))
          )}
        </section>
      </header>

      {/* Mensagens */}
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginBottom: 20,
            padding: "14px 16px",
            border: `1px solid ${
              feedbackType === "error" ? "#fecaca" : "#99f6e4"
            }`,
            borderRadius: 13,
            background:
              feedbackType === "error" ? "#fef2f2" : "#f0fdfa",
            color: feedbackType === "error" ? "#991b1b" : "#115e59",
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          <span>{feedback}</span>

          <button
            type="button"
            onClick={() => setFeedback("")}
            aria-label="Fechar mensagem"
            style={{
              float: "right",
              border: 0,
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Indicadores */}
      <section aria-label="Resumo financeiro" style={{ marginBottom: 26 }}>
        <div style={{ marginBottom: 14 }}>
          <span
            style={{
              color: "#0f766e",
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: 1.4,
            }}
          >
            VISÃO GERAL
          </span>

          <h2
            style={{
              margin: "5px 0",
              fontSize: 22,
              letterSpacing: "-0.025em",
            }}
          >
            Resumo financeiro
          </h2>

          <p
            style={{
              margin: 0,
              color: "var(--muted, #64748b)",
              fontSize: 13,
              lineHeight: 1.7,
            }}
          >
            Os valores são calculados a partir dos registros cadastrados.
            Receitas e despesas são apresentadas separadamente.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 205px), 1fr))",
            gap: 13,
          }}
        >
          {summaryCards.map((card) => (
            <article
              key={card.title}
              style={{
                minWidth: 0,
                padding: 17,
                border: "1px solid var(--border, #e2e8f0)",
                borderTop: `4px solid ${card.color}`,
                borderRadius: 16,
                background: "var(--card, #ffffff)",
                boxShadow: "0 5px 18px rgba(15, 23, 42, 0.035)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    width: 34,
                    height: 34,
                    borderRadius: 11,
                    background: card.background,
                    color: card.color,
                    fontSize: 18,
                    fontWeight: 900,
                  }}
                >
                  {card.icon}
                </span>

                <span
                  style={{
                    color: "var(--muted, #64748b)",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {card.title}
                </span>
              </div>

              <div
                style={{
                  marginTop: 15,
                  color: "var(--foreground, #172033)",
                  fontSize: "clamp(21px, 3vw, 27px)",
                  fontWeight: 900,
                  letterSpacing: "-0.04em",
                  overflowWrap: "anywhere",
                }}
              >
                {card.value}
              </div>

              <p
                style={{
                  margin: "7px 0 0",
                  color: "var(--muted, #64748b)",
                  fontSize: 11,
                  lineHeight: 1.6,
                }}
              >
                {card.detail}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Cadastro e edição */}
      <section
        id="nova-conta"
        style={{
          ...cardStyle,
          marginBottom: 22,
          padding: "clamp(16px, 3vw, 25px)",
          scrollMarginTop: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div
            aria-hidden="true"
            style={{
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              width: 42,
              height: 42,
              borderRadius: 13,
              background: "#ccfbf1",
              color: "#0f766e",
              fontSize: 22,
              fontWeight: 900,
            }}
          >
            {editingId ? "✎" : "+"}
          </div>

          <div>
            <span
              style={{
                color: "#0f766e",
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: 1.2,
              }}
            >
              {editingId ? "ATUALIZE OS DADOS" : "NOVO REGISTRO"}
            </span>

            <h2 style={{ margin: "4px 0", fontSize: 21 }}>
              {editingId ? "Editar conta" : "Cadastrar conta ou movimentação"}
            </h2>

            <p
              style={{
                margin: 0,
                color: "var(--muted, #64748b)",
                fontSize: 12,
                lineHeight: 1.7,
              }}
            >
              Registre contas, cartões, assinaturas, despesas e receitas.
              Para controlar dívidas negociadas, utilize a área específica de
              dívidas.
            </p>
          </div>
        </div>

        <form
          onSubmit={saveAccount}
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 215px), 1fr))",
            gap: "17px 14px",
          }}
        >
          <label
            style={{
              display: "grid",
              alignContent: "start",
              gap: 7,
              minWidth: 0,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Descrição *
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Conta de energia"
              maxLength={120}
              autoComplete="off"
              required
              style={fieldStyle}
            />
            <span
              style={{
                color: "var(--muted, #64748b)",
                fontSize: 11,
                fontWeight: 400,
              }}
            >
              Use um nome fácil de reconhecer.
            </span>
          </label>

          <label
            style={{
              display: "grid",
              alignContent: "start",
              gap: 7,
              minWidth: 0,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Categoria *
            <select
              value={type}
              onChange={(event) =>
                setType(event.target.value as AccountType)
              }
              required
              style={fieldStyle}
            >
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span
              style={{
                color: "var(--muted, #64748b)",
                fontSize: 11,
                fontWeight: 400,
              }}
            >
              Selecione receita ou tipo de despesa.
            </span>
          </label>

          <label
            style={{
              display: "grid",
              alignContent: "start",
              gap: 7,
              minWidth: 0,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Valor (R$) *
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="Ex.: 1.250,50"
              required
              style={fieldStyle}
            />
            <span
              style={{
                color: "var(--muted, #64748b)",
                fontSize: 11,
                fontWeight: 400,
              }}
            >
              Informe o valor total do registro.
            </span>
          </label>

          <label
            style={{
              display: "grid",
              alignContent: "start",
              gap: 7,
              minWidth: 0,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Vencimento
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              style={fieldStyle}
            />
            <span
              style={{
                color: "var(--muted, #64748b)",
                fontSize: 11,
                fontWeight: 400,
              }}
            >
              Opcional.
            </span>
          </label>

          <label
            style={{
              display: "grid",
              gap: 7,
              gridColumn: "1 / -1",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Observações
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Detalhes, referência, parcela ou outras informações..."
              maxLength={1000}
              rows={3}
              style={{
                ...fieldStyle,
                minHeight: 90,
                resize: "vertical",
                lineHeight: 1.6,
              }}
            />
            <span
              style={{
                color: "var(--muted, #64748b)",
                fontSize: 11,
                fontWeight: 400,
              }}
            >
              {notes.length}/1000 caracteres.
            </span>
          </label>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              gridColumn: "1 / -1",
              paddingTop: 17,
              borderTop: "1px solid var(--border, #e2e8f0)",
            }}
          >
            <p
              style={{
                flex: "1 1 230px",
                margin: 0,
                color: "var(--muted, #64748b)",
                fontSize: 11,
                lineHeight: 1.7,
              }}
            >
              * Campos obrigatórios. Os registros são salvos no controle de
              contas do usuário autenticado.
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 9,
                width: "100%",
                maxWidth: 400,
                justifyContent: "flex-end",
              }}
            >
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  style={{
                    ...buttonStyle,
                    flex: "1 1 120px",
                    border: "1px solid var(--border, #cbd5e1)",
                    background: "var(--card, #ffffff)",
                    color: "var(--foreground, #334155)",
                  }}
                >
                  Descartar
                </button>
              )}

              <button
                type="submit"
                disabled={saving}
                style={{
                  ...buttonStyle,
                  flex: "1 1 180px",
                  background: saving ? "#94a3b8" : "#0f766e",
                  color: "#ffffff",
                  cursor: saving ? "wait" : "pointer",
                }}
              >
                {saving
                  ? "Salvando..."
                  : editingId
                    ? "Salvar alterações"
                    : "+ Adicionar registro"}
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* Lista */}
      <section style={{ ...cardStyle, padding: "clamp(14px, 3vw, 23px)" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div>
            <span
              style={{
                color: "#0f766e",
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: 1.2,
              }}
            >
              GESTÃO DE REGISTROS
            </span>

            <h2
              style={{
                margin: "5px 0",
                fontSize: 22,
                letterSpacing: "-0.025em",
              }}
            >
              Contas e movimentações
            </h2>

            <p
              style={{
                margin: 0,
                color: "var(--muted, #64748b)",
                fontSize: 12,
                lineHeight: 1.7,
              }}
            >
              Pesquise, edite, registre pagamentos ou cancele compromissos.
            </p>
          </div>

          <span
            style={{
              border: "1px solid var(--border, #e2e8f0)",
              borderRadius: 999,
              padding: "7px 11px",
              background: "var(--background, #f8fafc)",
              color: "var(--muted, #475569)",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {visibleItems.length} resultado(s)
          </span>
        </div>

        {/* Pesquisa e filtros */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(min(100%, 230px), 1fr))",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <label
            style={{
              display: "grid",
              gap: 6,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Pesquisar
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por descrição, categoria ou observação..."
              style={fieldStyle}
            />
          </label>

          <label
            style={{
              display: "grid",
              gap: 6,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Filtrar registros
            <select
              aria-label="Filtrar registros"
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as FilterStatus)
              }
              style={fieldStyle}
            >
              <option value="todas">Todas as movimentações</option>
              <option value="pendente">Em aberto</option>
              <option value="vencida">Vencidas</option>
              <option value="hoje">Vencem hoje</option>
              <option value="pago">Pagas</option>
              <option value="cancelado">Canceladas</option>
              <option value="receita">Somente receitas</option>
              <option value="despesa">Despesas e contas</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div
            role="status"
            style={{
              padding: 36,
              textAlign: "center",
              color: "var(--muted, #64748b)",
              fontSize: 14,
            }}
          >
            Carregando seus registros...
          </div>
        ) : visibleItems.length === 0 ? (
          <div
            style={{
              padding: "42px 16px",
              textAlign: "center",
              border: "1px dashed var(--border, #cbd5e1)",
              borderRadius: 16,
              color: "var(--muted, #64748b)",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 10 }}>▤</div>

            <strong
              style={{
                color: "var(--foreground, #172033)",
                fontSize: 15,
              }}
            >
              Nenhum registro encontrado
            </strong>

            <p
              style={{
                margin: "7px 0 0",
                fontSize: 13,
                lineHeight: 1.7,
              }}
            >
              Cadastre uma conta ou altere a pesquisa e os filtros.
            </p>

            {(search || filter !== "todas") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setFilter("todas");
                }}
                style={{
                  ...buttonStyle,
                  marginTop: 14,
                  background: "#0f766e",
                  color: "#ffffff",
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
              maxWidth: "100%",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              border: "1px solid var(--border, #e2e8f0)",
              borderRadius: 14,
            }}
          >
            <table
              style={{
                width: "100%",
                minWidth: 900,
                borderCollapse: "separate",
                borderSpacing: 0,
                fontSize: 13,
                color: "var(--foreground, #172033)",
              }}
            >
              <thead>
                <tr
                  style={{
                    textAlign: "left",
                    background: "var(--surface, #f1f5f9)",
                  }}
                >
                  {[
                    "Descrição",
                    "Categoria",
                    "Vencimento",
                    "Valor",
                    "Situação",
                    "Ações",
                  ].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      style={{
                        padding: "14px 12px",
                        borderBottom: "1px solid var(--border, #e2e8f0)",
                        color: "var(--muted, #475569)",
                        fontSize: 10,
                        fontWeight: 900,
                        letterSpacing: ".06em",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {visibleItems.map((item) => {
                  const overdue =
                    item.status === "pendente" &&
                    !!item.due_date &&
                    item.due_date < currentDate;

                  const dueToday =
                    item.status === "pendente" &&
                    item.due_date === currentDate;

                  const statusText = overdue
                    ? "Vencida"
                    : dueToday
                      ? "Vence hoje"
                      : statusLabels[item.status];

                  const statusColor =
                    item.status === "pago"
                      ? "#047857"
                      : item.status === "cancelado"
                        ? "#64748b"
                        : overdue
                          ? "#b91c1c"
                          : dueToday
                            ? "#c2410c"
                            : "#1d4ed8";

                  const statusBackground =
                    item.status === "pago"
                      ? "#d1fae5"
                      : item.status === "cancelado"
                        ? "#e2e8f0"
                        : overdue
                          ? "#fee2e2"
                          : dueToday
                            ? "#ffedd5"
                            : "#dbeafe";

                  const busy = actionId === item.id;

                  return (
                    <tr
                      key={item.id}
                      style={{
                        background: "var(--background, #ffffff)",
                      }}
                    >
                      <td
                        style={{
                          padding: "15px 12px",
                          borderBottom: "1px solid var(--border, #e2e8f0)",
                          verticalAlign: "middle",
                          maxWidth: 280,
                        }}
                      >
                        <strong
                          style={{
                            display: "block",
                            fontSize: 13,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {item.name}
                        </strong>

                        {item.notes && (
                          <p
                            style={{
                              margin: "5px 0 0",
                              color: "var(--muted, #64748b)",
                              fontSize: 11,
                              lineHeight: 1.6,
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {item.notes}
                          </p>
                        )}

                        {item.paid_at && item.status === "pago" && (
                          <span
                            style={{
                              display: "block",
                              marginTop: 5,
                              color: "#047857",
                              fontSize: 11,
                            }}
                          >
                            Pagamento registrado em {dateLabel(item.paid_at)}
                          </span>
                        )}
                      </td>

                      <td
                        style={{
                          padding: "15px 12px",
                          borderBottom: "1px solid var(--border, #e2e8f0)",
                          whiteSpace: "nowrap",
                          verticalAlign: "middle",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            padding: "5px 8px",
                            borderRadius: 8,
                            background: "var(--surface, #f1f5f9)",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {typeLabels[item.account_type]}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: "15px 12px",
                          borderBottom: "1px solid var(--border, #e2e8f0)",
                          whiteSpace: "nowrap",
                          verticalAlign: "middle",
                        }}
                      >
                        {dateLabel(item.due_date)}
                      </td>

                      <td
                        style={{
                          padding: "15px 12px",
                          borderBottom: "1px solid var(--border, #e2e8f0)",
                          whiteSpace: "nowrap",
                          verticalAlign: "middle",
                          fontWeight: 800,
                        }}
                      >
                        <span
                          style={{
                            color:
                              item.account_type === "receita"
                                ? "#047857"
                                : "var(--foreground, #172033)",
                          }}
                        >
                          {item.account_type === "receita" ? "+ " : ""}
                          {money(Number(item.amount))}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: "15px 12px",
                          borderBottom: "1px solid var(--border, #e2e8f0)",
                          verticalAlign: "middle",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            padding: "6px 9px",
                            borderRadius: 999,
                            color: statusColor,
                            background: statusBackground,
                            fontSize: 11,
                            fontWeight: 900,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {statusText}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: "12px",
                          borderBottom: "1px solid var(--border, #e2e8f0)",
                          verticalAlign: "middle",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 6,
                            minWidth: 180,
                          }}
                        >
                          {item.status !== "cancelado" && (
                            <>
                              <button
                                type="button"
                                disabled={busy || saving}
                                onClick={() => startEditing(item)}
                                style={{
                                  ...buttonStyle,
                                  minHeight: 34,
                                  padding: "7px 9px",
                                  background: "#eff6ff",
                                  color: "#1d4ed8",
                                  fontSize: 11,
                                }}
                              >
                                Editar
                              </button>

                              <button
                                type="button"
                                disabled={busy || saving}
                                onClick={() => void togglePaid(item)}
                                style={{
                                  ...buttonStyle,
                                  minHeight: 34,
                                  padding: "7px 9px",
                                  background:
                                    item.status === "pago"
                                      ? "#f1f5f9"
                                      : "#d1fae5",
                                  color:
                                    item.status === "pago"
                                      ? "#475569"
                                      : "#047857",
                                  fontSize: 11,
                                }}
                              >
                                {busy
                                  ? "Aguarde..."
                                  : item.status === "pago"
                                    ? "Reabrir"
                                    : "Marcar paga"}
                              </button>

                              <button
                                type="button"
                                disabled={busy || saving}
                                onClick={() => void cancelAccount(item)}
                                style={{
                                  ...buttonStyle,
                                  minHeight: 34,
                                  padding: "7px 9px",
                                  background: "#fff7ed",
                                  color: "#9a3412",
                                  fontSize: 11,
                                }}
                              >
                                Cancelar
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            disabled={busy || saving}
                            onClick={() => void deleteAccount(item)}
                            style={{
                              ...buttonStyle,
                              minHeight: 34,
                              padding: "7px 9px",
                              background: "#fef2f2",
                              color: "#b91c1c",
                              fontSize: 11,
                            }}
                          >
                            Excluir
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
                    background: "var(--surface, #f1f5f9)",
                    fontWeight: 900,
                  }}
                >
                  <td
                    colSpan={3}
                    style={{
                      padding: "14px 12px",
                      borderTop: "2px solid var(--border, #cbd5e1)",
                    }}
                  >
                    TOTAL — {visibleItems.length} registro(s)
                  </td>

                  <td
                    style={{
                      padding: "14px 12px",
                      borderTop: "2px solid var(--border, #cbd5e1)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {money(
                      visibleItems
                        .filter((item) => item.status !== "cancelado")
                        .reduce(
                          (sum, item) => sum + Number(item.amount || 0),
                          0
                        )
                    )}
                  </td>

                  <td
                    colSpan={2}
                    style={{
                      padding: "14px 12px",
                      borderTop: "2px solid var(--border, #cbd5e1)",
                      lineHeight: 1.8,
                    }}
                  >
                    <div style={{ color: "#047857" }}>
                      Receitas:{" "}
                      {money(
                        visibleItems
                          .filter(
                            (item) =>
                              item.account_type === "receita" &&
                              item.status !== "cancelado"
                          )
                          .reduce(
                            (sum, item) => sum + Number(item.amount || 0),
                            0
                          )
                      )}
                    </div>

                    <div style={{ color: "#b91c1c" }}>
                      Despesas em aberto:{" "}
                      {money(
                        visibleItems
                          .filter(
                            (item) =>
                              item.account_type !== "receita" &&
                              item.status === "pendente"
                          )
                          .reduce(
                            (sum, item) => sum + Number(item.amount || 0),
                            0
                          )
                      )}
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p
          style={{
            margin: "13px 0 0",
            color: "var(--muted, #64748b)",
            fontSize: 11,
            lineHeight: 1.7,
          }}
        >
          Os valores refletem os registros cadastrados nesta plataforma.
          Marcar uma conta como paga atualiza o controle interno; isso não
          realiza uma transferência ou pagamento bancário.
        </p>
      </section>
    </main>
  );
        }
