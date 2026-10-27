"use client";

import AppHeader from "@/components/AppHeader";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Wallet = { id: string; name: string; balance: number | string };
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

const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (n: number | string | null | undefined) => Number(n ?? 0) || 0;
const monthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const initialPlan: Plan = {
  income: "",
  essentials: "",
  otherExpenses: "",
  debtGoal: "",
};

export default function PlanejamentoPage() {
  const router = useRouter();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [month, setMonth] = useState(monthKey());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`resgata-planejamento-${month}`);
      setPlan(saved ? { ...initialPlan, ...JSON.parse(saved) } : initialPlan);
    } catch {
      setPlan(initialPlan);
    }
  }, [month]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data: auth, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!auth.user) {
          router.replace("/login");
          return;
        }

        const [w, d, a] = await Promise.all([
          supabase.from("wallet_accounts")
            .select("id,name,balance")
            .eq("user_id", auth.user.id),
          supabase.from("debts")
            .select("id,name,amount,paid_amount,due_date,status")
            .eq("user_id", auth.user.id),
          supabase.from("control_accounts")
            .select("id,name,account_type,amount,due_date,status")
            .eq("user_id", auth.user.id),
        ]);

        if (w.error) throw w.error;
        if (d.error) throw d.error;
        if (a.error) throw a.error;

        if (active) {
          setWallets((w.data ?? []) as Wallet[]);
          setDebts((d.data ?? []) as Debt[]);
          setAccounts((a.data ?? []) as Account[]);
        }
      } catch (e) {
        if (active) setMessage(e instanceof Error ? e.message : "Erro ao carregar os dados.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [router]);

  const totals = useMemo(() => {
    const wallet = wallets.reduce((s, x) => s + num(x.balance), 0);
    const openDebts = debts.reduce(
      (s, x) => s + Math.max(0, num(x.amount) - num(x.paid_amount)), 0
    );
    const monthAccounts = accounts.filter(
      x => (x.due_date || "").slice(0, 7) === month && x.status !== "cancelado"
    );
    const pendingBills = monthAccounts
      .filter(x => x.status !== "pago" && x.account_type !== "receita")
      .reduce((s, x) => s + num(x.amount), 0);
    const recordedIncome = monthAccounts
      .filter(x => x.account_type === "receita" && x.status !== "cancelado")
      .reduce((s, x) => s + num(x.amount), 0);
    const recordedExpenses = monthAccounts
      .filter(x => x.account_type !== "receita" && x.status === "pago")
      .reduce((s, x) => s + num(x.amount), 0);
    const income = num(plan.income);
    const essentials = num(plan.essentials);
    const other = num(plan.otherExpenses);
    const goal = num(plan.debtGoal);
    return {
      wallet, openDebts, pendingBills, recordedIncome, recordedExpenses,
      income, essentials, other, goal,
      available: income - essentials - other,
      afterGoal: income - essentials - other - goal,
    };
  }, [wallets, debts, accounts, plan, month]);

  function update(field: keyof Plan, value: string) {
    setPlan(current => ({ ...current, [field]: value }));
  }

  function savePlan() {
    setSaving(true);
    setMessage("");
    try {
      for (const value of Object.values(plan)) {
        if (value.trim() && (!Number.isFinite(Number(value.replace(",", "."))) || Number(value.replace(",", ".")) < 0)) {
          throw new Error("Informe valores válidos e não negativos.");
        }
      }
      localStorage.setItem(`resgata-planejamento-${month}`, JSON.stringify(plan));
      setMessage("Planejamento salvo neste navegador.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "12px", border: "1px solid #d5dce5",
    borderRadius: 10, fontSize: 15, boxSizing: "border-box", background: "#fff",
  };
  const card: React.CSSProperties = {
    background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16,
    padding: 20, minWidth: 0,
  };

  return (
    <>
      <AppHeader />
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 18px 50px", color: "#172033" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center", marginBottom: 24 }}>
          <div>
            <p style={{ color: "#64748b", margin: "0 0 6px" }}>Organização financeira</p>
            <h1 style={{ fontSize: "clamp(26px,4vw,36px)", margin: 0 }}>Planejamento mensal</h1>
            <p style={{ color: "#64748b", marginBottom: 0 }}>Planeje seus gastos e defina uma meta realista para quitar dívidas.</p>
          </div>
          <label style={{ display: "grid", gap: 6, fontWeight: 600 }}>
            Mês de referência
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={fieldStyle} />
          </label>
        </div>

        {message && <p role="status" style={{ padding: 12, borderRadius: 10, background: "#eff6ff", color: "#1d4ed8" }}>{message}</p>}
        {loading ? <p>Carregando seus dados financeiros...</p> : (
          <>
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14, marginBottom: 22 }}>
              {[
                ["Saldo total da Carteira", money(totals.wallet), "Saldo cadastrado nas contas"],
                ["Dívidas em aberto", money(totals.openDebts), "Saldo restante das dívidas"],
                ["Contas do mês pendentes", money(totals.pendingBills), "Controle de contas, não inclui dívidas"],
                ["Contas pagas no mês", money(totals.recordedExpenses), "Despesas marcadas como pagas"],
              ].map(([label, value, note]) => (
                <div key={label} style={card}>
                  <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>{label}</p>
                  <strong style={{ display: "block", fontSize: 25, margin: "10px 0 6px", overflowWrap: "anywhere" }}>{value}</strong>
                  <small style={{ color: "#64748b" }}>{note}</small>
                </div>
              ))}
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 18 }}>
              <div style={card}>
                <h2 style={{ marginTop: 0, fontSize: 21 }}>Monte seu orçamento</h2>
                <p style={{ color: "#64748b", fontSize: 14 }}>Informe os valores previstos para este mês. Esses campos são seu planejamento, não lançamentos bancários.</p>
                <div style={{ display: "grid", gap: 14 }}>
                  {([
                    ["income", "Renda prevista no mês"],
                    ["essentials", "Gastos essenciais previstos"],
                    ["otherExpenses", "Outros gastos previstos"],
                    ["debtGoal", "Meta de pagamento de dívidas"],
                  ] as [keyof Plan, string][]).map(([key, label]) => (
                    <label key={key} style={{ display: "grid", gap: 6, fontWeight: 600 }}>
                      {label}
                      <input inputMode="decimal" placeholder="0,00" value={plan[key]} onChange={e => update(key, e.target.value)} style={fieldStyle} />
                    </label>
                  ))}
                  <button type="button" onClick={savePlan} disabled={saving} style={{ border: 0, borderRadius: 10, padding: 13, background: "#176b52", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                    {saving ? "Salvando..." : "Salvar planejamento"}
                  </button>
                </div>
              </div>

              <div style={card}>
                <h2 style={{ marginTop: 0, fontSize: 21 }}>Simulação do mês</h2>
                <p style={{ color: "#64748b", fontSize: 14 }}>Estimativa calculada com os valores que você informou.</p>
                {[
                  ["Renda prevista", totals.income],
                  ["Gastos essenciais", -totals.essentials],
                  ["Outros gastos", -totals.other],
                ].map(([label, value]) => (
                  <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "13px 0", borderBottom: "1px solid #edf0f4" }}>
                    <span>{label}</span><strong>{money(Number(value))}</strong>
                  </div>
                ))}
                <div style={{ padding: "18px 0", borderBottom: "1px solid #edf0f4" }}>
                  <span style={{ color: "#64748b" }}>Disponível após gastos planejados</span>
                  <strong style={{ display: "block", fontSize: 28, color: totals.available < 0 ? "#b91c1c" : "#176b52", marginTop: 5 }}>{money(totals.available)}</strong>
                </div>
                <div style={{ paddingTop: 18 }}>
                  <span style={{ color: "#64748b" }}>Saldo após a meta de dívidas</span>
                  <strong style={{ display: "block", fontSize: 28, color: totals.afterGoal < 0 ? "#b91c1c" : "#176b52", marginTop: 5 }}>{money(totals.afterGoal)}</strong>
                </div>
                {totals.available < 0 && <p style={{ color: "#b91c1c" }}>Seus gastos planejados ultrapassam a renda prevista. Revise o orçamento antes de definir pagamentos extras.</p>}
                {totals.goal > totals.available && <p style={{ color: "#b45309" }}>A meta para dívidas é maior que o valor disponível calculado.</p>}
                <p style={{ color: "#64748b", fontSize: 12, marginTop: 20 }}>A simulação não movimenta dinheiro nem altera dívidas ou saldos. O saldo da Carteira é mostrado separadamente e não é somado à renda mensal.</p>
              </div>
            </section>

            <section style={{ ...card, marginTop: 18 }}>
              <h2 style={{ marginTop: 0 }}>Contas da Carteira</h2>
              {wallets.length === 0 ? <p>Você ainda não cadastrou contas na Carteira.</p> : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
                  {wallets.map(w => <div key={w.id} style={{ padding: 14, borderRadius: 12, background: "#f8fafc" }}>
                    <div style={{ color: "#64748b", fontSize: 13 }}>{w.name}</div>
                    <strong style={{ display: "block", fontSize: 21, marginTop: 5 }}>{money(num(w.balance))}</strong>
                  </div>)}
                </div>
              )}
              <p style={{ marginBottom: 0, marginTop: 16 }}><a href="/carteira" style={{ color: "#176b52", fontWeight: 700 }}>Abrir Carteira →</a>　<a href="/controle-contas" style={{ color: "#176b52", fontWeight: 700 }}>Ver controle de contas →</a></p>
            </section>
          </>
        )}
      </main>
    </>
  );
}
