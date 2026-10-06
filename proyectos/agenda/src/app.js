import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import * as store from "./store.js";
import {
  $, h, ymd, parseYmd, addDays, cap, todayStr, isDate, uid, monthKey,
  fmtLong, fmtShort, fmtMonth, fmtMoney, ARROW, sheets, openSheet, toast, initToast, confirmButton,
} from "./ui.js";
import * as finanzas from "./finanzas.js";
import * as notas from "./notas.js";
import * as habitos from "./habitos.js";
import * as notify from "./notify.js";
import * as backup from "./backup.js";
import * as importar from "./importar.js";

const APP_VERSION = "2.1";

// ---------- Constantes ----------
const CATS = { estudio: "Estudio", practica: "Práctica", personal: "Personal", salud: "Salud", otro: "Otro" };
const REPEAT = { none: "No se repite", daily: "Todos los días", weekdays: "Entre semana (L–V)", weekly: "Cada semana", monthly: "Cada mes" };
const REMIND = { "-1": "Sin recordatorio", 0: "A la hora", 5: "5 minutos antes", 10: "10 minutos antes", 15: "15 minutos antes", 30: "30 minutos antes", 60: "1 hora antes", 1440: "1 día antes" };
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const BELL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>';
const REPEAT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/></svg>';
const catVar = (c) => `--cat: var(--c-${CATS[c] ? c : "otro"})`;

const native = Capacitor.isNativePlatform();
const WidgetBridge = registerPlugin("WidgetBridge");

// ---------- Estado ----------
const state = {
  tab: "hoy",
  acts: [],
  month: (() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  })(),
  selected: todayStr(),
  notif: { morning: true, morningAt: "07:00", evening: true, eveningAt: "21:00", defaultRemind: 15 },
};

// ---------- Actividades ----------
let saving = Promise.resolve();
function saveActs() {
  const snapshot = state.acts.map((a) => ({ ...a }));
  saving = saving.then(() => store.set("acts", snapshot)).catch(() => toast("No se pudo guardar en el celular."));
  dataChanged();
  return saving;
}
function sortActs(a, b) {
  return (
    (a.date || "").localeCompare(b.date || "") ||
    ((a.start || "") === "" ? -1 : 0) - ((b.start || "") === "" ? -1 : 0) ||
    (a.start || "").localeCompare(b.start || "") ||
    (a.title || "").localeCompare(b.title || "")
  );
}

// ¿La actividad (o su serie) cae en esta fecha?
function occursOn(a, date) {
  if (!a.repeat || a.repeat === "none") return a.date === date;
  if (date < a.date || (a.until && date > a.until)) return false;
  if ((a.skipDates || []).includes(date)) return false;
  const d = parseYmd(date);
  const base = parseYmd(a.date);
  switch (a.repeat) {
    case "daily":
      return true;
    case "weekdays":
      return d.getDay() >= 1 && d.getDay() <= 5;
    case "weekly":
      return d.getDay() === base.getDay();
    case "monthly":
      return d.getDate() === base.getDate();
    default:
      return false;
  }
}
const isRepeating = (a) => !!a && !!a.repeat && a.repeat !== "none";
function occurrence(a, date) {
  return { ...a, date, baseDate: a.date, done: isRepeating(a) ? (a.doneDates || []).includes(date) : !!a.done };
}
const actsOn = (date) => state.acts.filter((a) => occursOn(a, date)).map((a) => occurrence(a, date)).sort(sortActs);
const timeLabel = (a) => (!a.start ? "Todo el día" : a.end ? `${a.start}–${a.end}` : a.start);

function newAct(fields) {
  return {
    id: uid(),
    title: fields.title,
    date: fields.date,
    start: fields.start || "",
    end: fields.end || "",
    category: CATS[fields.category] ? fields.category : "otro",
    notes: fields.notes || "",
    repeat: fields.repeat || "none",
    until: fields.until || "",
    remind: Number.isFinite(fields.remind) ? fields.remind : state.notif.defaultRemind,
    done: false,
    doneDates: [],
    skipDates: [],
    createdAt: Date.now(),
  };
}

async function toggleDone(occ) {
  const a = state.acts.find((y) => y.id === occ.id);
  if (!a) return;
  if (isRepeating(a)) {
    a.doneDates = a.doneDates || [];
    if (a.doneDates.includes(occ.date)) a.doneDates = a.doneDates.filter((d) => d !== occ.date);
    else a.doneDates.push(occ.date);
    const cutoff = ymd(addDays(new Date(), -400));
    a.doneDates = a.doneDates.filter((d) => d >= cutoff);
  } else {
    a.done = !a.done;
  }
  render();
  await saveActs();
}

