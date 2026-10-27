"use client";

import { Compass, Presentation } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { replayIntro, startTour } from "@/lib/onboarding";
import { ghostBtn } from "./Sheet";

/** Ajustes → Ayuda: volver a ver la presentación o repetir el recorrido guiado (no tocan tus datos). */
export function HelpSection() {
  const router = useRouter();
  return (
    <div className="grid gap-2">
      <button className={cn(ghostBtn, "w-full justify-start")} onClick={replayIntro}>
        <Presentation className="mr-2 size-4" />
        Ver la presentación de nuevo
      </button>
      <button
        className={cn(ghostBtn, "w-full justify-start")}
        onClick={() => {
          router.push("/");
          startTour();
        }}
      >
        <Compass className="mr-2 size-4" />
        Repetir el recorrido
      </button>
    </div>
  );
}
