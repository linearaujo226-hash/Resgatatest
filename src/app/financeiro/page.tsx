
"use client";
import AppHeader from "@/components/AppHeader";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Wallet = {
  id: string;
  name: string;
  account_type: string;
  balance: number | string;
};

type Debt = {
  id: string;
  name: string;
  creditor?: string | null;
  amount: number | string;
  paid_amount?: number | string | null;
  due_date: string;
  status: string;
  category?: string | null;
};

type Payment = {
  id: string;
  debt_id: string;
  account_id: string;
  amount: number | string;
  paid_at: string;
  created_at?: string;
};

type PaymentReceipt = {
  id: string;
  user_id: string;
  payment_id: string;
  storage_path: string;
  original_name: string;
  content_type: string;
  created_at?: string;
};

type FinancialExpense = {
  id: string;
  name: string;
  category: string;
  amount: number | string;
  expense_date: string;
  habit_entry_id?: string | null;
  notes?: string | null;
};

const money = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const numberValue = (value: number | string | null | undefined) =>
  Number(value ?? 0);

function remaining(debt: Debt) {
  return Math.max(
    0,
    numberValue(debt.amount) - numberValue(debt.paid_amount),
  );
}

function debtStatus(debt: Debt) {
  if (remaining(debt) <= 0 || debt.status === "pago") return "Pago";

  if (debt.due_date) {
    const due = new Date(`${debt.due_date}T12:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = Math.ceil(
      (due.getTime() - today.getTime()) / 86_400_000,
    );

    if (days < 0) return "Atrasado";
    if (days <= 3) return "Vence em breve";
  }

  return "Pendente";
}

export default function FinanceiroPage() {
  const supabase = getSupabaseBrowserClient();

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [expenses, setExpenses] = useState<FinancialExpense[]>([]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptTargetPaymentId, setReceiptTargetPaymentId] = useState("");
  const [receiptBusy, setReceiptBusy] = useState(false);
  const historyReceiptInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState("");

  const [walletName, setWalletName] = useState("");
  const [walletType, setWalletType] = useState("banco");
  const [walletBalance, setWalletBalance] = useState("");

  const [selectedDebt, setSelectedDebt] = useState("");
  const [selectedWallet, setSelectedWallet] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toLocaleDateString("en-CA"),
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      const user = authData.user;

      if (!user) {
        window.location.href = "/login";
        return;
      }

      setUserId(user.id);

      const [walletResult, debtResult, paymentResult, receiptResult, expenseResult] = await Promise.all([
        supabase
          .from("wallet_accounts")
          .select("id,name,account_type,balance")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true }),

        supabase
          .from("debts")
          .select("*")
          .eq("user_id", user.id)
          .order("due_date", { ascending: true }),

        supabase
          .from("debt_payments")
          .select("id,debt_id,account_id,amount,paid_at,created_at")
          .eq("user_id", user.id)
          .order("paid_at", { ascending: false }),

        supabase
          .from("debt_payment_receipts")
          .select("id,user_id,payment_id,storage_path,original_name,content_type,created_at")
          .eq("user_id", user.id),

        supabase
          .from("financial_expenses")
          .select("id,name,category,amount,expense_date,habit_entry_id,notes")
          .eq("user_id", user.id)
          .order("expense_date", { ascending: false }),
      ]);

      if (walletResult.error) throw walletResult.error;
      if (debtResult.error) throw debtResult.error;
      if (paymentResult.error) throw paymentResult.error;
      if (receiptResult.error) throw receiptResult.error;

      // Permite abrir a página antes da migração ser aplicada.
      // Depois da migração, erros de acesso ou outros erros continuam visíveis.
      const expensesTableMissing =
        expenseResult.error?.code === "42P01" ||
        expenseResult.error?.code === "PGRST205";

      if (expenseResult.error && !expensesTableMissing) {
        throw expenseResult.error;
      }

      setWallets((walletResult.data ?? []) as Wallet[]);
      setDebts((debtResult.data ?? []) as Debt[]);
      setPayments((paymentResult.data ?? []) as Payment[]);
      setReceipts((receiptResult.data ?? []) as PaymentReceipt[]);
      setExpenses(
        expensesTableMissing
          ? []
          : ((expenseResult.data ?? []) as FinancialExpense[]),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os dados financeiros.",
      );
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const debtId = new URLSearchParams(window.location.search).get("debt");
    if (!debtId || selectedDebt) return;

    const debt = debts.find((item) => item.id === debtId);
    if (!debt || remaining(debt) <= 0) return;

    setSelectedDebt(debt.id);
    setPaymentAmount((remaining(debt)).toFixed(2).replace(".", ","));
  }, [debts, selectedDebt]);

  const totalWallets = wallets.reduce(
    (sum, wallet) => sum + numberValue(wallet.balance),
    0,
  );

  const totalDebt = debts.reduce(
    (sum, debt) => sum + numberValue(debt.amount),
    0,
  );

  const totalPaid = debts.reduce(
    (sum, debt) => sum + numberValue(debt.paid_amount),
    0,
  );

  const totalRemaining = debts.reduce(
    (sum, debt) => sum + remaining(debt),
    0,
  );

  const overdueTotal = debts
    .filter((debt) => debtStatus(debt) === "Atrasado")
    .reduce((sum, debt) => sum + remaining(debt), 0);

  // A tabela já reúne despesas comuns e despesas originadas em Hábitos.
  // Não somamos habit_entry_id separadamente para evitar duplicidade.
  const totalExpenses = expenses.reduce(
    (sum, expense) => sum + numberValue(expense.amount),
    0,
  );

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}`;
  const monthlyExpenses = expenses
    .filter((expense) => expense.expense_date?.slice(0, 7) === currentMonth)
    .reduce((sum, expense) => sum + numberValue(expense.amount), 0);

  async function addWallet(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const balance = Number(walletBalance.replace(",", "."));

    if (!userId || !walletName.trim()) {
      setMessage("Informe o nome da conta.");
      return;
    }

    if (!walletBalance.trim() || !Number.isFinite(balance) || balance < 0) {
      setMessage("Informe um saldo válido, igual ou maior que zero.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.from("wallet_accounts").insert({
        user_id: userId,
        name: walletName.trim(),
        account_type: walletType,
        balance,
      });

      if (error) throw error;

      setWalletName("");
      setWalletBalance("");
      setMessage("Conta adicionada com sucesso.");
      await loadData();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Erro ao adicionar a conta.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function adjustWallet(
    wallet: Wallet,
    direction: "add" | "subtract",
  ) {
    const promptText =
      direction === "add"
        ? "Quanto deseja adicionar ao saldo?"
        : "Quanto deseja retirar do saldo?";

    const answer = window.prompt(promptText);

    if (answer === null) return;

    const amount = Number(answer.replace(",", "."));

    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Informe um valor maior que zero.");
      return;
    }

    const current = numberValue(wallet.balance);
    const next =
      direction === "add" ? current + amount : current - amount;

    if (next < 0) {
      setMessage("O saldo da conta não pode ficar negativo.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const { error } = await supabase
        .from("wallet_accounts")
        .update({ balance: next, updated_at: new Date().toISOString() })
        .eq("id", wallet.id)
        .eq("user_id", userId);

      if (error) throw error;

      setMessage("Saldo atualizado.");
      await loadData();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível atualizar o saldo.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function attachReceipt(paymentId: string, file: File) {
    if (!userId) throw new Error("Sua sessão expirou. Entre novamente.");

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error("Use um PDF, JPG, PNG ou WebP.");
    }

    if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
      throw new Error("O comprovante deve ter até 10 MB.");
    }

    if (receipts.some((receipt) => receipt.payment_id === paymentId)) {
      throw new Error("Este pagamento já possui um comprovante anexado.");
    }

    const safeName = file.name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-120) || "comprovante";

    const storagePath =
      `${userId}/${paymentId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("payment-receipts")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data, error: insertError } = await supabase
      .from("debt_payment_receipts")
      .insert({
        user_id: userId,
        payment_id: paymentId,
        storage_path: storagePath,
        original_name: file.name,
        content_type: file.type,
      })
      .select("id,user_id,payment_id,storage_path,original_name,content_type,created_at")
      .single();

    if (insertError) {
      await supabase.storage
        .from("payment-receipts")
        .remove([storagePath]);
      throw insertError;
    }

    setReceipts((current) => [
      ...current,
      data as PaymentReceipt,
    ]);
  }

  async function openReceipt(receipt: PaymentReceipt) {
    const { data, error } = await supabase.storage
      .from("payment-receipts")
      .createSignedUrl(receipt.storage_path, 60);

    if (error) {
      setMessage(`Não foi possível abrir o comprovante: ${error.message}`);
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function handleHistoryReceiptChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    const paymentId = receiptTargetPaymentId;
    event.target.value = "";

    if (!file || !paymentId) return;

    setReceiptBusy(true);
    setMessage("");

    try {
      await attachReceipt(paymentId, file);
      setMessage("Comprovante anexado ao pagamento.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível anexar o comprovante.",
      );
    } finally {
      setReceiptBusy(false);
      setReceiptTargetPaymentId("");
    }
  }

  async function registerPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const amount = Number(paymentAmount.replace(",", "."));
    const debt = debts.find((item) => item.id === selectedDebt);

    if (!debt || !selectedWallet) {
      setMessage("Selecione a dívida e a conta usada para pagar.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Informe um valor de pagamento válido.");
      return;
    }

    if (amount > remaining(debt)) {
      setMessage("O pagamento não pode ultrapassar o saldo restante da dívida.");
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await supabase.rpc("register_debt_payment", {
        p_debt_id: selectedDebt,
        p_account_id: selectedWallet,
        p_amount: amount,
        p_paid_at: paymentDate,
      });

      if (error) throw error;

      if (data && data.success === false) {
        throw new Error(data.message || "O pagamento não foi registrado.");
      }

      const paymentId = data?.payment_id as string | undefined;
      const selectedReceipt = receiptFile;
      setPaymentAmount("");
      setReceiptFile(null);

      let receiptMessage = "";
      if (selectedReceipt) {
        if (!paymentId) {
          receiptMessage =
            " O pagamento foi registrado, mas o banco não retornou o identificador necessário para anexar o comprovante. Confira a migração da função SQL.";
        } else {
          try {
            await attachReceipt(paymentId, selectedReceipt);
            receiptMessage = " Comprovante anexado.";
          } catch (receiptError) {
            receiptMessage =
              " O pagamento foi registrado, mas o comprovante não foi enviado. Anexe-o pelo histórico depois." +
              (receiptError instanceof Error
                ? ` Detalhe: ${receiptError.message}`
                : "");
          }
        }
      }

      await loadData();
      setMessage("Pagamento registrado e saldo atualizado." + receiptMessage);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar o pagamento.",
      );
    } finally {
      setSaving(false);
    }
  }

  const debtNames = new Map(debts.map((debt) => [debt.id, debt.name]));
  const walletNames = new Map(wallets.map((wallet) => [wallet.id, wallet.name]));

  const currentYear = new Date().getFullYear();

  const monthlyPayments = Array.from({ length: 12 }, (_, month) => {
    const total = payments
      .filter((payment) => {
        const date = new Date(`${payment.paid_at}T12:00:00`);
        return date.getFullYear() === currentYear && date.getMonth() === month;
      })
      .reduce((sum, payment) => sum + numberValue(payment.amount), 0);

    return {
      label: new Date(currentYear, month, 1)
        .toLocaleDateString("pt-BR", { month: "short" })
        .replace(".", ""),
      total,
    };
  });

  const maxMonthlyPayment = Math.max(
    ...monthlyPayments.map((item) => item.total),
    1
  );

  const paymentProgress =
    totalDebt > 0 ? Math.min(100, (totalPaid / totalDebt) * 100) : 0;


  return (
    <main className="finance-page">
      <AppHeader />

      <style jsx>{`
        .finance-page {
          min-height: 100vh;
          padding: 28px 18px 48px;
          background: #f3f6fb;
          color: #172033;
        }
        .container {
          max-width: 1180px;
          margin: 0 auto;
        }
        .top {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 24px;
        }
        h1 {
          margin: 0;
          font-size: clamp(27px, 4vw, 36px);
          font-weight: 800;
        }
        .muted {
          color: #64748b;
          margin-top: 7px;
        }
        .nav {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .nav a, button {
          border: 0;
          border-radius: 10px;
          padding: 10px 14px;
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
        }
        .nav a {
          background: white;
          color: #1e293b;
          border: 1px solid #dbe3ee;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(185px, 1fr));
          gap: 14px;
          margin-bottom: 20px;
        }
        .card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 20px;
          box-shadow: 0 5px 20px #0f172a08;
          margin-bottom: 18px;
        }
        .stat-label {
          color: #64748b;
          font-size: 13px;
          font-weight: 700;
        }
        .stat-value {
          margin-top: 8px;
          font-size: clamp(21px, 3vw, 27px);
          font-weight: 800;
          overflow-wrap: anywhere;
        }
        h2 {
          margin: 0 0 16px;
          font-size: 19px;
        }
        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 12px;
          align-items: end;
        }
        label {
          display: grid;
          gap: 7px;
          font-size: 13px;
          font-weight: 700;
          color: #475569;
        }
        input, select {
          width: 100%;
          min-width: 0;
          padding: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: white;
          color: #172033;
          font: inherit;
        }
        button.primary {
          background: #0f766e;
          color: white;
        }
        button.secondary {
          background: #e8eef7;
          color: #1e293b;
        }
        button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .account-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }
        .account {
          border: 1px solid #dce5ef;
          border-radius: 13px;
          padding: 16px;
        }
        .account-name {
          font-weight: 800;
        }
        .balance {
          font-size: 23px;
          font-weight: 800;
          margin: 10px 0;
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .debt-list {
          display: grid;
          gap: 10px;
        }
        .debt-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          border: 1px solid #e2e8f0;
          border-left: 5px solid #eab308;
          border-radius: 12px;
          padding: 14px;
        }
        .debt-row.overdue { border-left-color: #dc2626; }
        .debt-row.soon { border-left-color: #f97316; }
        .debt-row.paid { border-left-color: #16a34a; }
        .debt-title {
          font-weight: 800;
          overflow-wrap: anywhere;
        }
        .debt-details {
          color: #64748b;
          font-size: 13px;
          margin-top: 5px;
        }
        .status {
          display: inline-block;
          border-radius: 999px;
          background: #fef3c7;
          color: #92400e;
          padding: 5px 9px;
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
        }
        .status.red { background: #fee2e2; color: #991b1b; }
        .status.green { background: #dcfce7; color: #166534; }
        .notice {
          border-radius: 10px;
          padding: 12px 14px;
          background: #e0f2fe;
          color: #075985;
          margin-bottom: 16px;
          overflow-wrap: anywhere;
        }
        .empty {
          color: #64748b;
          padding: 14px 0;
        }
        .table-wrap { overflow-x: auto; }
        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 500px;
        }
        th, td {
          padding: 12px 10px;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
          font-size: 13px;
        }
        th { color: #64748b; }

        .finance-page {
          background: linear-gradient(135deg, #f0f5fb 0%, #f8fafc 100%);
        }

        .stats .card {
          margin: 0;
          border: none;
          color: white;
          min-width: 0;
          box-shadow: 0 8px 22px #0f172a12;
        }

        .stats .card:nth-child(1) { background: linear-gradient(135deg, #059669, #34d399); }
        .stats .card:nth-child(2) { background: linear-gradient(135deg, #2563eb, #60a5fa); }
        .stats .card:nth-child(3) { background: linear-gradient(135deg, #7c3aed, #a78bfa); }
        .stats .card:nth-child(4) { background: linear-gradient(135deg, #ea580c, #fb923c); }
        .stats .card:nth-child(5) { background: linear-gradient(135deg, #dc2626, #fb7185); }
        .stats .stat-label { color: #ffffffdf; }
        .stats .stat-value { color: white; }

        .section-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 16px;
        }

        .section-heading h2 { margin: 0; }

        .table-wrap {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 620px;
          background: white;
        }

        th {
          background: #f1f5f9;
          color: #475569;
          font-weight: 800;
          white-space: nowrap;
        }

        th, td {
          padding: 14px 12px;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
          font-size: 13px;
        }

        tbody tr:hover { background: #f8fafc; }

        .status.orange { background: #ffedd5; color: #9a3412; }

        .chart-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.8fr) minmax(230px, 1fr);
          gap: 22px;
          align-items: stretch;
        }

        .chart {
          display: flex;
          align-items: end;
          justify-content: space-around;
          gap: 10px;
          height: 230px;
          padding: 20px 10px 0;
          border-bottom: 1px solid #cbd5e1;
          background: repeating-linear-gradient(
            to bottom, transparent 0, transparent 45px, #e2e8f0 46px
          );
        }

        .chart-column {
          display: flex;
          flex: 1;
          min-width: 0;
          height: 100%;
          flex-direction: column;
          justify-content: end;
          align-items: center;
          gap: 8px;
        }

        .chart-bar {
          width: min(28px, 80%);
          min-height: 3px;
          border-radius: 7px 7px 0 0;
          background: linear-gradient(180deg, #34d399, #059669);
          transition: height 0.25s ease;
        }

        .chart-label {
          color: #64748b;
          font-size: 11px;
          padding-bottom: 8px;
          text-transform: capitalize;
        }

        .progress-track {
          height: 10px;
          overflow: hidden;
          background: #e2e8f0;
          border-radius: 999px;
          margin: 12px 0;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #059669, #34d399);
          border-radius: inherit;
        }

        .insight {
          background: #eff6ff;
          border: 1px solid #dbeafe;
          border-radius: 14px;
          padding: 20px;
        }

        .insight h3 { margin: 0 0 10px; font-size: 17px; }

        .insight p {
          color: #475569;
          font-size: 14px;
          line-height: 1.7;
        }

        @media (max-width: 720px) {
          .chart-layout { grid-template-columns: 1fr; }
          .chart { gap: 5px; height: 180px; }
        }

        @media (max-width: 520px) {
          .finance-page { padding: 20px 12px 35px; }
          .card { padding: 15px; }
          .debt-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="container">
        <header className="top">
          <div>
            <h1>Financeiro</h1>
            <p className="muted">
              Contas, saldos, dívidas e pagamentos em um só lugar.
            </p>
          </div>
          <nav className="nav">
            <Link href="/dashboard">Painel</Link>
            <Link href="/dividas">Dívidas</Link>
          </nav>
        </header>

        {message && <div className="notice" role="status">{message}</div>}

        {loading ? (
          <section className="card">Carregando seus dados financeiros...</section>
        ) : (
          <>
            <section className="stats">
              <article className="card">
                <div className="stat-label">Dinheiro disponível</div>
                <div className="stat-value">{money(totalWallets)}</div>
              </article>
              <article className="card">
                <div className="stat-label">Total original das dívidas</div>
                <div className="stat-value">{money(totalDebt)}</div>
              </article>
              <article className="card">
                <div className="stat-label">Total já pago</div>
                <div className="stat-value">{money(totalPaid)}</div>
              </article>
              <article className="card">
                <div className="stat-label">Dívida restante</div>
                <div className="stat-value">{money(totalRemaining)}</div>
              </article>
              <article className="card">
                <div className="stat-label">Dívidas atrasadas</div>
                <div className="stat-value">{money(overdueTotal)}</div>
              </article>
              <article className="card">
                <div className="stat-label">Despesas registradas</div>
                <div className="stat-value">{money(totalExpenses)}</div>
                <p className="muted">Total de despesas comuns e gastos de hábitos.</p>
              </article>
              <article className="card">
                <div className="stat-label">Despesas deste mês</div>
                <div className="stat-value">{money(monthlyExpenses)}</div>
                <p className="muted">Baseado na data de cada despesa.</p>
              </article>
            </section>

            <section className="card">
              <h2>Minhas contas e carteiras</h2>
              {wallets.length === 0 ? (
                <p className="empty">
                  Cadastre seu primeiro banco, carteira digital ou dinheiro em espécie.
                </p>
              ) : (
                <div className="account-grid">
                  {wallets.map((wallet) => (
                    <article className="account" key={wallet.id}>
                      <div className="account-name">{wallet.name}</div>
                      <div className="muted">{wallet.account_type}</div>
                      <div className="balance">{money(numberValue(wallet.balance))}</div>
                      <div className="actions">
                        <button
                          className="secondary"
                          disabled={saving}
                          onClick={() => void adjustWallet(wallet, "add")}
                        >
                          + Adicionar
                        </button>
                        <button
                          className="secondary"
                          disabled={saving}
                          onClick={() => void adjustWallet(wallet, "subtract")}
                        >
                          − Retirar
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="card">
              <h2>Adicionar conta ou carteira</h2>
              <form className="form-grid" onSubmit={addWallet}>
                <label>
                  Nome da conta
                  <input
                    required
                    value={walletName}
                    onChange={(event) => setWalletName(event.target.value)}
                    placeholder="Ex.: Caixa Tem, Bradesco, dinheiro"
                  />
                </label>
                <label>
                  Tipo
                  <select
                    value={walletType}
                    onChange={(event) => setWalletType(event.target.value)}
                  >
                    <option value="banco">Banco</option>
                    <option value="carteira digital">Carteira digital</option>
                    <option value="dinheiro">Dinheiro em espécie</option>
                    <option value="poupança">Poupança</option>
                    <option value="outro">Outro</option>
                  </select>
                </label>
                <label>
                  Saldo inicial (R$)
                  <input
                    required
                    inputMode="decimal"
                    value={walletBalance}
                    onChange={(event) => setWalletBalance(event.target.value)}
                    placeholder="0,00"
                  />
                </label>
                <button className="primary" disabled={saving} type="submit">
                  {saving ? "Salvando..." : "Adicionar conta"}
                </button>
              </form>
            </section>

            <section className="card">
              <h2>Registrar pagamento de dívida</h2>
              {debts.filter((debt) => remaining(debt) > 0).length === 0 ? (
                <p className="empty">
                  Não há dívidas pendentes cadastradas. Você pode adicionar dívidas na página Dívidas.
                </p>
              ) : wallets.length === 0 ? (
                <p className="empty">
                  Primeiro cadastre uma conta ou carteira com saldo disponível.
                </p>
              ) : (
                <form className="form-grid" onSubmit={registerPayment}>
                  <label>
                    Dívida
                    <select
                      required
                      value={selectedDebt}
                      onChange={(event) => setSelectedDebt(event.target.value)}
                    >
                      <option value="">Selecione uma dívida</option>
                      {debts
                        .filter((debt) => remaining(debt) > 0)
                        .map((debt) => (
                          <option key={debt.id} value={debt.id}>
                            {debt.name} — restante {money(remaining(debt))}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Pagar com
                    <select
                      required
                      value={selectedWallet}
                      onChange={(event) => setSelectedWallet(event.target.value)}
                    >
                      <option value="">Selecione uma conta</option>
                      {wallets.map((wallet) => (
                        <option key={wallet.id} value={wallet.id}>
                          {wallet.name} — {money(numberValue(wallet.balance))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Valor pago (R$)
                    <input
                      required
                      inputMode="decimal"
                      value={paymentAmount}
                      onChange={(event) => setPaymentAmount(event.target.value)}
                      placeholder="0,00"
                    />
                  </label>
                  <label>
                    Data do pagamento
                    <input
                      required
                      type="date"
                      value={paymentDate}
                      onChange={(event) => setPaymentDate(event.target.value)}
                    />
                  </label>
                  <label className="receipt-picker">
                    Comprovante (opcional)
                    <input
                      type="file"
                      accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        setReceiptFile(event.target.files?.[0] ?? null)
                      }
                    />
                    <span className="muted">
                      PDF, JPG, PNG ou WebP · até 10 MB
                    </span>
                  </label>
                  <label className="receipt-picker">
                    Tirar foto do comprovante (opcional)
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(event) =>
                        setReceiptFile(event.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                  {receiptFile && (
                    <p className="muted">
                      Arquivo selecionado: {receiptFile.name}
                      {" "}
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setReceiptFile(null)}
                      >
                        Remover
                      </button>
                    </p>
                  )}
                  <button className="primary" disabled={saving} type="submit">
                    {saving ? "Registrando..." : "Registrar pagamento"}
                  </button>
                </form>
              )}
              <p className="muted">
                O registro usa a função segura do banco para atualizar o saldo da conta,
                o valor pago da dívida e o histórico juntos.
              </p>
            </section>

            <section className="card">
              <div className="section-heading">
                <h2>Minhas dívidas</h2>
                <Link href="/dividas">Ver todas as dívidas →</Link>
              </div>

              {debts.length === 0 ? (
                <p className="empty">
                  Nenhuma dívida encontrada. Cadastre uma na página Dívidas.
                </p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Dívida</th>
                        <th>Credor</th>
                        <th>Valor original</th>
                        <th>Já pago</th>
                        <th>Restante</th>
                        <th>Vencimento</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {debts.map((debt) => {
                        const status = debtStatus(debt);
                        const badge =
                          status === "Pago"
                            ? "status green"
                            : status === "Atrasado"
                              ? "status red"
                              : status === "Vence em breve"
                                ? "status orange"
                                : "status";

                        return (
                          <tr key={debt.id}>
                            <td><strong>{debt.name}</strong></td>
                            <td>{debt.creditor || "—"}</td>
                            <td>{money(numberValue(debt.amount))}</td>
                            <td>{money(numberValue(debt.paid_amount))}</td>
                            <td><strong>{money(remaining(debt))}</strong></td>
                            <td>{debt.due_date || "—"}</td>
                            <td><span className={badge}>{status}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <h2>Histórico de pagamentos</h2>
              <input
                ref={historyReceiptInput}
                type="file"
                accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
                hidden
                onChange={handleHistoryReceiptChange}
              />
              {payments.length === 0 ? (
                <p className="empty">Nenhum pagamento registrado ainda.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Dívida</th>
                        <th>Conta utilizada</th>
                        <th>Valor</th>
                        <th>Comprovante</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment) => (
                        <tr key={payment.id}>
                          <td>{payment.paid_at}</td>
                          <td>{debtNames.get(payment.debt_id) ?? "Dívida"}</td>
                          <td>{walletNames.get(payment.account_id) ?? "Conta"}</td>
                          <td>{money(numberValue(payment.amount))}</td>
                          <td>
                            {(() => {
                              const receipt = receipts.find(
                                (item) => item.payment_id === payment.id,
                              );

                              if (receipt) {
                                return (
                                  <button
                                    type="button"
                                    className="secondary"
                                    onClick={() => void openReceipt(receipt)}
                                  >
                                    Ver comprovante
                                  </button>
                                );
                              }

                              return (
                                <button
                                  type="button"
                                  className="secondary"
                                  disabled={receiptBusy}
                                  onClick={() => {
                                    setReceiptTargetPaymentId(payment.id);
                                    historyReceiptInput.current?.click();
                                  }}
                                >
                                  {receiptBusy ? "Enviando..." : "Anexar"}
                                </button>
                              );
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <div className="section-heading">
                <div>
                  <h2>Visão geral do seu financeiro</h2>
                  <p className="muted">
                    Pagamentos registrados mês a mês em {currentYear}.
                  </p>
                </div>
              </div>

              <div className="chart-layout">
                <div>
                  <div className="chart">
                    {monthlyPayments.map((item) => (
                      <div className="chart-column" key={item.label}>
                        <div
                          className="chart-bar"
                          title={`${item.label}: ${money(item.total)}`}
                          style={{
                            height: `${Math.max(
                              item.total > 0 ? 4 : 0,
                              (item.total / maxMonthlyPayment) * 100
                            )}%`,
                          }}
                        />
                        <span className="chart-label">{item.label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="muted">
                    Total pago no histórico: {money(totalPaid)}
                  </p>
                </div>

                <aside className="insight">
                  <h3>Progresso das suas dívidas</h3>
                  <div className="stat-value">
                    {paymentProgress.toLocaleString("pt-BR", {
                      maximumFractionDigits: 1,
                    })}%
                  </div>

                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-label="Progresso de pagamento das dívidas"
                    aria-valuenow={Math.round(paymentProgress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="progress-fill"
                      style={{ width: `${paymentProgress}%` }}
                    />
                  </div>

                  <p>
                    Você já pagou {money(totalPaid)} de um total original de{" "}
                    {money(totalDebt)}.
                  </p>
                  <p><strong>Saldo restante:</strong> {money(totalRemaining)}</p>
                  <Link href="/dividas">Organizar minhas dívidas →</Link>
                </aside>
              </div>
            </section>

          </>
        )}
      </div>
    </main>
  );
}
