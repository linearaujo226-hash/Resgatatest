"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function RedefinirSenhaPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        if (active) setReady(Boolean(data.session));
      } catch {
        if (active) setError("Configure o Supabase antes de redefinir a senha.");
      }
    }

    void checkSession();
    return () => { active = false; };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 8) {
      setError("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não são iguais.");
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      setMessage("Senha atualizada. Agora você pode entrar com a nova senha.");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar a senha. Solicite um novo link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="brand"><span className="brand-mark">R</span><span>Resgata+</span></Link>
        <h1>Crie uma nova senha</h1>
        <p>Use uma senha forte com pelo menos 8 caracteres.</p>

        {message && <div className="success" role="status">{message}<p><Link href="/login">Ir para o login</Link></p></div>}
        {error && <div className="error" role="alert">{error}</div>}

        {!ready && !message ? (
          <div className="notice">
            Abra esta página pelo link de recuperação recebido por e-mail. Se o link expirou, solicite outro.
          </div>
        ) : null}

        {ready && !message && (
          <form className="form" onSubmit={handleSubmit}>
            <label className="field">
              Nova senha
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <label className="field">
              Confirme a nova senha
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </label>
            <button className="btn btn-block" type="submit" disabled={loading}>
              {loading ? "Atualizando..." : "Salvar nova senha"}
            </button>
          </form>
        )}

        <div className="auth-footer"><Link href="/login">Voltar para o login</Link></div>
      </section>
    </main>
  );
}