// ---------- Elementos de lista ----------
function actItem(o) {
  return h(
    "li",
    { class: "act" + (o.done ? " done" : ""), style: catVar(o.category) },
    h("button", {
      class: "chk",
      type: "button",
      "aria-pressed": o.done ? "true" : "false",
      "aria-label": (o.done ? "Marcar pendiente: " : "Marcar hecha: ") + (o.title || ""),
      html: CHECK_SVG,
      onclick: () => toggleDone(o),
    }),
    h(
      "button",
      { class: "act-body", type: "button", onclick: () => openActSheet(o) },
      h("span", { class: "t" }, o.title || "(sin título)"),
      h(
        "span",
        { class: "meta" },
        h("span", { class: "time" }, timeLabel(o)),
        h("span", { class: "tag" }, h("i"), CATS[o.category] || "Otro"),
        isRepeating(o) ? h("span", { class: "mini-ic", title: REPEAT[o.repeat], "aria-label": REPEAT[o.repeat], html: REPEAT_SVG }) : null,
        o.remind >= 0 ? h("span", { class: "mini-ic", title: REMIND[o.remind] || "Recordatorio", "aria-label": REMIND[o.remind] || "Recordatorio", html: BELL_SVG }) : null,
      ),
    ),
  );
}
const dayList = (date) => h("ul", { class: "list" }, actsOn(date).map(actItem));
const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// ---------- Pantalla: Hoy ----------
function renderHoy() {
  const v = $("#v-hoy");
  const today = todayStr();
  const mine = actsOn(today);
  const done = mine.filter((a) => a.done).length;
  const total = mine.length;
  const hs = habitos.todaySummary();
  const all = total + hs.total;
  const allDone = done + hs.done;
  const pct = all ? Math.round((allDone / all) * 100) : 0;
  const now = nowHHMM();
  const next = mine.find((a) => !a.done && a.start && (a.end || a.start) >= now);
  const kids = [];

  kids.push(
    h(
      "div",
      { class: "summary" },
      h(
        "div",
        { class: "summary-row" },
        h("div", { class: "summary-num" }, String(allDone), h("small", null, ` / ${all} hechas`)),
        h(
          "div",
          { class: "summary-txt" },
          all === 0 ? "Día libre por ahora" : allDone === all ? "¡Todo listo por hoy!" : `${all - allDone} pendiente${all - allDone === 1 ? "" : "s"}`,
        ),
      ),
      h("div", { class: "bar", role: "progressbar", "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100 }, h("i", { style: `width:${pct}%` })),
      next ? h("div", { class: "next-up" }, h("span", { class: "eyebrow" }, next.start <= now ? "Ahora" : "Sigue"), h("span", { class: "next-t" }, next.title), h("span", { class: "time" }, timeLabel(next))) : null,
    ),
  );

  kids.push(h("div", { class: "section-h" }, h("h2", null, "Actividades"), h("span", null, `${done}/${total}`)));
  if (!mine.length)
    kids.push(
      h(
        "div",
        { class: "empty" },
        h("strong", null, "Nada para hoy todavía"),
        h("span", null, "Toca + para agregar una actividad. Puedes ponerle hora, recordatorio y hacer que se repita."),
      ),
    );
  else kids.push(dayList(today));

  kids.push(...habitos.habitsSection());

  const groups = [];
  for (let i = 1; i <= 7; i++) {
    const d = ymd(addDays(new Date(), i));
    const a = actsOn(d);
    if (a.length)
      groups.push(h("div", { class: "day-group" }, h("div", { class: "day-label" }, cap(fmtShort.format(parseYmd(d)))), h("ul", { class: "list" }, a.map(actItem))));
  }
  kids.push(h("div", { class: "section-h" }, h("h2", null, "Próximos 7 días"), h("span", null, groups.length ? "" : "sin nada")));
  if (groups.length) kids.push(...groups);
  else kids.push(h("div", { class: "empty" }, "Tu semana está despejada."));
  v.replaceChildren(...kids);
}

// ---------- Pantalla: Calendario ----------
function gridStart(month) {
  const d = new Date(month);
  return addDays(d, -((d.getDay() + 6) % 7));
}
function renderCal() {
  const v = $("#v-cal");
  const m = state.month;
  const start = gridStart(m);
  const today = todayStr();
  const head = h(
    "div",
    { class: "cal-head" },
    h("h2", null, cap(fmtMonth.format(m))),
    h(
      "div",
      { class: "cal-nav" },
      h(
        "button",
        {
          class: "chip-btn",
          type: "button",
          onclick: () => {
            const d = new Date();
            state.month = new Date(d.getFullYear(), d.getMonth(), 1);
            state.selected = today;
            render();
          },
        },
        "Hoy",
      ),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Mes anterior", onclick: () => shiftMonth(-1), html: ARROW("M15 6l-6 6 6 6") }),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Mes siguiente", onclick: () => shiftMonth(1), html: ARROW("M9 6l6 6-6 6") }),
    ),
  );
  const grid = h("div", { class: "grid" });
  ["L", "M", "M", "J", "V", "S", "D"].forEach((d) => grid.append(h("div", { class: "dow", "aria-hidden": "true" }, d)));
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const ds = ymd(d);
    const a = actsOn(ds);
    const dots = h("span", { class: "dots" });
    a.slice(0, 4).forEach((x) => dots.append(h("i", { style: catVar(x.category) })));
    const cls = ["cell", d.getMonth() !== m.getMonth() ? "out" : "", ds === today ? "today" : "", ds === state.selected ? "sel" : ""].join(" ");
    grid.append(
      h(
        "button",
        {
          class: cls,
          type: "button",
          "aria-label": `${fmtLong.format(d)}: ${a.length} actividades`,
          "aria-pressed": ds === state.selected ? "true" : "false",
          onclick: () => {
            state.selected = ds;
            if (d.getMonth() !== m.getMonth()) state.month = new Date(d.getFullYear(), d.getMonth(), 1);
            render();
          },
        },
        h("span", { class: "n" }, String(d.getDate())),
        dots,
      ),
    );
  }
  const legend = h(
    "div",
    { class: "legend" },
    Object.entries(CATS).map(([k, l]) => h("span", { class: "tag", style: catVar(k) }, h("i"), l)),
  );
  const sel = state.selected;
  const selActs = actsOn(sel);
  v.replaceChildren(
    head,
    grid,
    legend,
    h("div", { class: "section-h" }, h("h2", null, cap(fmtLong.format(parseYmd(sel)))), h("span", null, `${selActs.length} en total`)),
    selActs.length ? dayList(sel) : h("div", { class: "empty" }, "Nada este día. Toca + para agregar algo."),
  );
}
function shiftMonth(n) {
  state.month = new Date(state.month.getFullYear(), state.month.getMonth() + n, 1);
  const now = new Date();
  const isThisMonth = state.month.getMonth() === now.getMonth() && state.month.getFullYear() === now.getFullYear();
  state.selected = ymd(isThisMonth ? now : state.month);
  render();
}

