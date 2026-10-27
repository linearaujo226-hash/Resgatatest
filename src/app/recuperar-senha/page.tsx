"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/redefinir-senha` }
      );

      if (resetError) throw resetError;

      setMessage(
        "Se houver uma conta associada a esse e-mail, você receberá instruções para redefinir a senha. Confira também o spam."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível solicitar a recuperação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="brand"><span className="brand-mark">R</span><span>Resgata+</span></Link>
        <h1>Recuperar senha</h1>
        <p>Informe o e-mail usado no cadastro. Enviaremos as instruções para criar uma nova senha.</p>

        {message && <div className="success" role="status">{message}</div>}
        {error && <div className="error" role="alert">{error}</div>}

        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            E-mail cadastrado
            <input
              type="email"
              autoComplete="email"
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <button className="btn btn-block" type="submit" disabled={loading}>
            {loading ? "Enviando..." : "Enviar instruções"}
          </button>
        </form>

        <div className="auth-footer"><Link href="/login">Voltar para o login</Link></div>
      </section>
    </main>
  );
}
