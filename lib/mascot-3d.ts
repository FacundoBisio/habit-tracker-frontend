"use client";

import { useSyncExternalStore } from "react";

/** Modelo 3D del personaje (glTF binario). Se descarga solo cuando se usa el modo 3D. */
export const MODEL_URL = "/models/mascot.glb";

/**
 * Los clips que trae el archivo (idle, wave, lift, ...) ya NO se reproducen: el personaje se anima por
 * código (`lib/mascot-3d-rig.ts`) moviendo los nodos del modelo. Quedan en el archivo, pero son opcionales.
 */
export const OPTIONAL_CLIPS = ["idle", "wave", "lift", "drink", "read", "meditate", "run", "sleep", "dance", "celebrate", "poke"] as const;

/** Contrato con el modelo: si falta algo de esto, el 3D no se activa y se usa el 2D. */
export const REQUIRED_NODES = [
  "Root", "Body", "Face", "Eye_L", "Eye_R", "Pupil_L", "Pupil_R", "Eyelid_L", "Eyelid_R", "Brow_L", "Brow_R",
  "Mouth", "Cheek_L", "Cheek_R", "Arm_L", "Arm_R", "Bicep", "Prop_Dumbbell", "Prop_Glass", "Prop_Water", "Prop_Book", "Prop_BookPage",
] as const;
export const REQUIRED_MORPHS = [
  "blink_L", "blink_R", "smile", "mouthOpen", "mouthO", "browAngry", "browRaise", "squash", "stretch", "bicepFlex", "cheeksPuff",
] as const;

// ---------------------------------------------------------------------------------------------
// Preferencia del usuario (3D / 2D) y soporte del dispositivo
// ---------------------------------------------------------------------------------------------

export type MascotMode = "3d" | "2d";
const KEY = "mascot-mode";
const EVENT = "mascotmodechange";

export function readMascotMode(): MascotMode {
  try {
    return localStorage.getItem(KEY) === "2d" ? "2d" : "3d";
  } catch {
    return "3d";
  }
}

export function setMascotMode(mode: MascotMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* almacenamiento bloqueado: vale solo para esta sesión */
  }
  window.dispatchEvent(new Event(EVENT));
}

let webgl: boolean | undefined;
/** ¿El dispositivo tiene WebGL 2? (se prueba una sola vez) */
export function webglSupported(): boolean {
  if (webgl !== undefined) return webgl;
  try {
    const c = document.createElement("canvas");
    webgl = !!c.getContext("webgl2");
  } catch {
    webgl = false;
  }
  return webgl;
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
    mq.removeEventListener("change", cb);
  };
};

const snapshot = () =>
  readMascotMode() === "3d" && webglSupported() && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** ¿Hay que mostrar el personaje 3D? Sí, si el usuario lo eligió, hay WebGL 2 y no pidió menos movimiento. */
export function useMascot3dEnabled(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** Para Ajustes: ¿el dispositivo puede mostrar 3D? */
export function useWebglSupported(): boolean {
  return useSyncExternalStore(() => () => {}, webglSupported, () => true);
}
