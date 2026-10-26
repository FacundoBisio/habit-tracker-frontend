"use client";

export type Theme = "system" | "light" | "dark";

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(t: Theme) {
  try {
    if (t === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", t);
  } catch {
    /* almacenamiento bloqueado: el tema vale solo para esta sesión */
  }
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  window.dispatchEvent(new Event("themechange"));
}

/** Tema efectivo (resuelve "system" con la preferencia del sistema). */
export function effectiveTheme(): "light" | "dark" {
  const t = readTheme();
  if (t !== "system") return t;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
