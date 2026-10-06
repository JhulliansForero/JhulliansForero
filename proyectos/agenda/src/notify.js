// Notificaciones locales: se programan en el celular, sin internet.
// Cada vez que cambian los datos se reemplazan todas las pendientes de los próximos días.

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const native = Capacitor.isNativePlatform();
const CHANNEL = "recordatorios";

// Id numérico estable a partir de un texto (el plugin pide enteros de 32 bits).
export function notifId(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  return (Math.abs(h) % 2000000000) + 1;
}

export async function setup(onOpen) {
  if (!native) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL,
      name: "Recordatorios",
      description: "Actividades, hábitos, resumen del día y finanzas",
      importance: 4,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: "#0d7a52",
    });
  } catch {
    /* el canal ya existe o no aplica */
  }
  LocalNotifications.addListener("localNotificationActionPerformed", (e) => {
    const link = e && e.notification && e.notification.extra && e.notification.extra.link;
    if (link) onOpen(link);
  });
}

export async function permission() {
  if (!native) return "unavailable";
  try {
    return (await LocalNotifications.checkPermissions()).display;
  } catch {
    return "unavailable";
  }
}

export async function requestPermission() {
  if (!native) return "unavailable";
  try {
    return (await LocalNotifications.requestPermissions()).display;
  } catch {
    return "denied";
  }
}

export async function exactAlarms() {
  if (!native) return "unavailable";
  try {
    return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm;
  } catch {
    return "granted";
  }
}

export async function openExactAlarmSettings() {
  if (!native) return;
  try {
    await LocalNotifications.changeExactNotificationSetting();
  } catch {
    /* sin pantalla de ajustes en esta versión de Android */
  }
}

function toNative(n) {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    largeBody: n.body,
    channelId: CHANNEL,
    smallIcon: "ic_stat_agenda",
    iconColor: "#0d7a52",
    extra: { link: n.link || "agenda://hoy" },
    schedule: { at: n.at, allowWhileIdle: true },
  };
}

let timer = null;
let running = Promise.resolve();
export function reschedule(build) {
  if (!native) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    running = running.then(() => apply(build())).catch(() => {});
  }, 800);
}

async function apply(list) {
  if ((await permission()) !== "granted") return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }
  if (list.length) await LocalNotifications.schedule({ notifications: list.map(toNative) });
}

export async function test() {
  if (!native) return false;
  if ((await requestPermission()) !== "granted") return false;
  await LocalNotifications.schedule({
    notifications: [
      toNative({
        id: notifId("prueba"),
        title: "¡Las notificaciones funcionan!",
        body: "Así te van a llegar los recordatorios de tu agenda.",
        at: new Date(Date.now() + 3000),
      }),
    ],
  });
  return true;
}
