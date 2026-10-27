"use client";
import Link from "next/link";
import {
useCallback,
useEffect,
useMemo,
useState,
type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import "./carteira.css";
type Wallet = {
id: string;
name: string;
account_type: string;
balance: number | string | null;
};
const ACCOUNT_TYPES = [
{ value: "banco", label: "Conta bancária", icon: "🏦" },
{ value: "dinheiro", label: "Dinheiro em mãos", icon: "💵" },
{ value: "digital", label: "Carteira digital", icon: "📱" },
{ value: "poupanca", label: "Poupança", icon: "🐷" },
{ value: "outro", label: "Outra conta", icon: "💳" },
];
function money(value: number): string {
return value.toLocaleString("pt-BR", {
style: "currency",
currency: "BRL",
});
}
/**
Aceita valores como:
1234
1234,56
1.234,56
1234.56

Se houver vírgula, ela será considerada o separador decimal brasileiro.
Sem vírgula, um ponto será considerado separador decimal.
*/
function parseBalance(value: string): number | null {
const cleaned = value.trim().replace(/\s/g, "");
if (!cleaned) return null;
let normalized: string;
if (cleaned.includes(",")) {
normalized = cleaned.replace(/./g, "").replace(",", ".");
} else {
normalized = cleaned;
}
if (!/^\d+(.\d{1,2})?$/.test(normalized)) {
return null;
}
const parsed = Number(normalized);
if (!Number.isFinite(parsed) || parsed < 0) {
return null;
}
return Math.round((parsed + Number.EPSILON) * 100) / 100;
}
function getAccountType(value: string) {
return (
ACCOUNT_TYPES.find((item) => item.value === value) ?? {
value,
label: value || "Outra conta",
icon: "💳",
}
);
}
export default function CarteiraPage() {
const supabase = useMemo(() => getSupabaseBrowserClient(), []);
const router = useRouter();
const [wallets, setWallets] = useState<Wallet[]>([]);
const [name, setName] = useState("");
const [accountType, setAccountType] = useState("banco");
const [balance, setBalance] = useState("");
const [search, setSearch] = useState("");
const [editingId, setEditingId] = useState<string | null>(null);
const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
const [busyId, setBusyId] = useState<string | null>(null);
const [error, setError] = useState("");
const [notice, setNotice] = useState("");
const [showBalance, setShowBalance] = useState(true);
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
const total = useMemo(
() =>
wallets.reduce(
(sum, wallet) => sum + Number(wallet.balance ?? 0),
0
),
[wallets]
);
const filteredWallets = useMemo(() => {
const term = search.trim().toLocaleLowerCase("pt-BR");
if (!term) return wallets;

return wallets.filter((wallet) => {
  const type = getAccountType(wallet.account_type).label;

  return (
    wallet.name.toLocaleLowerCase("pt-BR").includes(term) ||
    type.toLocaleLowerCase("pt-BR").includes(term)
  );
});

}, [wallets, search]);
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
setBalance(
Number(wallet.balance ?? 0).toLocaleString("pt-BR", {
minimumFractionDigits: 2,
maximumFractionDigits: 2,
useGrouping: false,
})
);
setError("");
setNotice("");
window.scrollTo({ top: 0, behavior: "smooth" });

}
async function saveWallet(event: FormEvent) {
event.preventDefault();
setError("");
setNotice("");
const normalizedName = name.trim();
const parsedBalance = parseBalance(balance);

if (!normalizedName) {
  setError("Informe o nome da conta.");
  return;
}

if (normalizedName.length > 80) {
  setError("O nome da conta deve ter no máximo 80 caracteres.");
  return;
}

if (parsedBalance === null) {
  setError(
    "Informe um saldo válido. Exemplos: 1500, 1500,50 ou 1.500,50."
  );
  return;
}

const duplicate = wallets.some(
  (wallet) =>
    wallet.id !== editingId &&
    wallet.name.trim().toLocaleLowerCase("pt-BR") ===
      normalizedName.toLocaleLowerCase("pt-BR") &&
    wallet.account_type === accountType
);

if (duplicate) {
  setError(
    "Já existe uma conta com esse nome e tipo. Verifique antes de cadastrar outra."
  );
  return;
}

setSaving(true);

try {
  const { data: authData, error: authError } =
    await supabase.auth.getUser();

  if (authError) throw authError;

  const user = authData.user;

  if (!user) {
    router.replace("/login");
    return;
  }

  const values = {
    name: normalizedName,
    account_type: accountType,
    balance: parsedBalance,
  };

  if (editingId) {
    const { error: updateError } = await supabase
      .from("wallet_accounts")
      .update(values)
      .eq("id", editingId)
      .eq("user_id", user.id);

    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await supabase
      .from("wallet_accounts")
      .insert({
        ...values,
        user_id: user.id,
      });

    if (insertError) throw insertError;
  }

  const wasEditing = Boolean(editingId);

  resetForm();

  setNotice(
    wasEditing
      ? "Conta atualizada com sucesso."
      : "Conta adicionada à sua Carteira."
  );

  await loadWallets();
} catch (err) {
  setError(
    err instanceof Error
      ? `Não foi possível salvar a conta: ${err.message}`
      : "Não foi possível salvar a conta."
  );
} finally {
  setSaving(false);
}

}
async function deleteWallet(wallet: Wallet) {
const confirmed = window.confirm(
Deseja realmente excluir a conta "${wallet.name}"?\n\nEssa ação não pode ser desfeita. Se houver pagamentos vinculados, o sistema poderá impedir a exclusão.
);
if (!confirmed) return;

setBusyId(wallet.id);
setError("");
setNotice("");

try {
  const { data: authData, error: authError } =
    await supabase.auth.getUser();

  if (authError) throw authError;

  const user = authData.user;

  if (!user) {
    router.replace("/login");
    return;
  }

  const { error: deleteError } = await supabase
    .from("wallet_accounts")
    .delete()
    .eq("id", wallet.id)
    .eq("user_id", user.id);

  if (deleteError) throw deleteError;

  if (editingId === wallet.id) {
    resetForm();
  }

  setNotice("Conta excluída com sucesso.");
  await loadWallets();
} catch {
  setError(
    "Não foi possível excluir essa conta. Ela pode estar vinculada a pagamentos ou outros registros. Para preservar o histórico, tente editar a conta em vez de excluí-la."
  );
} finally {
  setBusyId(null);
}

}
function renderBalance(value: number) {
return showBalance ? money(value) : "R$ ••••••";
}
return (




← Voltar para Finanças
      <p className="wallet-eyebrow">RESGATA+ · ORGANIZAÇÃO FINANCEIRA</p>

      <h1>Minha Carteira</h1>

      <p className="wallet-subtitle">
        Organize suas contas e acompanhe o dinheiro que você tem disponível.
      </p>
    </div>

    <div className="wallet-header-icon" aria-hidden="true">
      💼
    </div>
  </header>

  {error && (
    <div className="wallet-alert wallet-alert-error" role="alert">
      <span aria-hidden="true">⚠️</span>
      <p>{error}</p>
      <button
        type="button"
        className="wallet-alert-close"
        aria-label="Fechar mensagem de erro"
        onClick={() => setError("")}
      >
        ×
      </button>
    </div>
  )}

  {notice && (
    <div className="wallet-alert wallet-alert-success" role="status">
      <span aria-hidden="true">✓</span>
      <p>{notice}</p>
      <button
        type="button"
        className="wallet-alert-close"
        aria-label="Fechar mensagem"
        onClick={() => setNotice("")}
      >
        ×
      </button>
    </div>
  )}

  <section className="wallet-summary" aria-labelledby="wallet-total-title">
    <div className="wallet-summary-top">
      <div>
        <p className="wallet-summary-label" id="wallet-total-title">
          Saldo total cadastrado
        </p>

        <p className="wallet-total">
          {renderBalance(total)}
        </p>

        <p className="wallet-summary-caption">
          Soma dos saldos informados nas suas contas.
        </p>
      </div>

      <button
        type="button"
        className="wallet-visibility-button"
        onClick={() => setShowBalance((current) => !current)}
        aria-label={showBalance ? "Ocultar saldos" : "Mostrar saldos"}
      >
        {showBalance ? "◉ Ocultar" : "◎ Mostrar"}
      </button>
    </div>

    <div className="wallet-summary-footer">
      <div className="wallet-summary-stat">
        <span className="wallet-stat-icon" aria-hidden="true">
          🏦
        </span>
        <div>
          <strong>{wallets.length}</strong>
          <span>
            {wallets.length === 1 ? "conta cadastrada" : "contas cadastradas"}
          </span>
        </div>
      </div>

      <div className="wallet-summary-stat">
        <span className="wallet-stat-icon" aria-hidden="true">
          📊
        </span>
        <div>
          <strong>
            {new Set(wallets.map((wallet) => wallet.account_type)).size}
          </strong>
          <span>
            {new Set(wallets.map((wallet) => wallet.account_type)).size === 1
              ? "tipo de conta"
              : "tipos de conta"}
          </span>
        </div>
      </div>
    </div>
  </section>

  <section className="wallet-panel" aria-labelledby="wallet-form-title">
    <div className="wallet-panel-heading">
      <div className="wallet-heading-icon" aria-hidden="true">
        {editingId ? "✏️" : "＋"}
      </div>

      <div>
        <h2 id="wallet-form-title">
          {editingId ? "Editar conta" : "Adicionar conta"}
        </h2>
        <p>
          {editingId
            ? "Atualize as informações da conta selecionada."
            : "Cadastre um banco, uma carteira digital ou dinheiro em mãos."}
        </p>
      </div>
    </div>

    <form onSubmit={saveWallet} className="wallet-form">
      <div className="wallet-form-grid">
        <label className="wallet-field">
          <span>Nome da conta</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Banco principal"
            maxLength={80}
            autoComplete="off"
            required
          />
          <small>Escolha um nome fácil de identificar.</small>
        </label>

        <label className="wallet-field">
          <span>Tipo de conta</span>
          <select
            value={accountType}
            onChange={(event) => setAccountType(event.target.value)}
            required
          >
            {ACCOUNT_TYPES.map((item) => (
              <option value={item.value} key={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <small>Selecione a categoria que melhor corresponde.</small>
        </label>

        <label className="wallet-field">
          <span>Saldo atual (R$)</span>
          <input
            type="text"
            inputMode="decimal"
            value={balance}
            onChange={(event) => setBalance(event.target.value)}
            placeholder="0,00"
            autoComplete="off"
            required
          />
          <small>Exemplo: 1.250,50. Não inclua o símbolo R$.</small>
        </label>
      </div>

      <div className="wallet-form-actions">
        <button
          type="submit"
          className="wallet-button wallet-button-primary"
          disabled={saving}
        >
          {saving
            ? "Salvando..."
            : editingId
              ? "Salvar alterações"
              : "＋ Adicionar conta"}
        </button>

        {editingId && (
          <button
            type="button"
            className="wallet-button wallet-button-secondary"
            onClick={() => {
              resetForm();
              setError("");
              setNotice("");
            }}
            disabled={saving}
          >
            Cancelar edição
          </button>
        )}
      </div>
    </form>
  </section>

  <section className="wallet-panel" aria-labelledby="wallet-list-title">
    <div className="wallet-list-heading">
      <div className="wallet-panel-heading wallet-panel-heading-compact">
        <div className="wallet-heading-icon" aria-hidden="true">
          📋
        </div>

        <div>
          <h2 id="wallet-list-title">Suas contas</h2>
          <p>Consulte, edite ou exclua os registros da sua Carteira.</p>
        </div>
      </div>

      <span className="wallet-count-badge">
        {wallets.length} {wallets.length === 1 ? "conta" : "contas"}
      </span>
    </div>

    <div className="wallet-search">
      <span aria-hidden="true">⌕</span>
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Pesquisar por nome ou tipo de conta..."
        aria-label="Pesquisar contas"
      />

      {search && (
        <button
          type="button"
          onClick={() => setSearch("")}
          aria-label="Limpar pesquisa"
        >
          ×
        </button>
      )}
    </div>

    {loading ? (
      <div className="wallet-state">
        <span className="wallet-spinner" aria-hidden="true" />
        <p>Carregando suas contas...</p>
      </div>
    ) : wallets.length === 0 ? (
      <div className="wallet-empty">
        <div className="wallet-empty-icon" aria-hidden="true">
          👛
        </div>
        <h3>Sua Carteira está vazia</h3>
        <p>
          Cadastre sua primeira conta no formulário acima para começar a
          acompanhar seus saldos.
        </p>
      </div>
    ) : filteredWallets.length === 0 ? (
      <div className="wallet-state">
        <p>Nenhuma conta encontrada para essa pesquisa.</p>
        <button
          type="button"
          className="wallet-button wallet-button-secondary"
          onClick={() => setSearch("")}
        >
          Limpar pesquisa
        </button>
      </div>
    ) : (
      <div className="wallet-account-list">
        {filteredWallets.map((wallet) => {
          const type = getAccountType(wallet.account_type);
          const isBusy = busyId === wallet.id;

          return (
            <article className="wallet-account-card" key={wallet.id}>
              <div className="wallet-account-main">
                <div className="wallet-account-icon" aria-hidden="true">
                  {type.icon}
                </div>

                <div className="wallet-account-info">
                  <h3>{wallet.name}</h3>
                  <span className="wallet-account-type">{type.label}</span>
                </div>
              </div>

              <div className="wallet-account-balance">
                <span>Saldo registrado</span>
                <strong>
                  {renderBalance(Number(wallet.balance ?? 0))}
                </strong>
              </div>

              <div className="wallet-account-actions">
                <button
                  type="button"
                  className="wallet-button wallet-button-secondary"
                  onClick={() => startEdit(wallet)}
                  disabled={saving || busyId !== null}
                >
                  Editar
                </button>

                <button
                  type="button"
                  className="wallet-button wallet-button-danger"
                  onClick={() => void deleteWallet(wallet)}
                  disabled={isBusy || saving || busyId !== null}
                >
                  {isBusy ? "Excluindo..." : "Excluir"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    )}

    {!loading && wallets.length > 0 && (
      <p className="wallet-list-footnote">
        Exibindo {filteredWallets.length} de {wallets.length}{" "}
        {wallets.length === 1 ? "conta cadastrada" : "contas cadastradas"}.
      </p>
    )}
  </section>

  <section className="wallet-info-panel">
    <div className="wallet-info-icon" aria-hidden="true">
      💡
    </div>

    <div>
      <h2>Organize suas finanças em um só lugar</h2>
      <p>
        A Carteira registra os saldos que você informa. Ela não consulta
        automaticamente os bancos e não desconta pagamentos ou dívidas
        deste total.
      </p>
      <Link href="/financeiro" className="wallet-finance-link">
        Acessar Finanças <span aria-hidden="true">→</span>
      </Link>
    </div>
  </section>
</main>

);
  }
