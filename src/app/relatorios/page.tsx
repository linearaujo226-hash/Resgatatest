"use client";

import AppHeader from "@/components/AppHeader";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Debt = { id: string; name: string; amount: number | string; paid_amount?: number | string | null; due_date: string; status: string };
type Wallet = { id: string; name: string; balance: number | string; account_type: string };
type Payment = { id: string; debt_id: string; account_id: string; amount: number | string; paid_at: string; created_at?: string };
type Account = { id: string; name: string; account_type: string; amount: number | string; due_date: string | null; status: string; created_at: string };

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function RelatoriosPage() {
  const router = useRouter();
  const [debts, setDebts] = useState<Debt[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [start, setStart] = useState(`${currentMonth()}-01`);
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        const [d, w, p, a] = await Promise.all([
          supabase.from("debts").select("id,name,amount,paid_amount,due_date,status").eq("user_id", auth.user.id),
          supabase.from("wallet_accounts").select("id,name,balance,account_type").eq("user_id", auth.user.id),
          supabase.from("debt_payments").select("id,debt_id,account_id,amount,paid_at,created_at").eq("user_id", auth.user.id),
          supabase.from("control_accounts").select("id,name,account_type,amount,due_date,status,created_at").eq("user_id", auth.user.id),
        ]);
        if (d.error) throw d.error;
        if (w.error) throw w.error;
        if (p.error) throw p.error;
        if (a.error) throw a.error;
        if (!active) return;
        setDebts((d.data ?? []) as Debt[]);
        setWallets((w.data ?? []) as Wallet[]);
        setPayments((p.data ?? []) as Payment[]);
        setAccounts((a.data ?? []) as Account[]);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Não foi possível carregar os relatórios.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [router]);

  const totals = useMemo(() => {
    const walletBalance = wallets.reduce((s, w) => s + num(w.balance), 0);
    const debtTotal = debts.reduce((s, d) => s + num(d.amount), 0);
    const debtPaid = debts.reduce((s, d) => s + Math.min(num(d.amount), Math.max(0, num(d.paid_amount))), 0);
    const debtOpen = debts.reduce((s, d) => s + Math.max(0, num(d.amount) - num(d.paid_amount)), 0);
    const filteredPayments = payments.filter(p => {
      const date = (p.paid_at || p.created_at || "").slice(0, 10);
      return date >= start && date <= end;
    });
    const periodAccounts = accounts.filter(a => {
      const date = (a.due_date || a.created_at || "").slice(0, 10);
      return date >= start && date <= end && a.status !== "cancelado";
    });
    const income = periodAccounts.filter(a => a.account_type === "receita")
      .reduce((s, a) => s + num(a.amount), 0);
    const expensesPaid = periodAccounts.filter(a => a.account_type !== "receita" && a.status === "pago")
      .reduce((s, a) => s + num(a.amount), 0);
    const expensesPending = periodAccounts.filter(a => a.account_type !== "receita" && a.status !== "pago")
      .reduce((s, a) => s + num(a.amount), 0);
    const paymentTotal = filteredPayments.reduce((s, p) => s + num(p.amount), 0);
    return { walletBalance, debtTotal, debtPaid, debtOpen, filteredPayments, income, expensesPaid, expensesPending, paymentTotal };
  }, [debts, wallets, payments, accounts, start, end]);

  const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, minWidth: 0 };
  const field: React.CSSProperties = { padding: 11, border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff" };

  return (
    <>
      <AppHeader />
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 18px 50px", color: "#172033" }}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ color: "#64748b", margin: "0 0 6px" }}>Visão geral da sua vida financeira</p>
          <h1 style={{ fontSize: "clamp(26px,4vw,36px)", margin: 0 }}>Relatórios financeiros</h1>
          <p style={{ color: "#64748b" }}>Indicadores calculados a partir dos registros da sua conta.</p>
        </div>

        <section style={{ ...card, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "end", marginBottom: 20 }}>
          <label style={{ display: "grid", gap: 6, fontWeight: 600 }}>Data inicial<input type="date" value={start} max={end} onChange={e => setStart(e.target.value)} style={field} /></label>
          <label style={{ display: "grid", gap: 6, fontWeight: 600 }}>Data final<input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)} style={field} /></label>
          <button type="button" onClick={() => { setStart(`${currentMonth()}-01`); setEnd(new Date().toISOString().slice(0, 10)); }} style={{ padding: "11px 15px", borderRadius: 9, border: 0, background: "#e2e8f0", fontWeight: 700, cursor: "pointer" }}>Mês atual</button>
        </section>

        {error && <p role="alert" style={{ background: "#fef2f2", color: "#991b1b", padding: 12, borderRadius: 10 }}>{error}</p>}
        {loading ? <p>Carregando relatórios...</p> : !error && <>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14, marginBottom: 20 }}>
            {[
              ["Total geral das dívidas", money(totals.debtTotal), "Valor original cadastrado"],
              ["Total pago nas dívidas", money(totals.debtPaid), "Calculado pelos valores pagos nas dívidas"],
              ["Dívidas em aberto", money(totals.debtOpen), "Saldo restante"],
              ["Saldo total da Carteira", money(totals.walletBalance), "Saldos atuais das contas"],
            ].map(([title, value, note]) => <article key={title} style={card}>
              <div style={{ color: "#64748b", fontSize: 14 }}>{title}</div>
              <strong style={{ display: "block", fontSize: 25, margin: "10px 0 6px", overflowWrap: "anywhere" }}>{value}</strong>
              <small style={{ color: "#64748b" }}>{note}</small>
            </article>)}
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 18 }}>
            <article style={card}>
              <h2 style={{ marginTop: 0 }}>Movimentações no período</h2>
              <p style={{ color: "#64748b", fontSize: 13 }}>De {start} até {end}</p>
              {[
                ["Pagamentos de dívidas registrados", money(totals.paymentTotal)],
                ["Quantidade de pagamentos", String(totals.filteredPayments.length)],
                ["Receitas em Controle de contas", money(totals.income)],
                ["Despesas marcadas como pagas", money(totals.expensesPaid)],
                ["Despesas ainda pendentes", money(totals.expensesPending)],
              ].map(([label, value]) => <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: "1px solid #edf0f4" }}>
                <span>{label}</span><strong style={{ textAlign: "right" }}>{value}</strong>
              </div>)}
              <p style={{ color: "#64748b", fontSize: 12, marginBottom: 0 }}>O histórico de pagamentos é apresentado separadamente do total pago nas dívidas para evitar dupla contagem.</p>
            </article>

            <article style={card}>
              <h2 style={{ marginTop: 0 }}>Saldo por conta</h2>
              {wallets.length === 0 ? <p>Nenhuma conta cadastrada na Carteira.</p> : wallets.map(w => <div key={w.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: "1px solid #edf0f4" }}>
                <span>{w.name}<small style={{ display: "block", color: "#64748b" }}>{w.account_type}</small></span>
                <strong>{money(num(w.balance))}</strong>
              </div>)}
              <p style={{ marginBottom: 0, marginTop: 16 }}><a href="/carteira" style={{ color: "#176b52", fontWeight: 700 }}>Gerenciar Carteira →</a></p>
            </article>
          </section>

          <section style={{ ...card, marginTop: 18 }}>
            <h2 style={{ marginTop: 0 }}>Dívidas por situação</h2>
            {debts.length === 0 ? <p>Nenhuma dívida cadastrada.</p> : <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead><tr>{["Dívida", "Vencimento", "Valor original", "Pago", "Em aberto"].map(h => <th key={h} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #cbd5e1", color: "#64748b", fontSize: 13 }}>{h}</th>)}</tr></thead>
                <tbody>{debts.slice().sort((a,b) => a.due_date.localeCompare(b.due_date)).map(d => {
                  const amount = num(d.amount);
                  const paid = Math.min(amount, Math.max(0, num(d.paid_amount)));
                  return <tr key={d.id}>
                    <td style={{ padding: 10, borderBottom: "1px solid #edf0f4" }}>{d.name}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #edf0f4" }}>{d.due_date ? new Date(`${d.due_date}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #edf0f4" }}>{money(amount)}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #edf0f4" }}>{money(paid)}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #edf0f4", fontWeight: 700 }}>{money(Math.max(0, amount - paid))}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>}
          </section>
        </>}
      </main>
    </>
  );
}
