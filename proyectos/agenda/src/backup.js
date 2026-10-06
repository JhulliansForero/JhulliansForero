// Copia de seguridad: todos los datos en un archivo JSON que se puede guardar
// en Drive, WhatsApp, correo, etc., y restaurar después.

import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import * as store from "./store.js";

export const KEYS = ["acts", "fin", "notes", "habits", "notif"];
const native = Capacitor.isNativePlatform();

export async function exportData() {
  const data = { app: "agenda-jhullians", version: 2, exportedAt: new Date().toISOString() };
  for (const k of KEYS) data[k] = await store.get(k, null);
  const json = JSON.stringify(data, null, 2);
  const name = `agenda-copia-${new Date().toISOString().slice(0, 10)}.json`;
  if (native) {
    const res = await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: "Copia de seguridad de tu agenda", text: "Guarda este archivo en un lugar seguro.", url: res.uri, dialogTitle: "Guardar copia en…" });
    return;
  }
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Lee y valida un archivo de copia. No escribe nada todavía.
export async function readBackup(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("El archivo no es una copia válida de la agenda.");
  }
  if (!data || data.app !== "agenda-jhullians") throw new Error("Este archivo no es una copia de la agenda.");
  const counts = {
    actividades: Array.isArray(data.acts) ? data.acts.length : 0,
    movimientos: data.fin && Array.isArray(data.fin.movs) ? data.fin.movs.length : 0,
    notas: Array.isArray(data.notes) ? data.notes.length : 0,
    habitos: Array.isArray(data.habits) ? data.habits.length : 0,
  };
  return { data, counts };
}

export async function restore(data) {
  for (const k of KEYS) {
    if (data[k] !== undefined && data[k] !== null) await store.set(k, data[k]);
  }
}
