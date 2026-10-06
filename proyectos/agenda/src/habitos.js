// Hábitos diarios: días de la semana, recordatorio opcional y racha.

import * as store from "./store.js";
import { h, uid, ymd, addDays, todayStr, parseYmd, openSheet, toast, confirmButton } from "./ui.js";

export const habits = [];
let ctx = { changed: () => {} };

// Lunes primero, como en el calendario. Valores de Date.getDay().
export const WEEKDAYS = [
  [1, "L"],
  [2, "M"],
  [3, "M"],
  [4, "J"],
  [5, "V"],
  [6, "S"],
  [0, "D"],
];

let saving = Promise.resolve();
export function saveHabits() {
  const snapshot = JSON.parse(JSON.stringify(habits));
  saving = saving.then(() => store.set("habits", snapshot)).catch(() => toast("No se pudo guardar en el celular."));
  ctx.changed();
  return saving;
}

export async function loadHabits(context) {
  ctx = context;
  const saved = await store.get("habits", []);
  habits.splice(0, habits.length, ...(Array.isArray(saved) ? saved : []));
}

export const appliesOn = (hb, date) => (hb.days || []).includes(parseYmd(date).getDay());
export const isDone = (hb, date) => (hb.doneDates || []).includes(date);
export const habitsOn = (date) => habits.filter((hb) => appliesOn(hb, date));

// Días seguidos cumplidos, contando solo los días que aplica el hábito.
// Si hoy aún no lo marca, la racha sigue viva desde ayer.
export function streak(hb) {
  let n = 0;
  let d = new Date();
  if (appliesOn(hb, ymd(d)) && !isDone(hb, ymd(d))) d = addDays(d, -1);
  for (let i = 0; i < 400; i++) {
    const key = ymd(d);
    if (appliesOn(hb, key)) {
      if (isDone(hb, key)) n++;
      else break;
    }
    d = addDays(d, -1);
  }
  return n;
}

export async function toggleHabit(hb, date = todayStr()) {
  const x = habits.find((y) => y.id === hb.id);
  if (!x) return;
  x.doneDates = x.doneDates || [];
  if (x.doneDates.includes(date)) x.doneDates = x.doneDates.filter((d) => d !== date);
  else x.doneDates.push(date);
  // Solo se guarda el último año.
  const cutoff = ymd(addDays(new Date(), -400));
  x.doneDates = x.doneDates.filter((d) => d >= cutoff);
  await saveHabits();
}

export function todaySummary() {
  const t = todayStr();
  const list = habitsOn(t);
  return { total: list.length, done: list.filter((hb) => isDone(hb, t)).length, items: list.map((hb) => ({ n: hb.name, x: isDone(hb, t) })) };
}

// ---------- Editor ----------
export function openHabitSheet(hb) {
  const editing = !!(hb && hb.id);
  let days = editing ? [...hb.days] : [1, 2, 3, 4, 5, 6, 0];
  const name = h("input", { id: "hb-name", type: "text", maxlength: "60", value: editing ? hb.name : "", placeholder: "Ej: Leer 20 minutos, Tomar agua, Gimnasio", autocomplete: "off" });
  const remind = h("input", { id: "hb-time", type: "time", value: editing ? hb.remindAt || "" : "" });
  const err = h("div", { class: "small err-txt", hidden: true });
  const daysBox = h("div", { class: "days", role: "group", "aria-label": "Días" });
  const names = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const drawDays = () =>
    daysBox.replaceChildren(
      ...WEEKDAYS.map(([d, l]) =>
        h(
          "button",
          {
            type: "button",
            "aria-pressed": days.includes(d) ? "true" : "false",
            "aria-label": names[d],
            onclick: () => {
              days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
              drawDays();
            },
          },
          l,
        ),
      ),
    );
  drawDays();

  const del = editing
    ? confirmButton("Eliminar", "¿Eliminar? Toca otra vez", async () => {
        const i = habits.findIndex((x) => x.id === hb.id);
        const removed = i >= 0 ? habits.splice(i, 1)[0] : null;
        sheet.close();
        await saveHabits();
        toast("Eliminaste el hábito", async () => {
          if (removed) habits.push(removed);
          await saveHabits();
        });
      })
    : h("span");

  const form = h(
    "form",
    { style: "display:grid;gap:14px" },
    h("h3", null, editing ? "Editar hábito" : "Nuevo hábito"),
    h("div", { class: "field" }, h("label", { for: "hb-name" }, "Hábito"), name),
    h("div", { class: "field" }, h("span", { class: "lbl" }, "¿Qué días?"), daysBox),
    h(
      "div",
      { class: "field" },
      h("label", { for: "hb-time" }, "Recordarme a las (opcional)"),
      remind,
      h("span", { class: "small" }, "Te llega una notificación ese día si todavía no lo has marcado."),
    ),
    err,
    h(
      "div",
      { class: "sheet-actions" },
      del,
      h(
        "div",
        { style: "display:flex;gap:8px" },
        h("button", { class: "btn", type: "button", onclick: () => sheet.close() }, "Cancelar"),
        h("button", { class: "btn primary", type: "submit" }, editing ? "Guardar" : "Agregar"),
      ),
    ),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const n = name.value.trim();
    if (!n) {
      err.hidden = false;
      err.textContent = "Escribe el nombre del hábito.";
      return;
    }
    if (!days.length) {
      err.hidden = false;
      err.textContent = "Elige al menos un día.";
      return;
    }
    if (editing) {
      const x = habits.find((y) => y.id === hb.id);
      if (x) Object.assign(x, { name: n, days, remindAt: remind.value || "" });
    } else {
      habits.push({ id: uid(), name: n, days, remindAt: remind.value || "", doneDates: [], createdAt: Date.now() });
    }
    sheet.close();
    await saveHabits();
  });
  const sheet = openSheet(form, editing ? "Editar hábito" : "Nuevo hábito");
  if (!editing) setTimeout(() => name.focus(), 60);
}

