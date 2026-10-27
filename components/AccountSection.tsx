"use client";

import { Check, Copy, LogOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/notify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiFetch, loadSupabase } from "@/lib/supabase/browser";
import { cn } from "@/lib/cn";
import { ghostBtn, inputCls, labelCls, primaryBtn } from "./Sheet";

interface TokenRow {
  id: string;
  name: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
interface RemoteSettings {
  telegramChatId?: string;
  reminderTime: string;
  remindersEnabled: boolean;
}

const copy = async (text: string, what: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copiado`);
  } catch {
    toast.error("No se pudo copiar");
  }
};

export function AccountSection() {
  const [supabase, setSupabase] = useState<SupabaseClient | null | undefined>(undefined); // undefined = cargando
  const [email, setEmail] = useState<string | null | undefined>(undefined); // undefined = cargando

  useEffect(() => {
    loadSupabase().then(setSupabase);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setEmail(s?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  if (supabase === undefined) return <p className="text-sm text-muted">Cargando…</p>;
  if (supabase === null) {
    return (
      <p className="text-sm text-muted">
        Cuenta sin configurar: faltan <code>NEXT_PUBLIC_SUPABASE_URL</code> y <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        Mientras tanto todo se guarda en este dispositivo.
      </p>
    );
  }
  if (email === undefined) return <p className="text-sm text-muted">Cargando…</p>;
  if (email === null) return <Login supabase={supabase} />;
  return <Connected email={email} supabase={supabase} />;
}

/** Login por código de 6 dígitos: se tipea dentro de la PWA, sin redirects (que en iOS standalone abren Safari). */
function Login({ supabase }: { supabase: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      setSent(true);
      toast.success("Te mandamos un código por email");
    }
  }
  async function verify() {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) toast.error("Código inválido o vencido");
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Iniciá sesión para sincronizar, usar Atajos y el bot de Telegram.</p>
      <div>
        <label className={labelCls} htmlFor="a-email">Email</label>
        <input id="a-email" type="email" autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} disabled={sent} />
      </div>
      {sent && (
        <div>
          <label className={labelCls} htmlFor="a-code">Código de 6 dígitos</label>
          <input id="a-code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} className={cn(inputCls, "tracking-widest")} value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
      )}
      <button className={primaryBtn} disabled={busy || !email.includes("@") || (sent && code.length < 6)} onClick={sent ? verify : send}>
        {sent ? "Verificar código" : "Enviar código"}
      </button>
    </div>
  );
}

function Connected({ email, supabase }: { email: string; supabase: SupabaseClient }) {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [settings, setSettings] = useState<RemoteSettings | null>(null);
  const [newName, setNewName] = useState("iPhone Atajos");
  const [fresh, setFresh] = useState<string | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);

  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [t, s] = await Promise.all([apiFetch("/api/me/tokens"), apiFetch("/api/me/settings")]);
      if (!alive) return;
      if (t.ok) setTokens((await t.json()).tokens);
      if (s.ok) setSettings(await s.json());
    })();
    return () => {
      alive = false;
    };
  }, [version]);

  async function createToken() {
    const res = await apiFetch("/api/me/tokens", { method: "POST", body: JSON.stringify({ name: newName.trim() || "Atajos" }) });
    if (!res.ok) return toast.error("No se pudo crear el token");
    setFresh((await res.json()).token);
    load();
  }
  async function revoke(id: string) {
    await apiFetch(`/api/me/tokens?id=${id}`, { method: "DELETE" });
    load();
  }
  async function genCode() {
    const res = await apiFetch("/api/me/link-code", { method: "POST" });
    if (res.ok) setLinkCode((await res.json()).code);
  }
  async function unlinkTelegram() {
    const res = await apiFetch("/api/me/telegram", { method: "DELETE" });
    if (!res.ok) return toast.error("No se pudo desvincular Telegram");
    toast.success("Telegram desvinculado");
    load();
  }
  async function patch(p: Partial<RemoteSettings>) {
    const res = await apiFetch("/api/me/settings", { method: "PATCH", body: JSON.stringify(p) });
    if (res.ok) setSettings(await res.json());
    else toast.error("No se pudo guardar");
  }

  const base = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm">
          <Check className="mr-1 inline size-4 text-accent" />
          {email}
        </p>
        <button className={cn(ghostBtn, "h-10 px-3")} onClick={() => supabase.auth.signOut()}>
          <LogOut className="mr-1.5 size-4" />
          Salir
        </button>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Atajos de iOS</h3>
        <p className="text-xs text-muted">
          Creá un token y pegalo en el Atajo (ver <code>docs/IOS_SHORTCUTS.md</code>). Se muestra una sola vez.
        </p>
        <div className="flex gap-2">
          <input aria-label="Nombre del token" className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className={cn(ghostBtn, "h-12 shrink-0")} onClick={createToken}>Crear</button>
        </div>
        {fresh && (
          <div className="space-y-2 rounded-xl bg-accent-soft/50 p-3 text-xs">
            <p className="font-medium">Copiá el token ahora: no se vuelve a mostrar.</p>
            <code className="block break-all">{fresh}</code>
            <div className="flex gap-2">
              <button className={cn(ghostBtn, "h-10 px-3")} onClick={() => copy(fresh, "Token")}>
                <Copy className="mr-1.5 size-4" />Token
              </button>
              <button className={cn(ghostBtn, "h-10 px-3")} onClick={() => copy(base, "URL base")}>
                <Copy className="mr-1.5 size-4" />URL base
              </button>
            </div>
          </div>
        )}
        <ul className="divide-y divide-border text-sm">
          {tokens
            .filter((t) => !t.revokedAt)
            .map((t) => (
              <li key={t.id} className="flex min-h-12 items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate">{t.name}</span>
                  <span className="text-xs text-muted">
                    {t.lastUsedAt ? `Usado ${new Date(t.lastUsedAt).toLocaleDateString("es-AR")}` : "Sin usar"}
                  </span>
                </span>
                <button className="min-h-11 px-2 text-xs text-danger" onClick={() => revoke(t.id)}>Revocar</button>
              </li>
            ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Telegram</h3>
        {settings?.telegramChatId ? (
          <>
            <p className="flex items-center gap-1.5 text-sm text-muted"><Check className="size-4" />Vinculado. Escribile al bot en lenguaje natural.</p>
            <button className={cn(ghostBtn, "w-full")} onClick={unlinkTelegram}>Desvincular Telegram</button>
          </>
        ) : (
          <>
            <p className="text-xs text-muted">
              Generá un código y mandáselo al bot: <code>/vincular CÓDIGO</code> (vence en 15 min).
            </p>
            <button className={cn(ghostBtn, "w-full")} onClick={genCode}>Generar código</button>
            {linkCode && (
              <p className="rounded-xl bg-accent-soft/50 p-3 text-center font-mono text-lg tracking-widest">/vincular {linkCode}</p>
            )}
          </>
        )}
      </section>

      {settings && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Recordatorios por Telegram</h3>
          <label className="flex min-h-11 items-center justify-between text-sm">
            Recordatorio diario
            <input
              type="checkbox"
              className="size-6"
              checked={settings.remindersEnabled}
              disabled={!settings.telegramChatId}
              onChange={(e) => patch({ remindersEnabled: e.target.checked })}
            />
          </label>
          <div>
            <label className={labelCls} htmlFor="a-time">Hora (tu zona horaria)</label>
            <input id="a-time" type="time" className={inputCls} value={settings.reminderTime} onChange={(e) => patch({ reminderTime: e.target.value })} />
          </div>
          {!settings.telegramChatId && <p className="text-xs text-muted">Vinculá Telegram para activarlos.</p>}
        </section>
      )}
    </div>
  );
}