// ---------- Hoja: agregar / editar actividad ----------
function selectEl(id, options, value) {
  const s = h("select", { id });
  for (const [k, l] of Object.entries(options)) s.append(h("option", { value: k, selected: String(k) === String(value) }, l));
  return s;
}

function openActSheet(o) {
  const editing = !!(o && o.id);
  const a = editing ? state.acts.find((x) => x.id === o.id) || null : null;
  if (editing && !a) return;
  const data = Object.assign(
    { title: "", date: state.tab === "cal" ? state.selected : todayStr(), start: "", end: "", category: "estudio", notes: "", repeat: "none", remind: state.notif.defaultRemind, until: "" },
    a || {},
  );
  let cat = CATS[data.category] ? data.category : "otro";
  const title = h("input", { id: "f-title", type: "text", maxlength: "120", value: data.title, placeholder: "Ej: Repasar Spring Boot", autocomplete: "off" });
  const date = h("input", { id: "f-date", type: "date", value: data.date });
  const st = h("input", { id: "f-start", type: "time", value: data.start || "" });
  const en = h("input", { id: "f-end", type: "time", value: data.end || "" });
  const repeat = selectEl("f-repeat", REPEAT, data.repeat || "none");
  const until = h("input", { id: "f-until", type: "date", value: data.until || "" });
  const untilWrap = h("div", { class: "field", hidden: (data.repeat || "none") === "none" }, h("label", { for: "f-until" }, "Repetir hasta (opcional)"), until);
  const dateLbl = h("label", { for: "f-date" }, isRepeating(data) ? "Desde" : "Día");
  repeat.addEventListener("change", () => {
    untilWrap.hidden = repeat.value === "none";
    dateLbl.textContent = repeat.value === "none" ? "Día" : "Desde";
  });
  const remind = selectEl("f-remind", REMIND, Number.isFinite(data.remind) ? data.remind : -1);
  const notes = h("textarea", { id: "f-notes", rows: "3", maxlength: "1000", placeholder: "Detalles, enlaces, lo que necesites recordar" });
  notes.value = data.notes || "";
  const catsEl = h("div", { class: "cats", role: "group", "aria-label": "Categoría" });
  const drawCats = () =>
    catsEl.replaceChildren(
      ...Object.entries(CATS).map(([k, l]) =>
        h(
          "button",
          {
            type: "button",
            style: catVar(k),
            "aria-pressed": k === cat ? "true" : "false",
            onclick: () => {
              cat = k;
              drawCats();
            },
          },
          h("i"),
          l,
        ),
      ),
    );
  drawCats();

  const err = h("div", { class: "small err-txt", hidden: true });
  const fail = (msg) => {
    err.hidden = false;
    err.textContent = msg;
  };

  const extra = h("div", { class: "row-actions" });
  if (editing) {
    extra.append(
      confirmButton(isRepeating(a) ? "Eliminar la serie" : "Eliminar", "¿Eliminar? Toca otra vez", async () => {
        sheet.close();
        state.acts = state.acts.filter((x) => x.id !== a.id);
        render();
        await saveActs();
        toast(`Eliminaste “${a.title}”`, async () => {
          state.acts.push(a);
          await saveActs();
          render();
        });
      }),
    );
    if (isRepeating(a) && o.date) {
      extra.append(
        h(
          "button",
          {
            class: "btn",
            type: "button",
            onclick: async () => {
              a.skipDates = [...(a.skipDates || []), o.date];
              sheet.close();
              render();
              await saveActs();
              toast(`Quitada solo el ${fmtShort.format(parseYmd(o.date))}`, async () => {
                a.skipDates = a.skipDates.filter((d) => d !== o.date);
                await saveActs();
                render();
              });
            },
          },
          "Solo este día",
        ),
      );
    }
  }

  const form = h(
    "form",
    { style: "display:grid;gap:12px" },
    h("h3", null, editing ? "Editar actividad" : "Nueva actividad"),
    editing && isRepeating(a) ? h("div", { class: "small" }, "Se repite: los cambios aplican a toda la serie.") : null,
    h("div", { class: "field" }, h("label", { for: "f-title" }, "Qué vas a hacer"), title),
    h(
      "div",
      { class: "row3" },
      h("div", { class: "field" }, dateLbl, date),
      h("div", { class: "field" }, h("label", { for: "f-start" }, "Inicio"), st),
      h("div", { class: "field" }, h("label", { for: "f-end" }, "Fin"), en),
    ),
    h("div", { class: "field" }, h("span", { class: "lbl" }, "Categoría"), catsEl),
    h("div", { class: "row2" }, h("div", { class: "field" }, h("label", { for: "f-repeat" }, "Repetir"), repeat), h("div", { class: "field" }, h("label", { for: "f-remind" }, "Recordatorio"), remind)),
    untilWrap,
    h("div", { class: "field" }, h("label", { for: "f-notes" }, "Notas"), notes),
    err,
    editing ? extra : null,
    h(
      "div",
      { class: "sheet-actions end" },
      h("button", { class: "btn", type: "button", onclick: () => sheet.close() }, "Cancelar"),
      h("button", { class: "btn primary", type: "submit" }, editing ? "Guardar" : "Agregar"),
    ),
  );
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const t = title.value.trim();
    if (!t) {
      fail("Escribe qué vas a hacer.");
      title.focus();
      return;
    }
    if (!isDate(date.value)) return fail("Elige un día.");
    if (en.value && !st.value) return fail("Si pones hora de fin, pon también la de inicio.");
    if (en.value && st.value && en.value <= st.value) return fail("La hora de fin debe ser después de la de inicio.");
    if (repeat.value !== "none" && until.value && until.value < date.value) return fail("La fecha final de la repetición debe ser después del inicio.");
    const body = {
      title: t,
      date: date.value,
      start: st.value || "",
      end: en.value || "",
      category: cat,
      notes: notes.value.trim(),
      repeat: repeat.value,
      until: repeat.value === "none" ? "" : until.value || "",
      remind: Number(remind.value),
    };
    if (editing) Object.assign(a, body);
    else state.acts.push(newAct(body));
    state.selected = body.date;
    sheet.close();
    render();
    await saveActs();
  });
  const sheet = openSheet(form, editing ? "Editar actividad" : "Nueva actividad");
  if (!editing) setTimeout(() => title.focus(), 60);
}

