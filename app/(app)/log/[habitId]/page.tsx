"use client";

import { useRouter } from "next/navigation";
import { use } from "react";
import { toast } from "@/lib/notify";
import { PageHeader } from "@/components/AppShell";
import { celebrate } from "@/components/celebrate";
import { ghostBtn, primaryBtn } from "@/components/Sheet";
import { fmt } from "@/lib/cn";
import { logEntry, undoEntries } from "@/lib/store/actions";
import { useHabits } from "@/lib/store/hooks";
import { IconChip } from "@/components/HabitIcon";

/** Deep link `/log/<habitId>`: abre la app y registra con confirmación (alternativa a los Atajos). */
export default function LogDeepLink({ params }: { params: Promise<{ habitId: string }> }) {
  const { habitId } = use(params);
  const router = useRouter();
  const habits = useHabits();
  const habit = habits.find((h) => h.id === habitId);

  async function confirm() {
    if (!habit) return;
    const { entryId, completedGoals } = await logEntry({ habitId: habit.id, amount: habit.defaultAmount });
    toast.success(`${habit.name} registrado`, {
      icon: habit.emoji,
      duration: 5000,
      action: { label: "Deshacer", onClick: () => undoEntries([entryId]) },
    });
    celebrate(completedGoals);
    router.replace("/");
  }

  if (!habit) {
    return (
      <>
        <PageHeader title="Registrar" />
        <p className="text-sm text-muted">No encontré ese hábito en este dispositivo.</p>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Registrar" />
      <div className="card card-lg p-6 text-center">
        <div className="flex justify-center"><IconChip value={habit.emoji} size="lg" /></div>
        <h2 className="mt-3 text-xl font-semibold">{habit.name}</h2>
        {habit.kind === "quantity" && (
          <p className="text-sm text-muted">+{fmt(habit.defaultAmount)} {habit.unit}</p>
        )}
        <div className="mt-6 space-y-2">
          <button className={primaryBtn} onClick={confirm}>Confirmar</button>
          <button className={`${ghostBtn} w-full`} onClick={() => router.replace("/")}>Cancelar</button>
        </div>
      </div>
    </>
  );
}
