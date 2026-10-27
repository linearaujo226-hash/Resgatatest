"use client";

import AppHeader from "@/components/AppHeader";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type PaymentRpcResult = {
  success?: boolean;
  message?: string;
  payment_id?: string;
};

const money = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

function numberValue(value: number | string | null | undefined): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function parseMoney(value: string): number {
  const normalized = value.trim().replace(/\s/g, "");

  if (!normalized) return NaN;

  // Aceita 1234,56 ou 1234.56.
  // Para valores brasileiros com separador de milhar,
  // aceita também 1.234,56.
  const normalizedValue = normalized.includes(",")
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized;

  return Number(normalizedValue);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const datePart = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);

  if (!match) return value;

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function localToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function remaining(debt: Debt): number {
  return Math.max(
    0,
    numberValue(debt.amount) - numberValue(debt.paid_amount),
  );
}

function debtStatus(debt: Debt): string {
  if (remaining(debt) <= 0 || debt.status === "pago") {
    return "Pago";
  }

  if (!debt.due_date) return "Pendente";

  const due = new Date(`${debt.due_date.slice(0, 10)}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  if (Number.isNaN(due.getTime())) return "Pendente";

  const days = Math.floor(
    (due.getTime() - today.getTime()) / 86_400_000,
  );

  if (days < 0) return "Atrasado";
  if (days <= 3) return "Vence em breve";

  return "Pendente";
}

function errorText(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error
  ) {
    const dbError = error as {
      code?: string;
      message?: string;
      details?: string;
    };

    switch (dbError.code) {
      case "23505":
        return "Este registro já existe.";
      case "23503":
        return "Não foi possível concluir a operação porque existem registros relacionados.";
      case "42501":
        return "Você não tem permissão para executar esta operação.";
      case "42P01":
      case "PGRST205":
        return "Uma tabela necessária ainda não existe no banco de dados. Confira as migrações do Supabase.";
      case "PGRST202":
        return "A função do banco não foi encontrada. Confira o nome e os parâmetros de register_debt_payment.";
      case "PGRST116":
        return "O registro solicitado não foi encontrado ou não está acessível.";
      case "22P02":
        return "Um dos valores enviados possui formato inválido.";
      default:
        return dbError.message || "O banco de dados não conseguiu concluir a operação.";
    }
  }

  if (error instanceof Error) return error.message;

  return "Ocorreu um erro inesperado. Tente novamente.";
}

export default function FinanceiroPage() {
  const supabase = getSupabaseBrowserClient();

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [expenses, setExpenses] = useState<FinancialExpense[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");
  const [userId, setUserId] = useState("");

  const [walletName, setWalletName] = useState("");
  const [walletType, setWalletType] = useState("banco");
  const [walletBalance, setWalletBalance] = useState("");

  const [selectedDebt, setSelectedDebt] = useState("");
  const [selectedWallet, setSelectedWallet] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(localToday());
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [searchDebt, setSearchDebt] = useState("");
  const [debtStatusFilter, setDebtStatusFilter] = useState("todas");

  const historyReceiptInput = useRef<HTMLInputElement>(null);
  const [receiptTargetPaymentId, setReceiptTargetPaymentId] = useState("");

  const notify = useCallback(
    (text: string, type: "success" | "error" | "info" = "info") => {
      setMessage(text);
      setMessageType(type);
    },
    [],
  );

  const loadData = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);

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

      const [
        walletResult,
        debtResult,
        paymentResult,
        receiptResult,
        expenseResult,
      ] = await Promise.all([
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
          .select(
            "id,user_id,payment_id,storage_path,original_name,content_type,created_at",
          )
          .eq("user_id", user.id),

        supabase
          .from("financial_expenses")
          .select(
            "id,name,category,amount,expense_date,habit_entry_id,notes",
          )
          .eq("user_id", user.id)
          .order("expense_date", { ascending: false }),
      ]);

      if (walletResult.error) throw walletResult.error;
      if (debtResult.error) throw debtResult.error;
      if (paymentResult.error) throw paymentResult.error;
      if (receiptResult.error) throw receiptResult.error;

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
      notify(errorText(error), "error");
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [supabase, notify]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const debtId = new URLSearchParams(window.location.search).get("debt");

    if (!debtId || selectedDebt) return;

    const debt = debts.find((item) => item.id === debtId);

    if (!debt || remaining(debt) <= 0) return;

    setSelectedDebt(debt.id);
    setPaymentAmount(
      remaining(debt).toFixed(2).replace(".", ","),
    );
  }, [debts, selectedDebt]);

  const walletById = useMemo(
    () => new Map(wallets.map((wallet) => [wallet.id, wallet])),
    [wallets],
  );

  const debtById = useMemo(
    () => new Map(debts.map((debt) => [debt.id, debt])),
    [debts],
  );

  const receiptByPaymentId = useMemo(
    () => new Map(receipts.map((receipt) => [receipt.payment_id, receipt])),
    [receipts],
  );

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

  const totalExpenses = expenses.reduce(
    (sum, expense) => sum + numberValue(expense.amount),
    0,
  );

  const now = new Date();

  const currentMonth =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const monthlyExpenses = expenses
    .filter((expense) => expense.expense_date?.slice(0, 7) === currentMonth)
    .reduce((sum, expense) => sum + numberValue(expense.amount), 0);

  const pendingDebts = debts.filter((debt) => remaining(debt) > 0);

  const selectedDebtData = debts.find((debt) => debt.id === selectedDebt);
  const selectedWalletData = wallets.find(
    (wallet) => wallet.id === selectedWallet,
  );

  const parsedPaymentAmount = parseMoney(paymentAmount);

  const paymentCanBeRegistered =
    Boolean(selectedDebtData) &&
    Boolean(selectedWalletData) &&
    Number.isFinite(parsedPaymentAmount) &&
    parsedPaymentAmount > 0 &&
    parsedPaymentAmount <= remaining(selectedDebtData!) &&
    parsedPaymentAmount <= numberValue(selectedWalletData?.balance) &&
    Boolean(paymentDate) &&
    paymentDate <= localToday();

  async function addWallet(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!userId) {
      notify("Sua sessão expirou. Entre novamente.", "error");
      return;
    }

    if (!walletName.trim()) {
      notify("Informe o nome da conta.", "error");
      return;
    }

    const balance = parseMoney(walletBalance);

    if (!walletBalance.trim() || !Number.isFinite(balance) || balance < 0) {
      notify("Informe um saldo inicial válido, igual ou maior que zero.", "error");
      return;
    }

    setSaving(true);
    notify("", "info");

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

      await loadData(false);
      notify("Conta adicionada com sucesso.", "success");
    } catch (error) {
      notify(errorText(error), "error");
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
        ? "Quanto deseja adicionar ao saldo? Ex.: 150,00"
        : "Quanto deseja retirar do saldo? Ex.: 50,00";

    const answer = window.prompt(promptText);

    if (answer === null) return;

    const amount = parseMoney(answer);

    if (!Number.isFinite(amount) || amount <= 0) {
      notify("Informe um valor maior que zero.", "error");
      return;
    }

    const current = numberValue(wallet.balance);
    const next = direction === "add" ? current + amount : current - amount;

    if (next < 0) {
      notify("Saldo insuficiente para essa retirada.", "error");
      return;
    }

    /*
     * Importante:
     * Este update preserva a estrutura atual do projeto, mas é uma
     * atualização feita pelo cliente. Para concorrência segura, o ideal
     * é migrar esta operação para uma função SQL transacional.
     */
    setSaving(true);

    try {
      const { error } = await supabase
        .from("wallet_accounts")
        .update({
          balance: next,
          updated_at: new Date().toISOString(),
        })
        .eq("id", wallet.id)
        .eq("user_id", userId);

      if (error) throw error;

      await loadData(false);
      notify("Saldo atualizado.", "success");
    } catch (error) {
      notify(errorText(error), "error");
    } finally {
      setSaving(false);
    }
  }

  async function attachReceipt(paymentId: string, file: File) {
    if (!userId) {
      throw new Error("Sua sessão expirou. Entre novamente.");
    }

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error("Use um comprovante em PDF, JPG, PNG ou WebP.");
    }

    if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
      throw new Error("O comprovante deve ter até 10 MB.");
    }

    if (receiptByPaymentId.has(paymentId)) {
      throw new Error("Este pagamento já possui um comprovante.");
    }

    const safeName =
      file.name
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
      .select(
        "id,user_id,payment_id,storage_path,original_name,content_type,created_at",
      )
      .single();

    if (insertError) {
      const { error: cleanupError } = await supabase.storage
        .from("payment-receipts")
        .remove([storagePath]);

      if (cleanupError) {
        console.error(
          "Não foi possível remover o arquivo após falha no cadastro:",
          cleanupError.message,
        );
      }

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
      notify(`Não foi possível abrir o comprovante: ${error.message}`, "error");
      return;
    }

    const opened = window.open(
      data.signedUrl,
      "_blank",
      "noopener,noreferrer",
    );

    if (!opened) {
      notify(
        "O navegador bloqueou a nova aba. Permita pop-ups para abrir o comprovante.",
        "info",
      );
    }
  }

  async function handleHistoryReceiptChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    const paymentId = receiptTargetPaymentId;

    event.target.value = "";

    if (!file || !paymentId) return;

    setReceiptBusy(true);

    try {
      await attachReceipt(paymentId, file);
      notify("Comprovante anexado ao pagamento.", "success");
    } catch (error) {
      notify(errorText(error), "error");
    } finally {
      setReceiptBusy(false);
      setReceiptTargetPaymentId("");
    }
  }

  async function registerPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedDebtData || !selectedWalletData) {
      notify("Selecione uma dívida e a conta utilizada para pagar.", "error");
      return;
    }

    const amount = parseMoney(paymentAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      notify("Informe um valor de pagamento válido.", "error");
      return;
    }

    if (amount > remaining(selectedDebtData)) {
      notify("O pagamento não pode ultrapassar o saldo restante da dívida.", "error");
      return;
    }

    if (amount > numberValue(selectedWalletData.balance)) {
      notify("O saldo da conta selecionada é insuficiente.", "error");
      return;
    }

    if (!paymentDate || paymentDate > localToday()) {
      notify("Informe uma data válida, que não seja futura.", "error");
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await supabase.rpc("register_debt_payment", {
        p_debt_id: selectedDebtData.id,
        p_account_id: selectedWalletData.id,
        p_amount: amount,
        p_paid_at: paymentDate,
      });

      if (error) throw error;

      const rpcResult = data as PaymentRpcResult | null;

      if (rpcResult?.success === false) {
        throw new Error(
          rpcResult.message || "O pagamento não foi registrado.",
        );
      }

      const paymentId = rpcResult?.payment_id;
      const selectedReceipt = receiptFile;

      setPaymentAmount("");
      setReceiptFile(null);

      let receiptMessage = "";

      if (selectedReceipt) {
        if (!paymentId) {
          receiptMessage =
            " O pagamento foi registrado, mas o banco não retornou o ID necessário para anexar o comprovante.";
        } else {
          try {
            await attachReceipt(paymentId, selectedReceipt);
            receiptMessage = " Comprovante anexado.";
          } catch (receiptError) {
            receiptMessage =
              " O pagamento foi registrado, mas o comprovante não foi anexado. Você poderá tentar anexá-lo pelo histórico.";
            console.error("Falha no comprovante:", receiptError);
          }
        }
      }

      await loadData(false);

      notify(
        "Pagamento registrado. Confira os saldos atualizados." + receiptMessage,
        "success",
      );
    } catch (error) {
      notify(errorText(error), "error");
    } finally {
      setSaving(false);
    }
  }

  const filteredDebts = debts.filter((debt) => {
    const search = searchDebt.trim().toLocaleLowerCase("pt-BR");

    const matchesSearch =
      !search ||
      debt.name.toLocaleLowerCase("pt-BR").includes(search) ||
      (debt.creditor ?? "").toLocaleLowerCase("pt-BR").includes(search);

    const status = debtStatus(debt);

    const matchesStatus =
      debtStatusFilter === "todas" ||
      (debtStatusFilter === "pendentes" && status !== "Pago") ||
      (debtStatusFilter === "atrasadas" && status === "Atrasado") ||
      (debtStatusFilter === "pagas" && status === "Pago");

    return matchesSearch && matchesStatus;
  });

  const currentYear = new Date().getFullYear();

  const monthlyPayments = Array.from({ length: 12 }, (_, month) => {
    const total = payments
      .filter((payment) => {
        const date = new Date(`${payment.paid_at.slice(0, 10)}T12:00:00`);

        return (
          !Number.isNaN(date.getTime()) &&
          date.getFullYear() === currentYear &&
          date.getMonth() === month
        );
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
    1,
  );

  const paymentProgress =
    totalDebt > 0 ? Math.min(100, (totalPaid / totalDebt) * 100) : 0;

  const totalPayments = payments.reduce(
    (sum, payment) => sum + numberValue(payment.amount),
    0,
  );

  return (
    <main className="finance-page">
      <AppHeader />

      <style jsx>{`
        .finance-page {
          min-height: 100vh;
          padding: 28px 18px 48px;
          background: linear-gradient(135deg, #f0f5fb 0%, #f8fafc 100%);
          color: #172033;
        }

        .container {
          max-width: 1240px;
          margin: 0 auto;
        }

        .top {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          gap: 18px;
          margin: 12px 0 26px;
        }

        h1 {
          margin: 0;
          font-size: clamp(28px, 4vw, 38px);
          font-weight: 850;
          letter-spacing: -1px;
        }

        .muted {
          color: #64748b;
          margin: 7px 0 0;
          line-height: 1.6;
        }

        .nav {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .nav a,
        button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 0;
          border-radius: 10px;
          padding: 11px 14px;
          font-weight: 750;
          font-size: 13px;
          text-decoration: none;
          cursor: pointer;
          transition: transform 0.15s ease, opacity 0.15s ease;
        }

        .nav a {
          background: #fff;
          color: #1e293b;
          border: 1px solid #dbe3ee;
        }

        button:not(:disabled):hover,
        .nav a:hover {
          transform: translateY(-1px);
        }

        button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(185px, 1fr));
          gap: 14px;
          margin-bottom: 22px;
        }

        .card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 17px;
          padding: 21px;
          box-shadow: 0 6px 22px #0f172a08;
          margin-bottom: 18px;
          min-width: 0;
        }

        .stats .card {
          margin: 0;
          border: 0;
          color: white;
          min-width: 0;
          box-shadow: 0 8px 22px #0f172a12;
        }

        .stats .card:nth-child(1) {
          background: linear-gradient(135deg, #047857, #34d399);
        }

        .stats .card:nth-child(2) {
          background: linear-gradient(135deg, #1d4ed8, #60a5fa);
        }

        .stats .card:nth-child(3) {
          background: linear-gradient(135deg, #6d28d9, #a78bfa);
        }

        .stats .card:nth-child(4) {
          background: linear-gradient(135deg, #0f766e, #2dd4bf);
        }

        .stats .card:nth-child(5) {
          background: linear-gradient(135deg, #b91c1c, #fb7185);
        }

        .stats .card:nth-child(6) {
          background: linear-gradient(135deg, #334155, #64748b);
        }

        .stats .card:nth-child(7) {
          background: linear-gradient(135deg, #c2410c, #fb923c);
        }

        .stat-label {
          color: #64748b;
          font-size: 13px;
          font-weight: 750;
          line-height: 1.5;
        }

        .stats .stat-label {
          color: #ffffffdf;
        }

        .stat-value {
          margin-top: 8px;
          font-size: clamp(21px, 3vw, 27px);
          font-weight: 850;
          overflow-wrap: anywhere;
        }

        .stats .stat-value {
          color: white;
        }

        .stats .muted {
          color: #ffffffd9;
          font-size: 12px;
        }

        h2 {
          margin: 0 0 17px;
          font-size: 19px;
          letter-spacing: -0.25px;
        }

        .section-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 16px;
        }

        .section-heading h2 {
          margin: 0;
        }

        .section-heading a,
        .insight a {
          color: #0f766e;
          font-size: 13px;
          font-weight: 800;
          text-decoration: none;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 14px;
          align-items: end;
        }

        label {
          display: grid;
          gap: 7px;
          font-size: 13px;
          font-weight: 750;
          color: #475569;
          min-width: 0;
        }

        input,
        select {
          width: 100%;
          min-width: 0;
          padding: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: white;
          color: #172033;
          font: inherit;
          box-sizing: border-box;
        }

        input:focus,
        select:focus {
          outline: 3px solid #99f6e455;
          border-color: #0f766e;
        }

        input[type="file"] {
          font-size: 12px;
          padding: 9px;
        }

        button.primary {
          background: #0f766e;
          color: white;
        }

        button.secondary {
          background: #e8eef7;
          color: #1e293b;
        }

        button.danger {
          background: #fee2e2;
          color: #991b1b;
        }

        .account-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 13px;
        }

        .account {
          border: 1px solid #dce5ef;
          border-radius: 14px;
          padding: 17px;
          background: linear-gradient(180deg, #fff, #fbfdff);
          min-width: 0;
        }

        .account-name {
          font-weight: 850;
          overflow-wrap: anywhere;
        }

        .account-type {
          color: #64748b;
          font-size: 12px;
          margin-top: 5px;
          text-transform: capitalize;
        }

        .balance {
          font-size: 24px;
          font-weight: 850;
          margin: 13px 0;
          overflow-wrap: anywhere;
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
          border-radius: 13px;
          padding: 15px;
          background: #fff;
        }

        .debt-row.overdue {
          border-left-color: #dc2626;
        }

        .debt-row.soon {
          border-left-color: #f97316;
        }

        .debt-row.paid {
          border-left-color: #16a34a;
        }

        .debt-title {
          font-weight: 850;
          overflow-wrap: anywhere;
        }

        .debt-details {
          color: #64748b;
          font-size: 13px;
          margin-top: 5px;
          line-height: 1.6;
        }

        .status {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          background: #fef3c7;
          color: #92400e;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 850;
          white-space: nowrap;
        }

        .status.red {
          background: #fee2e2;
          color: #991b1b;
        }

        .status.green {
          background: #dcfce7;
          color: #166534;
        }

        .status.orange {
          background: #ffedd5;
          color: #9a3412;
        }

        .notice {
          border-radius: 12px;
          padding: 13px 15px;
          margin-bottom: 17px;
          overflow-wrap: anywhere;
          line-height: 1.6;
          border: 1px solid #bae6fd;
          background: #e0f2fe;
          color: #075985;
        }

        .notice.success {
          border-color: #bbf7d0;
          background: #dcfce7;
          color: #166534;
        }

        .notice.error {
          border-color: #fecaca;
          background: #fee2e2;
          color: #991b1b;
        }

        .empty {
          color: #64748b;
          padding: 10px 0;
          line-height: 1.7;
        }

        .table-wrap {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 650px;
          background: white;
        }

        th,
        td {
          padding: 13px 12px;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
          font-size: 13px;
          vertical-align: middle;
        }

        th {
          background: #f1f5f9;
          color: #475569;
          font-weight: 850;
          white-space: nowrap;
        }

        tbody tr:last-child td {
          border-bottom: 0;
        }

        tbody tr:hover {
          background: #f8fafc;
        }

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
          gap: 9px;
          height: 220px;
          padding: 20px 10px 0;
          border-bottom: 1px solid #cbd5e1;
          background: repeating-linear-gradient(
            to bottom,
            transparent 0,
            transparent 45px,
            #e2e8f0 46px
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
          min-height: 0;
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
          transition: width 0.25s ease;
        }

        .insight {
          background: #eff6ff;
          border: 1px solid #dbeafe;
          border-radius: 14px;
          padding: 20px;
        }

        .insight h3 {
          margin: 0 0 10px;
          font-size: 17px;
        }

        .insight p {
          color: #475569;
          font-size: 14px;
          line-height: 1.7;
        }

        .helper {
          color: #64748b;
          font-size: 12px;
          font-weight: 500;
          line-height: 1.5;
        }

        .receipt-name {
          overflow-wrap: anywhere;
          font-size: 12px;
          color: #475569;
        }

        @media (max-width: 720px) {
          .chart-layout {
            grid-template-columns: 1fr;
          }

          .chart {
            gap: 5px;
            height: 180px;
          }
        }

        @media (max-width: 520px) {
          .finance-page {
            padding: 19px 11px 32px;
          }

          .card {
            padding: 15px;
            border-radius: 14px;
          }

          .debt-row {
            grid-template-columns: 1fr;
          }

          .stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .stats .card {
            padding: 14px;
          }

          .stat-value {
            font-size: 20px;
          }

          .form-grid {
            grid-template-columns: 1fr;
          }

          .nav {
            width: 100%;
          }

          .nav a {
            flex: 1;
            text-align: center;
          }
        }
      `}</style>

      <div className="container">
        <header className="top">
          <div>
            <h1>Meu financeiro</h1>
            <p className="muted">
              Organize suas contas, acompanhe suas dívidas e registre pagamentos.
            </p>
          </div>

          <nav className="nav" aria-label="Navegação financeira">
            <Link href="/dashboard">Painel</Link>
            <Link href="/dividas">Minhas dívidas</Link>
          </nav>
        </header>

        {message && (
          <div
            className={`notice ${messageType}`}
            role={messageType === "error" ? "alert" : "status"}
          >
            {message}
          </div>
        )}

        {loading ? (
          <section className="card" aria-live="polite">
            Carregando suas informações financeiras...
          </section>
        ) : (
          <>
            <section className="stats" aria-label="Resumo financeiro">
              <article className="card">
                <div className="stat-label">Saldo das contas</div>
                <div className="stat-value">{money(totalWallets)}</div>
              </article>

              <article className="card">
                <div className="stat-label">Dívidas originais</div>
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
                <p className="muted">
                  Conforme os registros da tabela de despesas.
                </p>
              </article>

              <article className="card">
                <div className="stat-label">Despesas deste mês</div>
                <div className="stat-value">{money(monthlyExpenses)}</div>
                <p className="muted">
                  Calculadas pela data da despesa.
                </p>
              </article>
            </section>

            <section className="card">
              <div className="section-heading">
                <h2>Contas e carteiras</h2>
                <span className="status green">
                  {wallets.length} {wallets.length === 1 ? "conta" : "contas"}
                </span>
              </div>

              {wallets.length === 0 ? (
                <p className="empty">
                  Você ainda não cadastrou uma conta. Adicione sua conta bancária,
                  carteira digital ou dinheiro em espécie para acompanhar os saldos.
                </p>
              ) : (
                <div className="account-grid">
                  {wallets.map((wallet) => (
                    <article className="account" key={wallet.id}>
                      <div className="account-name">{wallet.name}</div>
                      <div className="account-type">
                        {wallet.account_type}
                      </div>

                      <div className="balance">
                        {money(numberValue(wallet.balance))}
                      </div>

                      <div className="actions">
                        <button
                          type="button"
                          className="secondary"
                          disabled={saving}
                          onClick={() => void adjustWallet(wallet, "add")}
                        >
                          + Adicionar
                        </button>

                        <button
                          type="button"
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
                    maxLength={100}
                    value={walletName}
                    onChange={(event) => setWalletName(event.target.value)}
                    placeholder="Ex.: Caixa Tem, Bradesco, dinheiro"
                  />
                </label>

                <label>
                  Tipo de conta
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

                <button
                  className="primary"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? "Salvando..." : "Adicionar conta"}
                </button>
              </form>
            </section>

            <section className="card">
              <h2>Registrar pagamento de dívida</h2>

              {pendingDebts.length === 0 ? (
                <p className="empty">
                  Você não tem dívidas com saldo pendente. Se precisar, cadastre
                  uma nova dívida na página Minhas dívidas.
                </p>
              ) : wallets.length === 0 ? (
                <p className="empty">
                  Cadastre primeiro uma conta ou carteira para selecionar de
                  onde sairá o pagamento.
                </p>
              ) : (
                <form className="form-grid" onSubmit={registerPayment}>
                  <label>
                    Dívida
                    <select
                      required
                      value={selectedDebt}
                      onChange={(event) => {
                        const id = event.target.value;
                        setSelectedDebt(id);

                        const debt = debts.find((item) => item.id === id);

                        setPaymentAmount(
                          debt
                            ? remaining(debt).toFixed(2).replace(".", ",")
                            : "",
                        );
                      }}
                    >
                      <option value="">Selecione uma dívida</option>

                      {pendingDebts.map((debt) => (
                        <option key={debt.id} value={debt.id}>
                          {debt.name} — restante {money(remaining(debt))}
                        </option>
                      ))}
                    </select>

                    {selectedDebtData && (
                      <span className="helper">
                        Saldo restante: {money(remaining(selectedDebtData))}
                      </span>
                    )}
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

                    {selectedWalletData && (
                      <span className="helper">
                        Saldo disponível:{" "}
                        {money(numberValue(selectedWalletData.balance))}
                      </span>
                    )}
                  </label>

                  <label>
                    Valor do pagamento (R$)
                    <input
                      required
                      inputMode="decimal"
                      value={paymentAmount}
                      onChange={(event) => setPaymentAmount(event.target.value)}
                      placeholder="0,00"
                    />
                    <span className="helper">
                      Você pode registrar um pagamento parcial.
                    </span>
                  </label>

                  <label>
                    Data do pagamento
                    <input
                      required
                      type="date"
                      max={localToday()}
                      value={paymentDate}
                      onChange={(event) => setPaymentDate(event.target.value)}
                    />
                  </label>

                  <label>
                    Comprovante (opcional)
                    <input
                      type="file"
                      accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        setReceiptFile(event.target.files?.[0] ?? null)
                      }
                    />
                    <span className="helper">
                      PDF, JPG, PNG ou WebP. Máximo de 10 MB.
                    </span>
                  </label>

                  <label>
                    Foto do comprovante (opcional)
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      onChange={(event) =>
                        setReceiptFile(event.target.files?.[0] ?? null)
                      }
                    />
                    <span className="helper">
                      No celular, você pode tirar uma foto.
                    </span>
                  </label>

                  {receiptFile && (
                    <div>
                      <p className="receipt-name">
                        Arquivo selecionado: {receiptFile.name}
                      </p>

                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setReceiptFile(null)}
                      >
                        Remover comprovante
                      </button>
                    </div>
                  )}

                  <button
                    className="primary"
                    disabled={saving || !paymentCanBeRegistered}
                    type="submit"
                  >
                    {saving ? "Registrando pagamento..." : "Confirmar pagamento"}
                  </button>
                </form>
              )}

              <p className="muted">
                O pagamento deve ser processado pela função SQL do banco para
                manter a carteira, a dívida e o histórico sincronizados.
              </p>
            </section>

            <section className="card">
              <div className="section-heading">
                <h2>Minhas dívidas</h2>
                <Link href="/dividas">Gerenciar dívidas →</Link>
              </div>

              <div className="form-grid" style={{ marginBottom: 18 }}>
                <label>
                  Buscar dívida ou credor
                  <input
                    type="search"
                    value={searchDebt}
                    onChange={(event) => setSearchDebt(event.target.value)}
                    placeholder="Digite um nome..."
                  />
                </label>

                <label>
                  Filtrar por situação
                  <select
                    value={debtStatusFilter}
                    onChange={(event) => setDebtStatusFilter(event.target.value)}
                  >
                    <option value="todas">Todas as dívidas</option>
                    <option value="pendentes">Pendentes</option>
                    <option value="atrasadas">Atrasadas</option>
                    <option value="pagas">Pagas</option>
                  </select>
                </label>
              </div>

              {debts.length === 0 ? (
                <p className="empty">
                  Nenhuma dívida cadastrada. Acesse Minhas dívidas para começar.
                </p>
              ) : filteredDebts.length === 0 ? (
                <p className="empty">
                  Nenhuma dívida corresponde à busca e ao filtro selecionados.
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
                        <th>Situação</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredDebts.map((debt) => {
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
                            <td>
                              <strong>{debt.name}</strong>
                              {debt.category && (
                                <div className="helper">{debt.category}</div>
                              )}
                            </td>

                            <td>{debt.creditor || "—"}</td>

                            <td>{money(numberValue(debt.amount))}</td>

                            <td>{money(numberValue(debt.paid_amount))}</td>

                            <td>
                              <strong>{money(remaining(debt))}</strong>
                            </td>

                            <td>{formatDate(debt.due_date)}</td>

                            <td>
                              <span className={badge}>{status}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card">
              <div className="section-heading">
                <h2>Histórico de pagamentos</h2>
                <span className="status green">
                  {payments.length} {payments.length === 1 ? "registro" : "registros"}
                </span>
              </div>

              <input
                ref={historyReceiptInput}
                type="file"
                accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
                hidden
                onChange={handleHistoryReceiptChange}
              />

              {payments.length === 0 ? (
                <p className="empty">
                  Os pagamentos confirmados aparecerão aqui com a data, a dívida,
                  a conta utilizada e o comprovante, quando houver.
                </p>
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
                      {payments.map((payment) => {
                        const receipt = receiptByPaymentId.get(payment.id);

                        return (
                          <tr key={payment.id}>
                            <td>{formatDate(payment.paid_at)}</td>

                            <td>
                              {debtById.get(payment.debt_id)?.name ?? "Dívida"}
                            </td>

                            <td>
                              {walletById.get(payment.account_id)?.name ?? "Conta"}
                            </td>

                            <td>
                              <strong>{money(numberValue(payment.amount))}</strong>
                            </td>

                            <td>
                              {receipt ? (
                                <button
                                  type="button"
                                  className="secondary"
                                  onClick={() => void openReceipt(receipt)}
                                >
                                  Ver comprovante
                                </button>
                              ) : (
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
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="muted">
                Total registrado no histórico: {money(totalPayments)}.
              </p>
            </section>

            <section className="card">
              <div className="section-heading">
                <div>
                  <h2>Visão geral do financeiro</h2>
                  <p className="muted">
                    Pagamentos registrados mês a mês em {currentYear}.
                  </p>
                </div>
              </div>

              <div className="chart-layout">
                <div>
                  <div
                    className="chart"
                    role="img"
                    aria-label={`Gráfico de pagamentos mensais de ${currentYear}`}
                  >
                    {monthlyPayments.map((item) => (
                      <div className="chart-column" key={item.label}>
                        <div
                          className="chart-bar"
                          title={`${item.label}: ${money(item.total)}`}
                          style={{
                            height:
                              item.total > 0
                                ? `${Math.max(
                                    4,
                                    (item.total / maxMonthlyPayment) * 100,
                                  )}%`
                                : "0%",
                          }}
                        />

                        <span className="chart-label">{item.label}</span>
                      </div>
                    ))}
                  </div>

                  <p className="muted">
                    Total pago em todos os registros: {money(totalPayments)}.
                  </p>
                </div>

                <aside className="insight">
                  <h3>Progresso das dívidas</h3>

                  <div className="stat-value">
                    {paymentProgress.toLocaleString("pt-BR", {
                      maximumFractionDigits: 1,
                    })}
                    %
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
                    Valor já pago: <strong>{money(totalPaid)}</strong>
                  </p>

                  <p>
                    Valor original: <strong>{money(totalDebt)}</strong>
                  </p>

                  <p>
                    Saldo restante: <strong>{money(totalRemaining)}</strong>
                  </p>

                  <Link href="/dividas">Organizar minhas dívidas →</Link>
                </aside>
              </div>
            </section>

            <div className="actions" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="secondary"
                disabled={saving || receiptBusy}
                onClick={() => void loadData()}
              >
                Atualizar informações
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
        }
