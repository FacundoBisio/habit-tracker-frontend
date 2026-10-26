"use client";

import { Cloud, CloudOff } from "lucide-react";
import { useEffect } from "react";
import { Toaster } from "sonner";
import { useOnline } from "@/lib/store/hooks";
import { useSync } from "@/lib/sync/use-sync";
import { BottomNav } from "./BottomNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const online = useOnline();
  const { status, pending } = useSync();

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      {!online && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted" role="status">
          <CloudOff className="size-4" /> Sin conexión · tus registros se guardan en este dispositivo
        </div>
      )}
      <main className="flex-1">{children}</main>
      <p className="mt-8 flex items-center justify-center gap-1.5 text-[11px] text-muted">
        <Cloud className="size-3.5" />
        {status === "off" && "Guardado en este dispositivo"}
        {status === "syncing" && "Sincronizando…"}
        {status === "synced" && "Sincronizado"}
        {status === "pending" && `${pending} cambio${pending === 1 ? "" : "s"} por sincronizar`}
        {status === "error" && "No se pudo sincronizar · reintento automático"}
      </p>
      <BottomNav />
      <Toaster
        theme="system"
        position="top-center"
        offset={{ top: "calc(env(safe-area-inset-top) + 8px)" }}
        toastOptions={{ style: { borderRadius: 16 } }}
      />
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-[28px] leading-8 font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted first-letter:uppercase">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
