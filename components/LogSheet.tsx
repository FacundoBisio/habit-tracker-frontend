"use client";

import { useState } from "react";
import { toast } from "sonner";
import { fmt } from "@/lib/cn";
import { logEntry, undoEntries } from "@/lib/store/actions";
import type { Habit } from "@/lib/store/db";
import { Sheet, inputCls, labelCls, primaryBtn } from "./Sheet";
import { celebrate } from "./celebrate";

/** Registro detallado (long-press): cantidad, nota y otra fecha. */
export function LogSheet({ habit, today, onClose }: { habit: Habit | null; today: string; onClose: () => void }) {
  return (
    <Sheet open={!!habit} onClose={onClose} title={habit ? `${habit.emoji} ${habit.name}` : ""}>
      {habit && <Form key={habit.id} habit={habit} today={today} onClose={onClose} />}
    </Sheet>
  );
}

function Form({ habit, today, onClose }: { habit: Habit; today: string; onClose: () => void }) {
  const [amount, setAmount] = useState(String(habit.defaultAmount));
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const qty = habit.kind === "quantity";
  const value = Number(amount.replace(",", "."));
  const valid = (!qty || value > 0) && !!date && date <= today;

  async function save() {
    const { entryId, completedGoals } = await logEntry({
      habitId: habit.id,
      amount: qty ? value : 1,
      localDate: date,
      note: note.trim() || undefined,
    });
    toast.success(`${habit.emoji} ${habit.name}${qty ? ` +${fmt(value)} ${habit.unit ?? ""}` : ""}`, {
      duration: 5000,
      action: { label: "Deshacer", onClick: () => undoEntries([entryId]) },
    });
    celebrate(completedGoals);
    onClose();
  }

  return (
    <div className="space-y-4">
      {qty && (
        <div>
          <label className={labelCls} htmlFor="l-amount">Cantidad{habit.unit ? ` (${habit.unit})` : ""}</label>
          <input id="l-amount" className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </div>
      )}
      <div>
        <label className={labelCls} htmlFor="l-date">Fecha</label>
        <input id="l-date" type="date" className={inputCls} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div>
        <label className={labelCls} htmlFor="l-note">Nota (opcional)</label>
        <input id="l-note" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <button className={primaryBtn} disabled={!valid} onClick={save}>Registrar</button>
    </div>
  );
}
