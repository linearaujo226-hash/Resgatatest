"use client";
import AppHeader from "@/components/AppHeader";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function ProfilePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await getSupabaseBrowserClient().auth.getUser();
        if (error) throw error;
        if (!data.user) { router.replace("/login"); return; }
        setName(String(data.user.user_metadata?.name || ""));
        setEmail(data.user.email || "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível carregar o perfil.");
      } finally { setLoading(false); }
    }
    void load();
  }, [router]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage(""); setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw error || new Error("Faça login novamente.");
      const { error: updateError } = await supabase.auth.updateUser({ data: { name } });
      if (updateError) throw updateError;
      const { error: profileError } = await supabase.from("users").upsert({
        id: data.user.id, name, email: data.user.email || email,
      });
      if (profileError) throw profileError;
      setMessage("Perfil atualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally { setSaving(false); }
  }

  return (
    <main className="container page" style={{ maxWidth: 680 }}>
      <AppHeader />

      <nav className="nav"><Link className="brand" href="/">Resgata<span> Dívidas</span></Link><div className="navlinks"><Link href="/dashboard">Painel</Link><Link href="/dividas">Dívidas</Link><Link href="/apostas">Hábitos &amp; Controle</Link></div></nav>
      <section className="panel"><h1 style={{ fontSize: "2.5rem" }}>Meu perfil</h1>
        {loading ? <p className="muted">Carregando...</p> : (
          <form className="form" onSubmit={save}>
            <label className="field">Nome<input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="field">E-mail<input type="email" value={email} disabled /></label>
            {error && <p className="error" role="alert">{error}</p>}
            {message && <p className="success" role="status">{message}</p>}
            <button className="btn primary" disabled={saving}>{saving ? "Salvando..." : "Salvar perfil"}</button>
          </form>
        )}
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Plano</h2>
        <p className="muted">Plano previsto: R$ 9,90 por mês após 7 dias de teste.</p>
        <p className="notice">Cobrança e cancelamento ainda não estão conectados. Nenhum pagamento é ativado por esta tela.</p>
      </section>
    </main>
  );
}