// ---------- Hoja: pegar datos que entrega otro chat ----------
function openPasteSheet() {
  const box = h("textarea", { id: "p-text", rows: "9", placeholder: "Pega aquí el bloque de datos que te dio Claude (empieza con { y termina con })", spellcheck: "false", class: "mono" });
  const preview = h("div", { class: "paste-preview", hidden: true });
  let parsed = null;

  const existing = () => ({
    acts: new Set(state.acts.map(importar.keyAct)),
    movs: new Set(finanzas.fin.movs.map(importar.keyMov)),
    fixed: new Set(finanzas.fin.fixed.map(importar.keyFixed)),
    notes: new Set(notas.notes.map(importar.keyNote)),
    habits: new Set(habitos.habits.map(importar.keyHabit)),
  });
  // Quita repetidos (contra lo que ya hay y dentro del mismo bloque).
  const fresh = (list, keyFn, seen) => {
    const out = [];
    for (const x of list) {
      const k = keyFn(x);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(x);
    }
    return out;
  };

  const review = () => {
    preview.hidden = false;
    try {
      const p = importar.parse(box.value, todayStr());
      const ex = existing();
      parsed = {
        acts: fresh(p.acts, importar.keyAct, ex.acts),
        movs: fresh(p.movs, importar.keyMov, ex.movs),
        fixed: fresh(p.fixed, importar.keyFixed, ex.fixed),
        notes: fresh(p.notes, importar.keyNote, ex.notes),
        habits: fresh(p.habits, importar.keyHabit, ex.habits),
      };
      const dup =
        p.acts.length + p.movs.length + p.fixed.length + p.notes.length + p.habits.length -
        (parsed.acts.length + parsed.movs.length + parsed.fixed.length + parsed.notes.length + parsed.habits.length);
      const gastos = parsed.movs.filter((m) => m.type === "gasto");
      const ingresos = parsed.movs.filter((m) => m.type === "ingreso");
      const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
      const rows = [
        [parsed.acts.length, pl(parsed.acts.length, "actividad", "actividades")],
        [gastos.length, `${pl(gastos.length, "gasto", "gastos")} (${fmtMoney(gastos.reduce((s, m) => s + m.amount, 0))})`],
        [ingresos.length, `${pl(ingresos.length, "ingreso", "ingresos")} (${fmtMoney(ingresos.reduce((s, m) => s + m.amount, 0))})`],
        [parsed.fixed.length, `${pl(parsed.fixed.length, "movimiento fijo", "movimientos fijos")} (empiezan el próximo mes)`],
        [parsed.notes.length, pl(parsed.notes.length, "nota", "notas")],
        [parsed.habits.length, pl(parsed.habits.length, "hábito", "hábitos")],
      ].filter(([n]) => n > 0);
      const total = rows.reduce((s, [n]) => s + n, 0);
      preview.replaceChildren(
        ...[
          h("b", null, total ? "Se va a agregar:" : "No hay nada nuevo para agregar."),
          rows.length ? h("ul", null, rows.map(([, l]) => h("li", null, l))) : null,
          dup > 0 ? h("p", { class: "small" }, `${dup} ${dup === 1 ? "elemento ya estaba" : "elementos ya estaban"} en tu agenda y se omiten.`) : null,
          p.errors.length ? h("div", { class: "small err-txt" }, h("p", null, "No se pudieron leer:"), h("ul", null, p.errors.slice(0, 8).map((e) => h("li", null, e)))) : null,
        ].filter(Boolean),
      );
      addBtn.disabled = total === 0;
    } catch (e) {
      parsed = null;
      addBtn.disabled = true;
      preview.replaceChildren(h("span", { class: "err-txt" }, e.message));
    }
  };

  const apply = async () => {
    if (!parsed) return;
    const p = parsed;
    const current = monthKey(new Date());
    for (const a of p.acts) state.acts.push(newAct(a));
    for (const f of p.fixed) finanzas.fin.fixed.push({ id: uid(), ...f, active: true, startMonth: current, posted: [current] });
    for (const n of p.notes) notas.notes.push({ id: uid(), ...n, createdAt: Date.now(), updatedAt: Date.now() });
    for (const x of p.habits) habitos.habits.push({ id: uid(), ...x, doneDates: [], createdAt: Date.now() });
    if (p.movs.length) await finanzas.addMovs(p.movs, "importado");
    else if (p.fixed.length) await finanzas.saveFin();
    if (p.notes.length) await notas.saveNotes();
    if (p.habits.length) await habitos.saveHabits();
    await saveActs();
    sheet.close();
    render();
    const n = p.acts.length + p.movs.length + p.fixed.length + p.notes.length + p.habits.length;
    toast(`Listo: agregué ${n} ${n === 1 ? "elemento" : "elementos"} a tu agenda.`);
  };

  const addBtn = h("button", { class: "btn primary", type: "button", disabled: true, onclick: apply }, "Agregar a mi agenda");
  box.addEventListener("input", () => {
    parsed = null;
    addBtn.disabled = true;
    preview.hidden = true;
  });
  const content = h(
    "div",
    { style: "display:grid;gap:12px" },
    h("h3", null, "Pegar datos"),
    h("p", { class: "small" }, "Copia el bloque de datos que te dio Claude en otro chat y pégalo aquí. Se agrega a lo que ya tienes; no se borra nada y lo repetido se omite."),
    box,
    preview,
    h(
      "div",
      { class: "sheet-actions end" },
      h("button", { class: "btn", type: "button", onclick: () => sheet.close() }, "Cancelar"),
      h("button", { class: "btn", type: "button", onclick: review }, "Revisar"),
      addBtn,
    ),
  );
  const sheet = openSheet(content, "Pegar datos");
  setTimeout(() => box.focus(), 60);
}

