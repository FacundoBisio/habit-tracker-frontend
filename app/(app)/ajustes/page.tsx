"use client";

import { ChevronRight, Download, Upload } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";
import { toast } from "@/lib/notify";
import { PageHeader } from "@/components/AppShell";
import { AccountSection } from "@/components/AccountSection";
import { Achievements } from "@/components/Achievements";
import { DangerZone } from "@/components/DangerZone";
import { HelpSection } from "@/components/HelpSection";
import { ProfileSection } from "@/components/ProfileSection";
import { HabitForm } from "@/components/HabitForm";
import { ghostBtn, labelCls } from "@/components/Sheet";
import { cn } from "@/lib/cn";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";
import type { WeekStart } from "@/lib/domain/types";
import { describeSchedule } from "@/lib/domain/schedule";
import { saveSettings, updateHabit } from "@/lib/store/actions";
import type { Habit } from "@/lib/store/db";
import { useHabitsState, useSettings } from "@/lib/store/hooks";
import { IconChip } from "@/components/HabitIcon";
import { readMascotMode, setMascotMode, useWebglSupported } from "@/lib/mascot-3d";

const ZONES = [
  "America/Argentina/Cordoba",
  "America/Argentina/Buenos_Aires",
  "America/Montevideo",
  "America/Santiago",
  "America/Sao_Paulo",
  "America/Bogota",
  "America/Mexico_City",
  "Europe/Madrid",
  "UTC",
];

export default function SettingsPage() {
  const settings = useSettings();
  const { habits, ready } = useHabitsState(true);
  const [theme, setTheme] = useState<Theme>(readTheme);
  const webgl = useWebglSupported();
  const mode3d = useSyncExternalStore(
    (cb) => {
      window.addEventListener("mascotmodechange", cb);
      return () => window.removeEventListener("mascotmodechange", cb);
    },
    () => readMascotMode() === "3d",
    () => true,
  );
  const [editing, setEditing] = useState<Habit | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const zones = ZONES.includes(settings.timezone) ? ZONES : [settings.timezone, ...ZONES];

  async function doExport() {
    // El backup (y zod) se baja recién acá: no hace falta en el JS inicial.
    const { exportAll } = await import("@/lib/store/backup");
    const blob = new Blob([JSON.stringify(await exportAll(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `habitos-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function doImport(file: File) {
    try {
      const { importJson } = await import("@/lib/store/backup");
      const { habits: h, entries: e } = await importJson(JSON.parse(await file.text()));
      toast.success(`Importados ${h} hábitos y ${e} registros`);
    } catch {
      toast.error("El archivo no tiene un formato válido");
    }
  }

  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="space-y-6">
        <Group title="Perfil">
          <ProfileSection />
        </Group>

        <Group title="Logros">
          <Achievements />
        </Group>

        <Group title="Preferencias">
          <Field label="Zona horaria" htmlFor="s-tz">
            <select id="s-tz" className="h-12 w-full rounded-xl border border-border bg-bg px-3" value={settings.timezone} onChange={(e) => saveSettings({ timezone: e.target.value })}>
              {zones.map((z) => <option key={z}>{z}</option>)}
            </select>
          </Field>
          <Field label="La semana empieza el" htmlFor="s-ws">
            <select id="s-ws" className="h-12 w-full rounded-xl border border-border bg-bg px-3" value={settings.weekStartsOn} onChange={(e) => saveSettings({ weekStartsOn: Number(e.target.value) as WeekStart })}>
              <option value={1}>Lunes</option>
              <option value={0}>Domingo</option>
              <option value={6}>Sábado</option>
            </select>
          </Field>
          <label className="flex min-h-12 items-center justify-between gap-3 text-sm">
            <span>
              <span className="block font-medium">Personaje en 3D</span>
              <span className="block text-xs text-muted">
                {webgl ? "Descarga el modelo la primera vez (~450 KB)." : "Tu dispositivo no soporta 3D: se usa el 2D."}
              </span>
            </span>
            <input
              type="checkbox"
              className="size-6 shrink-0"
              aria-label="Personaje en 3D"
              checked={webgl && mode3d}
              disabled={!webgl}
              onChange={(e) => setMascotMode(e.target.checked ? "3d" : "2d")}
            />
          </label>
          <div>
            <span className={labelCls}>Tema</span>
            <div role="radiogroup" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
              {(["system", "light", "dark"] as const).map((t) => (
                <button key={t} role="radio" aria-checked={theme === t} onClick={() => { setTheme(t); applyTheme(t); }}
                  className={cn("min-h-10 rounded-lg text-sm font-medium transition", theme === t ? "bg-surface shadow-sm" : "text-muted")}>
                  {{ system: "Sistema", light: "Claro", dark: "Oscuro" }[t]}
                </button>
              ))}
            </div>
          </div>
        </Group>

        <Group title="Hábitos">
          {ready && habits.length === 0 && <p className="text-sm text-muted">Todavía no hay hábitos.</p>}
          <ul className="divide-y divide-border">
            {habits.map((h) => (
              <li key={h.id} className="flex items-center">
                <button className="flex min-h-14 flex-1 items-center gap-3 text-left" onClick={() => setEditing(h)}>
                  <IconChip value={h.emoji} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm font-medium", h.archived && "text-muted line-through")}>{h.name}</span>
                    <span className="block text-xs text-muted">{describeSchedule(h.schedule)}{h.aliases.length ? ` · ${h.aliases.join(", ")}` : ""}</span>
                  </span>
                  <ChevronRight className="size-4 text-muted" />
                </button>
                <button className="ml-2 min-h-11 px-2 text-xs text-muted" onClick={() => updateHabit(h.id, { archived: !h.archived })}>
                  {h.archived ? "Reactivar" : "Archivar"}
                </button>
              </li>
            ))}
          </ul>
        </Group>

        <Group title="Ayuda">
          <HelpSection />
        </Group>

        <Group title="Datos">
          <div className="grid grid-cols-2 gap-2">
            <button className={ghostBtn} onClick={doExport}><Download className="mr-2 size-4" />Exportar</button>
            <button className={ghostBtn} onClick={() => fileRef.current?.click()}><Upload className="mr-2 size-4" />Importar</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ""; }} />
          <p className="text-xs text-muted">
            Acepta backups de esta app y el formato viejo (<code>habit-tracker:habits</code> + <code>habit-tracker:checks</code> combinados como <code>{`{"habits":[…],"checks":[…]}`}</code>).
          </p>
        </Group>

        <Group title="Cuenta, Atajos y Telegram">
          <AccountSection />
        </Group>

        <Group title="Zona peligrosa">
          <DangerZone onExport={doExport} />
        </Group>
      </div>
      <HabitForm open={!!editing} habit={editing} onClose={() => setEditing(undefined)} />
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 font-display text-base font-semibold tracking-tight">{title}</h2>
      <div className="space-y-4 card p-4">{children}</div>
    </section>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls} htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}
