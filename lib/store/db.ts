import Dexie, { type Table } from "dexie";
import type { GoalKind, GoalLink, LocalDate, Schedule, WeekStart } from "@/lib/domain/types";

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  kind: "boolean" | "quantity";
  unit?: string;
  defaultAmount: number;
  schedule: Schedule;
  archived: boolean;
  sortOrder: number;
  aliases: string[];
}

export interface Entry {
  id: string;
  habitId: string;
  localDate: LocalDate;
  occurredAt: number;
  amount: number;
  note?: string;
  source: "app" | "shortcut" | "siri" | "bot" | "import";
  clientId: string;
}

export interface Goal {
  id: string;
  title: string;
  kind: GoalKind;
  targetValue: number;
  unit?: string;
  periodStart: LocalDate;
  periodEnd: LocalDate;
  status: "active" | "completed" | "failed" | "archived";
  completedAt?: number;
  links: GoalLink[];
}

export interface Settings {
  id: "me";
  timezone: string;
  weekStartsOn: WeekStart;
  /** Cómo te llama la app; vacío = todavía no hizo la bienvenida. */
  name?: string;
  /** Cuándo se cambió el nombre (ms): con varios dispositivos gana el cambio más nuevo. */
  nameUpdatedAt?: number;
  /** Cuándo terminó (o se salteó) el recorrido guiado: no vuelve a arrancar solo. */
  tourDoneAt?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  id: "me",
  timezone: "America/Argentina/Cordoba",
  weekStartsOn: 1,
};

export interface OutboxItem {
  seq?: number;
  kind: "habit" | "entry" | "goal";
  id: string;
  op: "upsert" | "delete";
  /** Motivo si el servidor lo rechazó: sigue en la cola (se reintenta) pero no cuenta como pendiente. */
  rejected?: string;
}

// Mientras se aplican cambios que vienen del servidor no se encolan (evita eco de sincronización).
let applyingRemote = false;
export async function withRemote<T>(fn: () => Promise<T>): Promise<T> {
  applyingRemote = true;
  try {
    return await fn();
  } finally {
    applyingRemote = false;
  }
}

class AppDB extends Dexie {
  habits!: Table<Habit, string>;
  entries!: Table<Entry, string>;
  goals!: Table<Goal, string>;
  settings!: Table<Settings, string>;
  outbox!: Table<OutboxItem, number>;

  constructor() {
    super("habit-tracker");
    this.version(1).stores({
      habits: "id, archived, sortOrder",
      entries: "id, habitId, localDate, &clientId, [habitId+localDate]",
      goals: "id, status",
      settings: "id",
    });
    this.version(2).stores({ outbox: "++seq, [kind+id]" });
    // Índice de lo rechazado por el servidor (las filas sin motivo no entran al índice): contarlo es barato.
    this.version(3).stores({ outbox: "++seq, [kind+id], rejected" });

    const track = (table: Table<{ id: string }, string>, kind: OutboxItem["kind"]) => {
      const enqueue = (id: string, op: OutboxItem["op"]) => {
        if (applyingRemote) return;
        // Diferido: Dexie no permite escribir otras tablas dentro del hook de forma síncrona.
        setTimeout(() => void this.outbox.add({ kind, id, op }), 0);
      };
      table.hook("creating", (_pk, obj) => enqueue(obj.id, "upsert"));
      table.hook("updating", (_mods, pk) => enqueue(String(pk), "upsert"));
      table.hook("deleting", (pk) => enqueue(String(pk), "delete"));
    };
    track(this.habits as Table<{ id: string }, string>, "habit");
    track(this.entries as Table<{ id: string }, string>, "entry");
    track(this.goals as Table<{ id: string }, string>, "goal");
  }
}

export const db = new AppDB();