// ---------- Hoja: ajustes ----------
async function openSettings() {
  const n = state.notif;
  const permRow = h("div", { class: "notice" });
  const drawPerm = (p, ex) => {
    if (!native) {
      permRow.replaceChildren(h("span", null, "Las notificaciones funcionan en la app instalada en el celular (APK)."));
      return;
    }
    if (p === "granted") {
      permRow.replaceChildren(
        h("span", null, ex === "denied" ? "Activadas, pero pueden llegar unos minutos tarde." : "Notificaciones activadas ✓"),
        h(
          "div",
          { class: "notice-btns" },
          ex === "denied" ? h("button", { type: "button", onclick: () => notify.openExactAlarmSettings() }, "Hacerlas puntuales") : null,
          h(
            "button",
            {
              type: "button",
              onclick: async () => {
                const ok = await notify.test();
                toast(ok ? "En 3 segundos te llega una notificación de prueba." : "No se pudo enviar la prueba.");
              },
            },
            "Probar",
          ),
        ),
      );
    } else {
      permRow.replaceChildren(
        h("span", null, "Las notificaciones están apagadas."),
        h(
          "button",
          {
            type: "button",
            onclick: async () => {
              const r = await notify.requestPermission();
              if (r !== "granted") toast("Actívalas en Ajustes del celular → Apps → Agenda → Notificaciones.");
              drawPerm(r, await notify.exactAlarms());
              rescheduleNotifications();
            },
          },
          "Activar",
        ),
      );
    }
  };
  drawPerm(await notify.permission(), await notify.exactAlarms());

  const morning = h("input", { id: "s-morning", type: "checkbox", checked: n.morning });
  const morningAt = h("input", { id: "s-morning-at", type: "time", value: n.morningAt, "aria-label": "Hora del resumen" });
  const evening = h("input", { id: "s-evening", type: "checkbox", checked: n.evening });
  const eveningAt = h("input", { id: "s-evening-at", type: "time", value: n.eveningAt, "aria-label": "Hora del recordatorio de gastos" });
  const defRemind = selectEl("s-def-remind", REMIND, n.defaultRemind);

  const importInput = h("input", { id: "s-import", type: "file", accept: "application/json,.json", hidden: true });
  const importBox = h("div", { class: "small", hidden: true });
  importInput.addEventListener("change", async () => {
    const file = importInput.files && importInput.files[0];
    importInput.value = "";
    if (!file) return;
    try {
      const { data, counts } = await backup.readBackup(file);
      importBox.hidden = false;
      importBox.replaceChildren(
        h("p", null, `La copia tiene ${counts.actividades} actividades, ${counts.movimientos} movimientos, ${counts.notas} notas y ${counts.habitos} hábitos. Reemplaza lo que tienes ahora en este celular.`),
        confirmButton("Restaurar esta copia", "¿Seguro? Toca otra vez", async () => {
          await backup.restore(data);
          location.reload();
        }),
      );
    } catch (e) {
      importBox.hidden = false;
      importBox.replaceChildren(h("span", { class: "err-txt" }, e.message || "No se pudo leer el archivo."));
    }
  });

  const widgetNote = h("div", { class: "small", hidden: true });
  const pin = async (kind) => {
    try {
      const r = await WidgetBridge.pin({ kind });
      if (!r || !r.supported) throw new Error("no");
      widgetNote.textContent = "Confirma en el aviso de tu celular para ponerlo en la pantalla de inicio.";
    } catch {
      widgetNote.textContent = "Tu celular no deja agregarlo desde aquí. Mantén presionada la pantalla de inicio → Widgets → Agenda.";
    }
    widgetNote.hidden = false;
  };

  const form = h(
    "form",
    { style: "display:grid;gap:16px" },
    h("h3", null, "Ajustes"),
    h(
      "section",
      { class: "set-group" },
      h("h4", null, "Pegar datos de otro chat"),
      h("span", { class: "small" }, "Agrega de una vez actividades, gastos, notas o hábitos que te haya organizado Claude."),
      h(
        "button",
        {
          class: "btn primary",
          type: "button",
          onclick: () => {
            sheet.close();
            openPasteSheet();
          },
        },
        "Pegar datos",
      ),
    ),
    h(
      "section",
      { class: "set-group" },
      h("h4", null, "Notificaciones"),
      permRow,
      h("div", { class: "set-row" }, h("label", { class: "check", for: "s-morning" }, morning, "Resumen del día en la mañana"), morningAt),
      h("div", { class: "set-row" }, h("label", { class: "check", for: "s-evening" }, evening, "Recordarme anotar los gastos"), eveningAt),
      h("div", { class: "field" }, h("label", { for: "s-def-remind" }, "Recordatorio para actividades nuevas"), defRemind),
      h("span", { class: "small" }, "Los hábitos con hora y los movimientos fijos de finanzas también te avisan."),
    ),
    native
      ? h(
          "section",
          { class: "set-group" },
          h("h4", null, "Widgets"),
          h(
            "div",
            { class: "widget-btns" },
            [
              ["resumen", "Resumen"],
              ["agenda", "Hoy"],
              ["finanzas", "Finanzas"],
              ["nota", "Nota"],
            ].map(([k, l]) => h("button", { class: "btn", type: "button", onclick: () => pin(k) }, l)),
          ),
          widgetNote,
          h("span", { class: "small" }, "También puedes mantener presionada la pantalla de inicio → Widgets → Agenda."),
        )
      : null,
    h(
      "section",
      { class: "set-group" },
      h("h4", null, "Copia de seguridad"),
      h("span", { class: "small" }, "Todo se guarda solo en este celular. Guarda una copia en Drive o WhatsApp de vez en cuando, por si lo pierdes o lo cambias."),
      h(
        "div",
        { class: "fin-actions" },
        h(
          "button",
          {
            class: "btn",
            type: "button",
            onclick: async () => {
              try {
                await backup.exportData();
              } catch {
                toast("No se pudo crear la copia.");
              }
            },
          },
          "Guardar copia",
        ),
        h("button", { class: "btn", type: "button", onclick: () => importInput.click() }, "Restaurar copia"),
      ),
      importInput,
      importBox,
    ),
    h(
      "div",
      { class: "sheet-actions" },
      h("span", { class: "small" }, `Versión ${APP_VERSION}`),
      h(
        "div",
        { style: "display:flex;gap:8px" },
        h("button", { class: "btn", type: "button", onclick: () => sheet.close() }, "Cerrar"),
        h("button", { class: "btn primary", type: "submit" }, "Guardar"),
      ),
    ),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    state.notif = {
      morning: morning.checked,
      morningAt: morningAt.value || "07:00",
      evening: evening.checked,
      eveningAt: eveningAt.value || "21:00",
      defaultRemind: Number(defRemind.value),
    };
    await store.set("notif", state.notif);
    sheet.close();
    toast("Ajustes guardados.");
    rescheduleNotifications();
  });
  const sheet = openSheet(form, "Ajustes");
}

