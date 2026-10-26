import { toast } from "@/lib/notify";
import { haptic } from "@/lib/cn";

/** Festejo discreto al completar objetivos. */
export function celebrate(goalTitles: string[]) {
  for (const title of goalTitles) {
    haptic(30);
    toast.success(`Objetivo completo: ${title}`, { duration: 6000 });
  }
}
