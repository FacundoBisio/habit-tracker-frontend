"use client";

import { Download, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { deleteAccount, hasSession } from "@/lib/store/account";
import { useOnline } from "@/lib/store/hooks";
import { Sheet, ghostBtn, inputCls, labelCls } from "./Sheet";

const CONFIRM = "ELIMINAR";

/**
 * Zona peligrosa: con sesión elimina la cuenta (en el servidor y en el dispositivo); sin sesión, borra todos los
 * datos de este dispositivo. Pide escribir ELIMINAR y ofrece exportar antes.
 */
export function DangerZone({ onExport }: { onExport: () => void }) {
  const [session, setSession] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void hasSession().then((s) => alive && setSession(s));
    return () => {
      alive = false;
    };
  }, [open]);

  const label = session ? "Eliminar mi cuenta y todos mis datos" : "Borrar todos mis datos de este dispositivo";
  return (
    <>
      <p className="text-sm text-muted">
        {session
          ? "Elimina tu cuenta, tus hábitos, registros, objetivos, logros, tokens de Atajos, el vínculo con Telegram y los recordatorios. No se puede deshacer."
          : "Borra tus hábitos, registros, objetivos y logros de este dispositivo. No se puede deshacer."}
      </p>
      <button className={cn(ghostBtn, "w-full border-danger/40 text-danger")} onClick={() => setOpen(true)}>
        <TriangleAlert className="mr-2 size-4" />
        {label}
      </button>
      {/* Mientras borra, el popup no se puede cerrar */}
      <Sheet open={open} onClose={() => !busy && setOpen(false)} title={session ? "Eliminar cuenta" : "Borrar datos"}>
        {open && <ConfirmForm session={session} onExport={onExport} busy={busy} setBusy={setBusy} />}
      </Sheet>
    </>
  );
}

function ConfirmForm({ session, onExport, busy, setBusy }: { session: boolean; onExport: () => void; busy: boolean; setBusy: (b: boolean) => void }) {
  const online = useOnline();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const needsNet = session && !online;
  const ready = typed.trim().toUpperCase() === CONFIRM && !needsNet && !busy;

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    const res = await deleteAccount(); // si sale bien, la app se recarga de cero
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
    }
  }

  return (
    <form onSubmit={run} className="space-y-4">
      <div className="space-y-1.5 text-sm">
        <p>Se borra para siempre:</p>
        <ul className="list-disc space-y-0.5 pl-5 text-muted">
          <li>Hábitos, registros, objetivos y logros</li>
          {session && <li>Tokens de Atajos, vínculo con Telegram y recordatorios</li>}
          {session && <li>Tu cuenta de email</li>}
        </ul>
      </div>
      <button type="button" className={cn(ghostBtn, "w-full")} onClick={onExport} disabled={busy}>
        <Download className="mr-2 size-4" />
        Exportar antes
      </button>
      <div>
        <label className={labelCls} htmlFor="danger-confirm">Escribí {CONFIRM} para confirmar</label>
        <input
          id="danger-confirm"
          className={inputCls}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          disabled={busy}
        />
      </div>
      {needsNet && <p className="text-sm text-muted">Necesitás conexión para eliminar la cuenta.</p>}
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}. Probá de nuevo.
        </p>
      )}
      <button
        type="submit"
        disabled={!ready}
        className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-fg px-4 font-semibold text-bg transition active:scale-[0.98] disabled:opacity-35"
      >
        {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
        {error ? "Reintentar" : session ? "Eliminar mi cuenta" : "Borrar todo"}
      </button>
    </form>
  );
}