// ---------- Notificaciones ----------
const at = (date, hhmm) => {
  const [hh, mm] = (hhmm || "08:00").split(":").map(Number);
  const d = parseYmd(date);
  d.setHours(hh, mm, 0, 0);
  return d;
};
const leadText = (minutes) => (minutes >= 60 ? `En ${minutes / 60} ${minutes === 60 ? "hora" : "horas"}` : `En ${minutes} minutos`);

function buildNotifications() {
  const n = state.notif;
  const now = new Date();
  const list = [];
  for (let i = 0; i < 8; i++) {
    const date = ymd(addDays(now, i));
    const dayActs = actsOn(date);

    for (const o of dayActs) {
      if (o.done || !(o.remind >= 0)) continue;
      let when;
      let lead;
      if (o.remind >= 1440) {
        when = at(ymd(addDays(parseYmd(date), -1)), "20:00");
        lead = "Mañana";
      } else if (o.start) {
        when = new Date(at(date, o.start).getTime() - o.remind * 60000);
        lead = o.remind > 0 ? leadText(o.remind) : "Ahora";
      } else {
        when = at(date, "08:00");
        lead = "Hoy";
      }
      if (when <= now) continue;
      list.push({
        id: notify.notifId(`act:${o.id}:${date}`),
        title: o.title,
        body: `${lead} · ${timeLabel(o)} · ${CATS[o.category] || "Otro"}${o.notes ? "\n" + o.notes.slice(0, 120) : ""}`,
        at: when,
        link: "agenda://hoy",
      });
    }

    const hb = habitos.habitsOn(date);
    if (n.morning) {
      const when = at(date, n.morningAt);
      if (when > now) {
        const parts = [];
        if (dayActs.length)
          parts.push(
            `${dayActs.length} ${dayActs.length === 1 ? "actividad" : "actividades"} (` +
              dayActs
                .slice(0, 3)
                .map((a) => (a.start ? `${a.start} ${a.title}` : a.title))
                .join(", ") +
              (dayActs.length > 3 ? "…" : "") +
              ")",
          );
        if (hb.length) parts.push(`${hb.length} ${hb.length === 1 ? "hábito" : "hábitos"}`);
        list.push({
          id: notify.notifId(`morning:${date}`),
          title: "Buenos días, Jhullians",
          body: parts.length ? `Hoy tienes ${parts.join(" y ")}.` : "Tu agenda de hoy está libre. Buen momento para adelantar algo.",
          at: when,
          link: "agenda://hoy",
        });
      }
    }

    for (const x of hb) {
      if (!x.remindAt || habitos.isDone(x, date)) continue;
      const when = at(date, x.remindAt);
      if (when <= now) continue;
      const s = habitos.streak(x);
      list.push({
        id: notify.notifId(`habit:${x.id}:${date}`),
        title: x.name,
        body: s ? `Llevas ${s} ${s === 1 ? "día" : "días"} seguidos. No rompas la racha.` : "Hoy es buen día para empezar la racha.",
        at: when,
        link: "agenda://hoy",
      });
    }

    const d = parseYmd(date);
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    for (const f of finanzas.fin.fixed) {
      if (!f.active || d.getDate() !== Math.min(f.day, dim)) continue;
      const when = at(date, "09:00");
      if (when <= now) continue;
      list.push({
        id: notify.notifId(`fixed:${f.id}:${date}`),
        title: f.type === "ingreso" ? `Hoy entra: ${f.desc}` : `Hoy toca pagar: ${f.desc}`,
        body: `${f.type === "ingreso" ? "+" : "−"}${fmtMoney(f.amount)}. Se registra solo en tus finanzas.`,
        at: when,
        link: "agenda://finanzas",
      });
    }

    if (n.evening) {
      const when = at(date, n.eveningAt);
      if (when > now)
        list.push({
          id: notify.notifId(`evening:${date}`),
          title: "¿Anotaste tus gastos de hoy?",
          body: "Toca para registrar lo que gastaste y mantener tu saldo al día.",
          at: when,
          link: "agenda://finanzas/gasto",
        });
    }
  }
  return list.sort((a, b) => a.at - b.at).slice(0, 64);
}
const rescheduleNotifications = () => notify.reschedule(buildNotifications);

