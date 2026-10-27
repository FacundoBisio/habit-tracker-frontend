"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { NAME_MAX, nameError, nameLength, normalizeName } from "@/lib/domain/name-rules";
import { playActivity } from "@/lib/mascot";
import { toast } from "@/lib/notify";
import { saveName } from "@/lib/store/actions";
import { useSettings } from "@/lib/store/hooks";
import { Sheet, ghostBtn, inputCls, labelCls, primaryBtn } from "./Sheet";

/** Perfil: cómo te llama la app, con un popup para cambiarlo (validado igual que en el servidor). */
export function ProfileSection() {
  const { name } = useSettings();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-[15px]">
          Te llamo <strong className="font-semibold">{name}</strong>
        </p>
        <button className={ghostBtn} onClick={() => setOpen(true)} aria-label="Cambiar nombre">
          <Pencil className="mr-1.5 size-4" />
          Cambiar
        </button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Cambiar nombre">
        {/* El formulario se vuelve a montar en cada apertura: arranca con el nombre actual */}
        {open && <NameForm current={name ?? ""} onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

function NameForm({ current, onDone }: { current: string; onDone: () => void }) {
  const [value, setValue] = useState(current);
  const [touched, setTouched] = useState(false);
  const clean = normalizeName(value);
  const error = nameError(clean);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (error) return;
    if (clean !== current) {
      await saveName(clean);
      toast.success(`Listo, ahora te llamo ${clean}`);
      playActivity("wave", 3500);
    }
    onDone();
  }

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <div>
        <div className="flex items-baseline justify-between">
          <label className={labelCls} htmlFor="profile-name">¿Cómo te llamo?</label>
          <span className="text-xs text-muted" aria-live="polite">{nameLength(clean)}/{NAME_MAX}</span>
        </div>
        <input
          id="profile-name"
          className={inputCls}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setTouched(true);
          }}
          autoComplete="given-name"
          autoFocus
          aria-invalid={touched && !!error}
          aria-describedby={touched && error ? "profile-name-error" : undefined}
        />
        {touched && error && (
          <p id="profile-name-error" className="mt-1.5 text-sm text-danger" role="alert">{error}</p>
        )}
      </div>
      <button type="submit" className={primaryBtn} disabled={touched && !!error}>
        Guardar
      </button>
    </form>
  );
}