// Lista para administrar todos los hábitos (también los que no tocan hoy).
export function openHabitsManager() {
  const list = h(
    "ul",
    { class: "mov-list" },
    habits.length
      ? habits.map((hb) =>
          h(
            "li",
            null,
            h(
              "button",
              {
                type: "button",
                class: "mov",
                onclick: () => {
                  sheet.close();
                  openHabitSheet(hb);
                },
              },
              h(
                "span",
                { class: "mov-main" },
                h("span", { class: "t" }, hb.name),
                h(
                  "span",
                  { class: "meta" },
                  hb.days.length === 7 ? "Todos los días" : WEEKDAYS.filter(([d]) => hb.days.includes(d)).map(([, l]) => l).join(" "),
                  hb.remindAt ? ` · ${hb.remindAt}` : "",
                ),
              ),
              h("span", { class: "streak" }, `${streak(hb)} d`),
            ),
          ),
        )
      : h("li", { class: "empty" }, "Aún no tienes hábitos."),
  );
  const content = h(
    "div",
    { style: "display:grid;gap:12px" },
    h("h3", null, "Tus hábitos"),
    list,
    h(
      "div",
      { class: "sheet-actions" },
      h("span"),
      h(
        "button",
        {
          class: "btn primary",
          type: "button",
          onclick: () => {
            sheet.close();
            openHabitSheet(null);
          },
        },
        "+ Nuevo hábito",
      ),
    ),
  );
  const sheet = openSheet(content, "Hábitos");
}

// Sección de hábitos para la pantalla Hoy.
export function habitsSection() {
  const t = todayStr();
  const list = habitsOn(t);
  const s = todaySummary();
  const head = h(
    "div",
    { class: "section-h" },
    h("h2", null, "Hábitos"),
    h("button", { class: "chip-btn", type: "button", onclick: openHabitsManager }, habits.length ? `${s.done}/${s.total} · Editar` : "+ Hábito"),
  );
  if (!habits.length) {
    return [head, h("div", { class: "empty" }, "Crea hábitos como leer, hacer ejercicio o tomar agua, y márcalos cada día para mantener la racha.")];
  }
  if (!list.length) return [head, h("div", { class: "empty" }, "Hoy no te toca ningún hábito.")];
  return [
    head,
    h(
      "div",
      { class: "habits" },
      list.map((hb) => {
        const done = isDone(hb, t);
        const st = streak(hb);
        return h(
          "button",
          { type: "button", class: "habit" + (done ? " done" : ""), "aria-pressed": done ? "true" : "false", onclick: () => toggleHabit(hb, t) },
          h("span", { class: "habit-check", html: '<svg viewBox="0 0 24 24" fill="none" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' }),
          h("span", { class: "habit-name" }, hb.name),
          h("span", { class: "habit-streak" }, st ? `Racha de ${st} ${st === 1 ? "día" : "días"}` : "Empieza hoy"),
        );
      }),
    ),
  ];
}