// ---------- Widgets ----------
let widgetTimer = null;
function updateWidgets() {
  if (!native) return;
  clearTimeout(widgetTimer);
  widgetTimer = setTimeout(() => {
    const items = [];
    for (let i = 0; i <= 14 && items.length < 60; i++) {
      for (const o of actsOn(ymd(addDays(new Date(), i)))) items.push({ t: o.title, d: o.date, s: o.start || "", e: o.end || "", c: o.category, x: !!o.done });
    }
    const hs = habitos.todaySummary();
    WidgetBridge.update({
      agenda: JSON.stringify({ items: items.slice(0, 60), habits: { day: todayStr(), total: hs.total, done: hs.done, items: hs.items.slice(0, 6) } }),
      finanzas: JSON.stringify(finanzas.widgetPayload()),
      nota: JSON.stringify(notas.widgetPayload() || {}),
    }).catch(() => {});
  }, 300);
}

// Cualquier cambio de datos deja al día widgets y notificaciones.
function dataChanged() {
  updateWidgets();
  rescheduleNotifications();
}

// ---------- Pestañas y render ----------
const TABS = ["hoy", "cal", "fin", "notas"];
function setTab(t) {
  state.tab = t;
  store.set("tab", t);
  document.querySelectorAll("nav.tabs button").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === t ? "page" : "false"));
  for (const k of TABS) $("#v-" + k).hidden = t !== k;
  $("#fab").setAttribute("aria-label", { hoy: "Nueva actividad", cal: "Nueva actividad", fin: "Nuevo gasto", notas: "Nueva nota" }[t]);
  render();
}
document.querySelectorAll("nav.tabs button").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
$("#fab").addEventListener("click", () => {
  if (state.tab === "fin") finanzas.openMovSheet(null, "gasto");
  else if (state.tab === "notas") notas.openNoteSheet(null);
  else openActSheet(null);
});
$("#settingsBtn").addEventListener("click", openSettings);

