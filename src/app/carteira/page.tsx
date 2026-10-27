"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Wallet = {
  id: string;
  name: string;
  account_type: string;
  balance: number | string;
};

const ACCOUNT_TYPES = [
  { value: "banco", label: "Conta bancária" },
  { value: "dinheiro", label: "Dinheiro em mãos" },
  { value: "digital", label: "Carteira digital" },
  { value: "poupanca", label: "Poupança" },
  { value: "outro", label: "Outra conta" },
];

const money = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export default function CarteiraPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState("banco");
  const [balance, setBalance] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadWallets = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      const user = authData.user;
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data, error: queryError } = await supabase
        .from("wallet_accounts")
        .select("id,name,account_type,balance")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (queryError) throw queryError;

      setWallets((data ?? []) as Wallet[]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar suas contas."
      );
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void loadWallets();
  }, [loadWallets]);

  const total = wallets.reduce(
    (sum, wallet) => sum + Number(wallet.balance || 0),
    0
  );

  function resetForm() {
    setName("");
    setAccountType("banco");
    setBalance("");
    setEditingId(null);
  }

  function startEdit(wallet: Wallet) {
    setEditingId(wallet.id);
    setName(wallet.name);
    setAccountType(wallet.account_type);
    setBalance(String(wallet.balance ?? 0).replace(".", ","));
    setError("");
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveWallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const parsedBalance = Number(balance.trim().replace(/\./g, "").replace(",", "."));

    if (!name.trim()) {
      setError("Informe o nome da conta.");
      return;
    }

    if (!balance.trim() || !Number.isFinite(parsedBalance) || parsedBalance < 0) {
      setError("Informe um saldo válido, igual ou maior que zero.");
      return;
    }

    setSaving(true);

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;
      if (!authData.user) {
        router.replace("/login");
        return;
      }

      const values = {
        name: name.trim(),
        account_type: accountType,
        balance: parsedBalance,
      };

      const result = editingId
        ? await supabase
            .from("wallet_accounts")
            .update(values)
            .eq("id", editingId)
            .eq("user_id", authData.user.id)
        : await supabase.from("wallet_accounts").insert({
            ...values,
            user_id: authData.user.id,
          });

      if (result.error) throw result.error;

      resetForm();
      setNotice(editingId ? "Conta atualizada." : "Conta adicionada à Carteira.");
      await loadWallets();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar a conta."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteWallet(wallet: Wallet) {
    const confirmed = window.confirm(
      `Excluir "${wallet.name}"? Se esta conta estiver vinculada a pagamentos, o banco poderá impedir a exclusão.`
    );
    if (!confirmed) return;

    setBusyId(wallet.id);
    setError("");
    setNotice("");

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;
      if (!authData.user) {
        router.replace("/login");
        return;
      }

      const { error: deleteError } = await supabase
        .from("wallet_accounts")
        .delete()
        .eq("id", wallet.id)
        .eq("user_id", authData.user.id);

      if (deleteError) throw deleteError;

      if (editingId === wallet.id) resetForm();
      setNotice("Conta excluída.");
      await loadWallets();
    } catch {
      setError(
        "Não foi possível excluir esta conta. Ela pode estar vinculada a pagamentos registrados. Preserve o histórico e tente editar a conta em vez de excluí-la."
      );
    } finally {
      setBusyId(null);
    }
  }

  function typeLabel(value: string) {
    return ACCOUNT_TYPES.find((item) => item.value === value)?.label ?? value;
  }

  return (
    <main className="page-container">
      <div className="page-heading">
        <div>
          <p className="muted">RESGATA · ORGANIZAÇÃO FINANCEIRA</p>
          <h1>Minha Carteira</h1>
          <p className="muted">
            Reúna os saldos dos seus bancos, dinheiro em mãos e carteiras digitais.
          </p>
        </div>
      </div>

      {error && <p className="error-message" role="alert">{error}</p>}
      {notice && <p className="success-message" role="status">{notice}</p>}

      <section className="card" aria-labelledby="wallet-total-title">
        <p className="muted" id="wallet-total-title">Saldo total das contas cadastradas</p>
        <div className="stat-value">{money(total)}</div>
        <p className="muted">
          {wallets.length} {wallets.length === 1 ? "conta cadastrada" : "contas cadastradas"}
        </p>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>{editingId ? "Editar conta" : "Adicionar conta"}</h2>
            <p className="muted">
              Informe o saldo atual. Use um registro para cada conta ou carteira.
            </p>
          </div>
        </div>

        <form onSubmit={saveWallet}>
          <div className="form-grid">
            <label>
              Nome da conta
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Banco principal, dinheiro"
                maxLength={80}
                required
              />
            </label>

            <label>
              Tipo de conta
              <select
                value={accountType}
                onChange={(event) => setAccountType(event.target.value)}
              >
                {ACCOUNT_TYPES.map((item) => (
                  <option value={item.value} key={item.value}>{item.label}</option>
                ))}
              </select>
            </label>

            <label>
              Saldo atual (R$)
              <input
                inputMode="decimal"
                value={balance}
                onChange={(event) => setBalance(event.target.value)}
                placeholder="0,00"
                required
              />
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar à Carteira"}
            </button>
            {editingId && (
              <button type="button" className="secondary" onClick={resetForm}>
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Suas contas</h2>
            <p className="muted">
              Os saldos são os registrados nas contas e podem ser atualizados por você.
            </p>
          </div>
        </div>

        {loading ? (
          <p>Carregando suas contas...</p>
        ) : wallets.length === 0 ? (
          <div>
            <p>Você ainda não cadastrou nenhuma conta.</p>
            <p className="muted">
              Adicione seu primeiro banco, carteira digital ou valor em dinheiro.
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Conta</th>
                  <th>Tipo</th>
                  <th>Saldo</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {wallets.map((wallet) => (
                  <tr key={wallet.id}>
                    <td>{wallet.name}</td>
                    <td>{typeLabel(wallet.account_type)}</td>
                    <td>{money(Number(wallet.balance || 0))}</td>
                    <td>
                      <div className="form-actions">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => startEdit(wallet)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busyId === wallet.id}
                          onClick={() => void deleteWallet(wallet)}
                        >
                          {busyId === wallet.id ? "Excluindo..." : "Excluir"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Próximo passo</h2>
        <p className="muted">
          A página Finanças continua sendo responsável pelo acompanhamento das dívidas e pagamentos.
          A Carteira centraliza as contas usadas no sistema.
        </p>
        <p><Link href="/financeiro">Ir para Finanças →</Link></p>
      </section>
    </main>
  );
}
