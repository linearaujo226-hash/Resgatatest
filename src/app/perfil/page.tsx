"use client";

import AppHeader from "@/components/AppHeader";
import Link from "next/link";
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function ProfilePage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [initialName, setInitialName] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const supabase = getSupabaseBrowserClient();

        const { data, error: authError } =
          await supabase.auth.getUser();

        if (authError) throw authError;

        if (!data.user) {
          router.replace("/login");
          return;
        }

        const user = data.user;

        const metadataName = String(
          user.user_metadata?.name || ""
        );

        let profileName = metadataName;

        // Busca o perfil salvo no banco.
        const { data: profile, error: profileError } =
          await supabase
            .from("users")
            .select("name, email")
            .eq("id", user.id)
            .maybeSingle();

        if (profileError) {
          console.error(
            "Erro ao carregar perfil:",
            profileError.message
          );
        }

        if (profile?.name) {
          profileName = profile.name;
        }

        if (!active) return;

        setName(profileName);
        setInitialName(profileName);
        setEmail(user.email || profile?.email || "");
      } catch (err) {
        if (!active) return;

        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar seu perfil."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [router]);

  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "U";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setMessage("");

    const normalizedName = name.trim();

    if (!normalizedName) {
      setError("Informe seu nome completo.");
      return;
    }

    if (normalizedName.length > 120) {
      setError("O nome deve ter no máximo 120 caracteres.");
      return;
    }

    setSaving(true);

    try {
      const supabase = getSupabaseBrowserClient();

      const { data, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      if (!data.user) {
        router.replace("/login");
        return;
      }

      const user = data.user;

      // Atualiza os metadados da conta autenticada.
      const { error: updateError } =
        await supabase.auth.updateUser({
          data: {
            ...user.user_metadata,
            name: normalizedName,
          },
        });

      if (updateError) {
        throw updateError;
      }

      // Atualiza o perfil na tabela users.
      const { error: profileError } = await supabase
        .from("users")
        .upsert(
          {
            id: user.id,
            name: normalizedName,
            email: user.email || email,
          },
          {
            onConflict: "id",
          }
        );

      if (profileError) {
        throw new Error(
          "Seu nome foi atualizado na autenticação, " +
          "mas não foi possível sincronizar o perfil no banco. " +
          "Verifique as permissões da tabela users e tente novamente."
        );
      }

      setName(normalizedName);
      setInitialName(normalizedName);
      setMessage("Seus dados foram atualizados com sucesso.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível salvar suas alterações."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="container page profile-page">
      <AppHeader />

      <nav className="nav profile-nav">
        <Link className="brand" href="/">
          Resgata<span> Dívidas</span>
        </Link>

        <div className="navlinks">
          <Link href="/dashboard">Painel</Link>
          <Link href="/dividas">Dívidas</Link>
          <Link href="/apostas">Hábitos &amp; Controle</Link>
        </div>
      </nav>

      <header className="profile-heading">
        <div>
          <span className="profile-eyebrow">
            MINHA CONTA
          </span>

          <h1>Meu perfil</h1>

          <p>
            Gerencie seus dados pessoais e acompanhe
            as configurações da sua conta.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="profile-back-button"
        >
          ← Voltar ao painel
        </Link>
      </header>

      {loading ? (
        <section className="profile-card">
          <div className="profile-loading">
            <div className="profile-spinner" />
            <p>Carregando seus dados...</p>
          </div>
        </section>
      ) : (
        <>
          {error && (
            <div className="profile-alert profile-alert-error" role="alert">
              <span aria-hidden="true">!</span>
              <p>{error}</p>
            </div>
          )}

          {message && (
            <div
              className="profile-alert profile-alert-success"
              role="status"
            >
              <span aria-hidden="true">✓</span>
              <p>{message}</p>
            </div>
          )}

          <div className="profile-layout">
            <div className="profile-main-column">
              <section className="profile-card">
                <div className="profile-card-heading">
                  <div>
                    <h2>Dados pessoais</h2>
                    <p>
                      Mantenha suas informações atualizadas.
                    </p>
                  </div>

                  <span className="profile-section-icon">
                    👤
                  </span>
                </div>

                <div className="profile-identity">
                  <div className="profile-avatar">
                    {initials}
                  </div>

                  <div className="profile-identity-info">
                    <strong>
                      {name.trim() || "Seu nome"}
                    </strong>

                    <span>{email}</span>

                    <span className="profile-account-badge">
                      <span />
                      Conta autenticada
                    </span>
                  </div>
                </div>

                <div className="profile-divider" />

                <form
                  className="form profile-form"
                  onSubmit={save}
                >
                  <label className="field">
                    Nome completo

                    <input
                      type="text"
                      name="name"
                      autoComplete="name"
                      required
                      maxLength={120}
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        setMessage("");
                      }}
                      placeholder="Digite seu nome completo"
                      disabled={saving}
                    />

                    <small>
                      Esse nome será utilizado no seu perfil.
                    </small>
                  </label>

                  <label className="field">
                    E-mail da conta

                    <input
                      type="email"
                      name="email"
                      autoComplete="email"
                      value={email}
                      disabled
                      readOnly
                    />

                    <small>
                      O e-mail está vinculado à sua autenticação.
                      A alteração deve ser feita pelo fluxo de
                      atualização de e-mail da conta.
                    </small>
                  </label>

                  <div className="profile-form-footer">
                    <span className="profile-save-hint">
                      {name.trim() !== initialName
                        ? "Você tem alterações não salvas."
                        : "Seus dados estão atualizados."}
                    </span>

                    <button
                      type="submit"
                      className="btn primary profile-save-button"
                      disabled={
                        saving ||
                        !name.trim() ||
                        name.trim() === initialName
                      }
                    >
                      {saving
                        ? "Salvando..."
                        : "Salvar alterações"}
                    </button>
                  </div>
                </form>
              </section>

              <section className="profile-card">
                <div className="profile-card-heading">
                  <div>
                    <h2>Segurança da conta</h2>
                    <p>
                      Cuide do acesso à sua conta pessoal.
                    </p>
                  </div>

                  <span className="profile-section-icon">
                    🔒
                  </span>
                </div>

                <div className="profile-security-item">
                  <div className="profile-security-icon">
                    ✓
                  </div>

                  <div>
                    <strong>Autenticação ativa</strong>
                    <p>
                      Você está utilizando uma conta autenticada
                      pelo sistema.
                    </p>
                  </div>
                </div>

                <div className="profile-security-item">
                  <div className="profile-security-icon">
                    ✉
                  </div>

                  <div>
                    <strong>E-mail da conta</strong>
                    <p>
                      {email || "Nenhum e-mail disponível"}
                    </p>
                  </div>
                </div>

                <div className="profile-security-note">
                  <strong>Proteção da conta</strong>
                  <p>
                    Nunca compartilhe sua senha ou códigos de
                    verificação. Para alterar sua senha, utilize
                    o fluxo de recuperação de senha do sistema.
                  </p>
                </div>
              </section>
            </div>

            <aside className="profile-side-column">
              <section className="profile-card profile-plan-card">
                <div className="profile-plan-top">
                  <span className="profile-plan-icon">
                    ✦
                  </span>

                  <span className="profile-plan-label">
                    ASSINATURA
                  </span>
                </div>

                <h2>Seu plano</h2>

                <p className="profile-plan-description">
                  Consulte as condições de acesso à plataforma
                  Resgata Dívidas.
                </p>

                <div className="profile-plan-price">
                  <span>R$</span>
                  <strong>9,90</strong>
                  <span>/mês</span>
                </div>

                <p className="profile-plan-caption">
                  Preço mensal previsto
                </p>

                <div className="profile-plan-status">
                  <span className="profile-status-dot" />
                  Cobrança não ativada
                </div>

                <div className="profile-plan-divider" />

                <ul className="profile-plan-features">
                  <li>
                    <span>✓</span>
                    Organização das dívidas
                  </li>

                  <li>
                    <span>✓</span>
                    Acompanhamento financeiro
                  </li>

                  <li>
                    <span>✓</span>
                    Planejamento de pagamentos
                  </li>
                </ul>

                <p className="profile-plan-disclaimer">
                  O preço e os recursos apresentados são
                  informativos. A assinatura, o período de teste
                  e os pagamentos ainda precisam ser conectados
                  ao sistema de cobrança.
                </p>
              </section>

              <section className="profile-help-card">
                <span className="profile-help-icon">
                  ?
                </span>

                <h3>Precisa de ajuda?</h3>

                <p>
                  Se encontrar algum problema com seus dados,
                  entre em contato com o suporte da plataforma.
                </p>

                <Link href="/" className="profile-help-link">
                  Voltar ao início →
                </Link>
              </section>
            </aside>
          </div>
        </>
      )}

      <footer className="profile-footer">
        <span>Resgata Dívidas</span>
        <span>Organização financeira com mais clareza.</span>
      </footer>

      <style jsx>{`
        .profile-page {
          max-width: 1180px;
          margin: 0 auto;
          padding-bottom: 36px;
        }

        .profile-nav {
          margin-bottom: 32px;
          gap: 20px;
          flex-wrap: wrap;
        }

        .profile-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          margin: 30px 0 26px;
        }

        .profile-eyebrow {
          display: inline-block;
          margin-bottom: 10px;
          color: #64748b;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1.8px;
        }

        .profile-heading h1 {
          margin: 0;
          color: #172033;
          font-size: clamp(30px, 4vw, 40px);
          line-height: 1.15;
          letter-spacing: -1.3px;
        }

        .profile-heading p {
          max-width: 570px;
          margin: 12px 0 0;
          color: #64748b;
          line-height: 1.7;
          font-size: 14px;
        }

        .profile-back-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          padding: 11px 15px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          background: #fff;
          color: #334155;
          text-decoration: none;
          font-size: 13px;
          font-weight: 700;
          transition: background 0.2s;
        }

        .profile-back-button:hover {
          background: #f8fafc;
        }

        .profile-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.65fr) minmax(270px, 1fr);
          align-items: start;
          gap: 20px;
        }

        .profile-main-column,
        .profile-side-column {
          display: grid;
          gap: 20px;
          min-width: 0;
        }

        .profile-card {
          min-width: 0;
          padding: 25px;
          border: 1px solid #e8edf3;
          border-radius: 18px;
          background: #fff;
          box-shadow: 0 5px 24px rgba(15, 23, 42, 0.035);
        }

        .profile-card-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 15px;
        }

        .profile-card-heading h2,
        .profile-plan-card h2 {
          margin: 0;
          color: #172033;
          font-size: 19px;
          font-weight: 800;
          letter-spacing: -0.3px;
        }

        .profile-card-heading p {
          margin: 8px 0 0;
          color: #64748b;
          font-size: 13px;
          line-height: 1.6;
        }

        .profile-section-icon {
          display: grid;
          width: 42px;
          height: 42px;
          flex-shrink: 0;
          place-items: center;
          border-radius: 12px;
          background: #f1f5f9;
          font-size: 19px;
        }

        .profile-identity {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-top: 25px;
        }

        .profile-avatar {
          display: grid;
          width: 68px;
          height: 68px;
          flex-shrink: 0;
          place-items: center;
          border-radius: 20px;
          background: linear-gradient(135deg, #0f766e, #0d9488);
          color: #fff;
          font-size: 23px;
          font-weight: 800;
          letter-spacing: 0.5px;
        }

        .profile-identity-info {
          display: grid;
          min-width: 0;
          gap: 5px;
        }

        .profile-identity-info > strong {
          overflow-wrap: anywhere;
          color: #172033;
          font-size: 17px;
        }

        .profile-identity-info > span {
          overflow-wrap: anywhere;
          color: #64748b;
          font-size: 13px;
        }

        .profile-identity-info .profile-account-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 3px;
          color: #047857;
          font-size: 12px;
          font-weight: 700;
        }

        .profile-account-badge > span {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10b981;
        }

        .profile-divider {
          height: 1px;
          margin: 24px 0;
          background: #edf1f5;
        }

        .profile-form {
          display: grid;
          gap: 22px;
        }

        .profile-form :global(.field) {
          display: grid;
          gap: 9px;
          color: #334155;
          font-size: 13px;
          font-weight: 700;
        }

        .profile-form :global(input) {
          box-sizing: border-box;
          width: 100%;
          min-width: 0;
          min-height: 47px;
          padding: 12px 14px;
          border: 1px solid #dce3eb;
          border-radius: 10px;
          outline: none;
          background: #fff;
          color: #172033;
          font-size: 14px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .profile-form :global(input:focus) {
          border-color: #0d9488;
          box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.12);
        }

        .profile-form :global(input:disabled) {
          cursor: not-allowed;
          background: #f8fafc;
          color: #64748b;
          opacity: 1;
        }

        .profile-form :global(small) {
          color: #94a3b8;
          font-size: 12px;
          font-weight: 400;
          line-height: 1.6;
        }

        .profile-form-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          flex-wrap: wrap;
          padding-top: 4px;
        }

        .profile-save-hint {
          color: #64748b;
          font-size: 12px;
          line-height: 1.5;
        }

        .profile-save-button {
          min-height: 44px;
          padding: 12px 18px;
          border-radius: 10px;
          font-weight: 700;
        }

        .profile-save-button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .profile-security-item {
          display: flex;
          align-items: flex-start;
          gap: 13px;
          margin-top: 23px;
        }

        .profile-security-icon {
          display: grid;
          width: 34px;
          height: 34px;
          flex-shrink: 0;
          place-items: center;
          border-radius: 10px;
          background: #ecfdf5;
          color: #047857;
          font-weight: 800;
        }

        .profile-security-item strong {
          color: #334155;
          font-size: 13px;
        }

        .profile-security-item p {
          margin: 5px 0 0;
          color: #64748b;
          font-size: 12px;
          line-height: 1.7;
          overflow-wrap: anywhere;
        }

        .profile-security-note {
          margin-top: 23px;
          padding: 15px;
          border: 1px solid #e2e8f0;
          border-radius: 11px;
          background: #f8fafc;
        }

        .profile-security-note strong {
          color: #334155;
          font-size: 12px;
        }

        .profile-security-note p {
          margin: 7px 0 0;
          color: #64748b;
          font-size: 12px;
          line-height: 1.7;
        }

        .profile-plan-card {
          overflow: hidden;
          border-color: #d9e8e7;
        }

        .profile-plan-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 19px;
        }

        .profile-plan-icon {
          display: grid;
          width: 43px;
          height: 43px;
          place-items: center;
          border-radius: 13px;
          background: #ccfbf1;
          color: #0f766e;
          font-size: 23px;
        }

        .profile-plan-label {
          color: #0f766e;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.3px;
        }

        .profile-plan-description {
          margin: 10px 0 20px;
          color: #64748b;
          font-size: 13px;
          line-height: 1.7;
        }

        .profile-plan-price {
          display: flex;
          align-items: baseline;
          gap: 5px;
          color: #172033;
        }

        .profile-plan-price strong {
          font-size: 37px;
          font-weight: 800;
          letter-spacing: -1.4px;
        }

        .profile-plan-price span {
          color: #64748b;
          font-size: 12px;
        }

        .profile-plan-caption {
          margin: 2px 0 16px;
          color: #64748b;
          font-size: 11px;
        }

        .profile-plan-status {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 11px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 9px;
          background: #f8fafc;
          color: #475569;
          font-size: 12px;
          font-weight: 700;
        }

        .profile-status-dot {
          width: 8px;
          height: 8px;
          flex-shrink: 0;
          border-radius: 50%;
          background: #94a3b8;
        }

        .profile-plan-divider {
          height: 1px;
          margin: 21px 0;
          background: #edf1f5;
        }

        .profile-plan-features {
          display: grid;
          gap: 15px;
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .profile-plan-features li {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          color: #475569;
          font-size: 12px;
          line-height: 1.6;
        }

        .profile-plan-features li span {
          color: #0f766e;
          font-weight: 900;
        }

        .profile-plan-disclaimer {
          margin: 22px 0 0;
          padding-top: 15px;
          border-top: 1px solid #edf1f5;
          color: #94a3b8;
          font-size: 11px;
          line-height: 1.7;
        }

        .profile-help-card {
          padding: 22px;
          border: 1px solid #e8edf3;
          border-radius: 16px;
          background: #f8fafc;
        }

        .profile-help-icon {
          display: grid;
          width: 34px;
          height: 34px;
          place-items: center;
          border-radius: 50%;
          background: #e2e8f0;
          color: #334155;
          font-weight: 800;
        }

        .profile-help-card h3 {
          margin: 15px 0 8px;
          color: #172033;
          font-size: 16px;
        }

        .profile-help-card p {
          margin: 0;
          color: #64748b;
          font-size: 12px;
          line-height: 1.8;
        }

        .profile-help-link {
          display: inline-block;
          margin-top: 15px;
          color: #0f766e;
          font-size: 12px;
          font-weight: 800;
          text-decoration: none;
        }

        .profile-alert {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 20px;
          padding: 15px;
          border-radius: 12px;
        }

        .profile-alert > span {
          display: grid;
          width: 23px;
          height: 23px;
          flex-shrink: 0;
          place-items: center;
          border-radius: 50%;
          font-weight: 800;
        }

        .profile-alert p {
          margin: 2px 0 0;
          font-size: 13px;
          line-height: 1.7;
          overflow-wrap: anywhere;
        }

        .profile-alert-error {
          border: 1px solid #fecaca;
          background: #fef2f2;
          color: #991b1b;
        }

        .profile-alert-error > span {
          background: #fee2e2;
        }

        .profile-alert-success {
          border: 1px solid #a7f3d0;
          background: #ecfdf5;
          color: #065f46;
        }

        .profile-alert-success > span {
          background: #d1fae5;
        }

        .profile-loading {
          display: grid;
          min-height: 180px;
          place-content: center;
          justify-items: center;
          gap: 14px;
          color: #64748b;
          font-size: 13px;
        }

        .profile-spinner {
          width: 28px;
          height: 28px;
          border: 3px solid #e2e8f0;
          border-top-color: #0d9488;
          border-radius: 50%;
          animation: profile-spin 0.8s linear infinite;
        }

        .profile-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 32px;
          padding-top: 20px;
          border-top: 1px solid #e8edf3;
          color: #94a3b8;
          font-size: 11px;
        }

        .profile-footer span:first-child {
          color: #64748b;
          font-weight: 800;
        }

        @keyframes profile-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 850px) {
          .profile-layout {
            grid-template-columns: 1fr;
          }

          .profile-side-column {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            align-items: start;
          }
        }

        @media (max-width: 600px) {
          .profile-heading {
            align-items: flex-start;
            flex-direction: column;
          }

          .profile-back-button {
            width: 100%;
            box-sizing: border-box;
          }

          .profile-card {
            padding: 19px;
            border-radius: 15px;
          }

          .profile-side-column {
            grid-template-columns: 1fr;
          }

          .profile-form-footer {
            align-items: stretch;
            flex-direction: column;
          }

          .profile-save-button {
            width: 100%;
          }

          .profile-identity {
            gap: 12px;
          }

          .profile-avatar {
            width: 56px;
            height: 56px;
            border-radius: 16px;
            font-size: 20px;
          }

          .profile-footer {
            align-items: flex-start;
            flex-direction: column;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .profile-spinner {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
      }