function render() {
  $("#todayBig").textContent = cap(fmtLong.format(new Date()));
  if (state.tab === "hoy") renderHoy();
  if (state.tab === "cal") renderCal();
  if (state.tab === "fin") finanzas.renderFin();
  if (state.tab === "notas") notas.renderNotes();
}

// Enlaces agenda://seccion/accion que usan los widgets y las notificaciones.
function handleLink(url) {
  if (!url || !url.startsWith("agenda://")) return;
  const [section, action, extra] = url.slice("agenda://".length).split(/[/?#]/);
  while (sheets.length) sheets[sheets.length - 1].close();
  if (section === "finanzas") {
    finanzas.showMonth(monthKey(new Date()));
    setTab("fin");
    if (action === "gasto" || action === "ingreso") finanzas.openMovSheet(null, action);
  } else if (section === "pegar") {
    openPasteSheet();
  } else if (section === "notas") {
    setTab("notas");
    if (action === "nueva") notas.openNoteSheet(null);
    else if (action === "ver" && extra) notas.openNoteById(extra);
  } else {
    setTab("hoy");
    if (action === "nueva") openActSheet(null);
  }
}

// Botón "atrás" de Android: cierra paneles, vuelve a Hoy y luego sale.
if (native) {
  App.addListener("backButton", () => {
    if (sheets.length) sheets[sheets.length - 1].close();
    else if (state.tab !== "hoy") setTab("hoy");
    else App.exitApp();
  });
  App.addListener("resume", () => {
    if (finanzas.postFixed()) finanzas.saveFin();
    render();
    dataChanged();
  });
  App.addListener("appUrlOpen", (e) => handleLink(e.url));
}

// Borra lo que dejó la versión con chat de Claude, incluida la clave de API guardada.
async function cleanupOldChat() {
  if (await store.get("cleanedChat", false)) return;
  const chats = await store.get("chats", []);
  for (const c of Array.isArray(chats) ? chats : []) await store.del("chat:" + c.id);
  for (const k of ["chats", "currentChat", "settings", "welcomed"]) await store.del(k);
  const before = state.acts.length;
  state.acts = state.acts.filter((a) => a.title !== "Probar la agenda: pídele a Claude que organice tu semana");
  if (state.acts.length !== before) await store.set("acts", state.acts);
  await store.set("cleanedChat", true);
}

// ---------- Arranque ----------
async function boot() {
  initToast();
  store.persist();
  const ctx = {
    changed: () => {
      render();
      dataChanged();
    },
  };
  await Promise.all([finanzas.loadFin(ctx), notas.loadNotes(ctx), habitos.loadHabits(ctx)]);
  const [acts, notif, tab] = await Promise.all([store.get("acts", []), store.get("notif", null), store.get("tab", "hoy")]);
  state.acts = (Array.isArray(acts) ? acts : []).map((a) => ({ repeat: "none", remind: -1, doneDates: [], skipDates: [], ...a }));
  if (notif) state.notif = { ...state.notif, ...notif };
  await cleanupOldChat();

  setTab(TABS.includes(tab) ? tab : "hoy");

  await notify.setup(handleLink);
  if (native && (await notify.permission()) === "prompt" && !(await store.get("notifAsked", false))) {
    await store.set("notifAsked", true);
    await notify.requestPermission();
  }
  dataChanged();

  if (native) {
    const launch = await App.getLaunchUrl().catch(() => null);
    if (launch && launch.url) handleLink(launch.url);
  }

  let lastDay = todayStr();
  setInterval(() => {
    const t = todayStr();
    if (t !== lastDay) {
      lastDay = t;
      if (finanzas.postFixed()) finanzas.saveFin();
      render();
      dataChanged();
    }
  }, 60000);

  if (!native && "serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
boot();
