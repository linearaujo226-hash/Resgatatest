"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type AuthScreenProps = {
  mode: "login" | "register";
};

export default function AuthScreen({ mode }: AuthScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedNext = searchParams.get("next");
  const nextPath =
    requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/dashboard";
  const isRegister = mode === "register";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (isRegister && cleanName.length < 2) {
      setError("Informe seu nome com pelo menos 2 caracteres.");
      return;
    }

    if (isRegister && password.length < 8) {
      setError("Sua senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setError("As senhas digitadas não são iguais.");
      return;
    }

    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();

      if (isRegister) {
        const { data, error: signupError } =
          await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
              data: { name: cleanName },
            },
          });

        if (signupError) throw signupError;

        setName("");
        setEmail("");
        setPassword("");
        setConfirmPassword("");

        if (data.session && data.user) {
          router.replace("/dashboard");
          router.refresh();
          return;
        }

        setMessage(
          "Cadastro recebido. Se a confirmação por e-mail estiver ativada, confirme seu endereço antes de entrar."
        );
        return;
      }

      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

      if (loginError) throw loginError;

      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      console.error("Erro na autenticação do Resgata+:", err);

      if (err instanceof Error) {
        const text = err.message.toLowerCase();

        if (
          text.includes("already registered") ||
          text.includes("already been registered") ||
          text.includes("user already registered")
        ) {
          setError("Este e-mail já possui cadastro. Tente entrar.");
        } else if (
          text.includes("invalid login credentials")
        ) {
          setError("E-mail ou senha incorretos. Confira os dados ou recupere sua senha.");
        } else if (
          text.includes("email not confirmed")
        ) {
          setError("Seu e-mail ainda precisa ser confirmado.");
        } else if (
          text.includes("password should be at least")
        ) {
          setError("A senha precisa ter pelo menos 8 caracteres.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Não foi possível concluir a operação. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="brand">
          <span className="brand-mark">R</span>
          <span>Resgata+</span>
        </Link>

        <span className="eyebrow" style={{ marginTop: 28 }}>
          {isRegister ? "Um novo começo" : "Bom ter você de volta"}
        </span>

        <h1>{isRegister ? "Crie sua conta" : "Entre na sua conta"}</h1>

        <p>
          {isRegister
            ? "Comece a organizar suas dívidas e acompanhar sua evolução."
            : "Acesse seu painel e continue organizando sua vida financeira."}
        </p>

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        {message && (
          <div className="success" role="status">
            {message}
          </div>
        )}

        <form className="form" onSubmit={submit}>
          {isRegister && (
            <label className="field">
              Nome
              <input
                type="text"
                autoComplete="name"
                maxLength={120}
                placeholder="Como podemos chamar você?"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
          )}

          <label className="field">
            E-mail
            <input
              type="email"
              autoComplete="email"
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="field">
            Senha
            <input
              type={showPassword ? "text" : "password"}
              autoComplete={isRegister ? "new-password" : "current-password"}
              minLength={isRegister ? 8 : undefined}
              placeholder={isRegister ? "Pelo menos 8 caracteres" : "Digite sua senha"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {isRegister && (
            <label className="field">
              Confirme sua senha
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                placeholder="Digite a senha novamente"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </label>
          )}

          <label className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
            Mostrar senha
          </label>

          {!isRegister && (
            <div className="auth-links">
              <span className="muted">Proteja seus dados de acesso.</span>
              <Link href="/recuperar-senha">Esqueci minha senha</Link>
            </div>
          )}

          {isRegister && (
            <p className="muted">
              Seus registros financeiros são pessoais. Nunca compartilhe sua senha.
            </p>
          )}

          <button className="btn btn-block" type="submit" disabled={loading}>
            {loading
              ? "Aguarde..."
              : isRegister
                ? "Criar minha conta"
                : "Entrar com segurança"}
          </button>
        </form>

        <div className="auth-footer">
          {isRegister ? (
            <>
              Já tem cadastro? <Link href="/login">Entrar</Link>
            </>
          ) : (
            <>
              Ainda não tem conta? <Link href="/register">Criar cadastro</Link>
            </>
          )}
          <p>
            <Link href="/">Voltar à página inicial</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
