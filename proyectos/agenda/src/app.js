import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import * as store from "./store.js";
import { MODELS, DEFAULT_MODEL, runTurn, describeError, checkKey } from "./claude.js";

// ---------- Constantes y utilidades ----------
const CATS = { estudio: "Estudio", practica: "Práctica", personal: "Personal", salud: "Salud", otro: "Otro" };
const TZ = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Bogota";
  } catch {
    return "America/Bogota";
  }
})();
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const SEND_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>';
const STOP_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>';
const TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

const $ = (s) => document.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.setAttribute("style", v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtLong = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" });
const fmtLongYear = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtShort = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short" });
const fmtMonth = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" });
const fmtStamp = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const catVar = (c) => `--cat: var(--c-${CATS[c] ? c : "otro"})`;
const todayStr = () => ymd(new Date());
const uid = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
};
const native = Capacitor.isNativePlatform();

// ---------- Estado ----------
const state = {
  tab: "hoy",
  acts: [],
  month: (() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  })(),
  selected: todayStr(),
  settings: { apiKey: "", model: DEFAULT_MODEL },
  chats: [], // [{id, title, updatedAt}]
  chat: null, // {id, title, createdAt, updatedAt, model, messages, view}
};

// ---------- Actividades (guardadas en el dispositivo) ----------
let saving = Promise.resolve();
function saveActs() {
  const snapshot = state.acts.map((a) => ({ ...a }));
  saving = saving.then(() => store.set("acts", snapshot)).catch(() => toast("No se pudo guardar en el celular."));
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
const actsOn = (date) => state.acts.filter((a) => a.date === date).sort(sortActs);
const timeLabel = (a) => (!a.start ? "Todo el día" : a.end ? `${a.start}–${a.end}` : a.start);

function newAct(fields, source) {
  return {
    id: uid(),
    title: fields.title,
    date: fields.date,
    start: fields.start || "",
    end: fields.end || "",
    category: CATS[fields.category] ? fields.category : "otro",
    notes: fields.notes || "",
    done: false,
    source,
    createdAt: Date.now(),
  };
}

// La interfaz que usa Claude para leer y cambiar la agenda.
const agenda = {
  list(desde, hasta) {
    return state.acts.filter((a) => a.date >= desde && a.date <= hasta).sort(sortActs);
  },
  async create(items) {
    const created = items.map((f) => newAct(f, "claude"));
    state.acts.push(...created);
    await saveActs();
    render();
    return created;
  },
  async update(patches) {
    const updated = [];
    const missing = [];
    for (const { id, changes } of patches) {
      const a = state.acts.find((x) => x.id === id);
      if (!a) {
        missing.push(id);
        continue;
      }
      Object.assign(a, changes);
      if (a.end && !a.start) a.end = "";
      updated.push({ ...a });
    }
    if (updated.length) {
      await saveActs();
      render();
    }
    return { updated, missing };
  },
  async remove(ids) {
    const removed = state.acts.filter((a) => ids.includes(a.id));
    const missing = ids.filter((id) => !removed.some((a) => a.id === id));
    if (removed.length) {
      state.acts = state.acts.filter((a) => !ids.includes(a.id));
      await saveActs();
      render();
      toast(`Claude eliminó ${removed.length} actividad${removed.length === 1 ? "" : "es"}`, async () => {
        state.acts.push(...removed);
        await saveActs();
        render();
      });
    }
    return { removed, missing };
  },
};

async function toggleDone(a) {
  const x = state.acts.find((y) => y.id === a.id);
  if (!x) return;
  x.done = !x.done;
  render();
  await saveActs();
}

// ---------- Elementos de lista ----------
function actItem(a) {
  return h(
    "li",
    { class: "act" + (a.done ? " done" : ""), style: catVar(a.category) },
    h("button", {
      class: "chk",
      type: "button",
      "aria-pressed": a.done ? "true" : "false",
      "aria-label": (a.done ? "Marcar pendiente: " : "Marcar hecha: ") + (a.title || ""),
      html: CHECK_SVG,
      onclick: () => toggleDone(a),
    }),
    h(
      "button",
      { class: "act-body", type: "button", onclick: () => openActSheet(a) },
      h("span", { class: "t" }, a.title || "(sin título)"),
      h(
        "span",
        { class: "meta" },
        h("span", { class: "time" }, timeLabel(a)),
        h("span", { class: "tag" }, h("i"), CATS[a.category] || "Otro"),
        a.source === "claude" ? h("span", { class: "by-claude" }, "✦ Claude") : null,
      ),
    ),
  );
}
const dayList = (date) => h("ul", { class: "list" }, actsOn(date).map(actItem));

// ---------- Pantalla: Hoy ----------
function renderHoy() {
  const v = $("#v-hoy");
  const today = todayStr();
  const mine = actsOn(today);
  const done = mine.filter((a) => a.done).length;
  const total = mine.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const kids = [];

  kids.push(
    h(
      "div",
      { class: "summary" },
      h(
        "div",
        { class: "summary-row" },
        h("div", { class: "summary-num" }, String(done), h("small", null, ` / ${total} hechas`)),
        h(
          "div",
          { class: "summary-txt" },
          total === 0 ? "Día libre por ahora" : done === total ? "¡Todo listo por hoy!" : `${total - done} pendiente${total - done === 1 ? "" : "s"}`,
        ),
      ),
      h("div", { class: "bar", role: "progressbar", "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100 }, h("i", { style: `width:${pct}%` })),
    ),
  );

  kids.push(h("div", { class: "section-h" }, h("h2", null, "Hoy"), h("span", null, today)));
  if (!mine.length)
    kids.push(
      h(
        "div",
        { class: "empty" },
        h("strong", null, "Nada para hoy todavía"),
        h("span", null, "Toca + para agregar una actividad, o cuéntale a Claude qué tienes que hacer y él la pone aquí."),
      ),
    );
  else kids.push(dayList(today));

  const groups = [];
  for (let i = 1; i <= 7; i++) {
    const d = ymd(addDays(new Date(), i));
    const a = actsOn(d);
    if (a.length)
      groups.push(
        h("div", { class: "day-group" }, h("div", { class: "day-label" }, cap(fmtShort.format(parseYmd(d)))), h("ul", { class: "list" }, a.map(actItem))),
      );
  }
  kids.push(h("div", { class: "section-h" }, h("h2", null, "Próximos 7 días"), h("span", null, groups.length ? "" : "sin nada")));
  if (groups.length) kids.push(...groups);
  else kids.push(h("div", { class: "empty" }, "Tu semana está despejada. Pídele a Claude que te ayude a planearla."));

  kids.push(
    h(
      "div",
      { class: "ask-card" },
      h("p", null, h("b", null, "Habla con Claude. "), "Dile algo como “ármame la semana con 1 hora diaria de Spring Boot” y él crea las actividades en tu calendario."),
      h("button", { type: "button", onclick: () => setTab("chat") }, "Abrir chat con Claude"),
    ),
  );
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
  const arrow = (d) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
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
      h("button", { class: "icon-btn", type: "button", "aria-label": "Mes anterior", onclick: () => shiftMonth(-1), html: arrow("M15 6l-6 6 6 6") }),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Mes siguiente", onclick: () => shiftMonth(1), html: arrow("M9 6l6 6-6 6") }),
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

// ---------- Hojas (paneles que suben desde abajo) ----------
const sheets = [];
function openSheet(content, label) {
  const sheet = h("div", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": label }, h("div", { class: "grab" }), content);
  const scrim = h("div", { class: "scrim" }, sheet);
  const entry = { close: () => {} };
  scrim.addEventListener("click", (e) => {
    if (e.target === scrim) entry.close();
  });
  entry.close = () => {
    scrim.remove();
    const i = sheets.indexOf(entry);
    if (i >= 0) sheets.splice(i, 1);
  };
  sheets.push(entry);
  document.body.append(scrim);
  return entry;
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sheets.length) sheets[sheets.length - 1].close();
});

// ---------- Hoja: agregar / editar actividad ----------
function openActSheet(a) {
  const editing = !!(a && a.id);
  const data = Object.assign(
    { title: "", date: state.tab === "cal" ? state.selected : todayStr(), start: "", end: "", category: "estudio", notes: "" },
    a || {},
  );
  let cat = CATS[data.category] ? data.category : "otro";
  const title = h("input", { id: "f-title", type: "text", maxlength: "120", value: data.title, placeholder: "Ej: Repasar Spring Boot", autocomplete: "off" });
  const date = h("input", { id: "f-date", type: "date", value: data.date });
  const st = h("input", { id: "f-start", type: "time", value: data.start || "" });
  const en = h("input", { id: "f-end", type: "time", value: data.end || "" });
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
  let confirmDel = false;
  const del = editing
    ? h(
        "button",
        {
          class: "btn danger",
          type: "button",
          onclick: async () => {
            if (!confirmDel) {
              confirmDel = true;
              del.classList.add("confirm");
              del.textContent = "¿Eliminar? Toca otra vez";
              return;
            }
            sheet.close();
            const removed = state.acts.find((x) => x.id === a.id);
            state.acts = state.acts.filter((x) => x.id !== a.id);
            render();
            await saveActs();
            toast(`Eliminaste “${a.title}”`, async () => {
              if (removed) state.acts.push(removed);
              await saveActs();
              render();
            });
          },
        },
        "Eliminar",
      )
    : h("span");

  const form = h(
    "form",
    { class: "sheet-form", style: "display:grid;gap:12px" },
    h("h3", null, editing ? "Editar actividad" : "Nueva actividad"),
    h("div", { class: "field" }, h("label", { for: "f-title" }, "Qué vas a hacer"), title),
    h(
      "div",
      { class: "row3" },
      h("div", { class: "field" }, h("label", { for: "f-date" }, "Día"), date),
      h("div", { class: "field" }, h("label", { for: "f-start" }, "Desde"), st),
      h("div", { class: "field" }, h("label", { for: "f-end" }, "Hasta"), en),
    ),
    h("div", { class: "field" }, h("span", { class: "lbl" }, "Categoría"), catsEl),
    h("div", { class: "field" }, h("label", { for: "f-notes" }, "Notas"), notes),
    editing && a.source === "claude" ? h("div", { class: "small" }, "✦ Creada por Claude") : null,
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
    const body = { title: t, date: date.value, start: st.value || "", end: en.value || "", category: cat, notes: notes.value.trim() };
    if (editing) {
      const x = state.acts.find((y) => y.id === a.id);
      if (x) Object.assign(x, body);
    } else {
      state.acts.push(newAct(body, "tú"));
    }
    state.selected = body.date;
    sheet.close();
    render();
    await saveActs();
  });
  const sheet = openSheet(form, editing ? "Editar actividad" : "Nueva actividad");
  if (!editing) setTimeout(() => title.focus(), 60);
}

// ---------- Hoja: ajustes ----------
function openSettings() {
  const key = h("input", {
    id: "s-key",
    type: "password",
    value: state.settings.apiKey,
    placeholder: "sk-ant-…",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    class: "mono",
  });
  const show = h(
    "button",
    {
      class: "btn",
      type: "button",
      onclick: () => {
        key.type = key.type === "password" ? "text" : "password";
        show.textContent = key.type === "password" ? "Ver" : "Ocultar";
      },
    },
    "Ver",
  );
  const status = h("div", { class: "small", hidden: true });
  let model = state.settings.model;
  const models = h(
    "div",
    { class: "models", role: "radiogroup", "aria-label": "Modelo de Claude" },
    MODELS.map((m) => {
      const input = h("input", { type: "radio", name: "s-model", id: "s-model-" + m.id, value: m.id, checked: m.id === model });
      input.addEventListener("change", () => (model = m.id));
      return h("label", { class: "model", for: "s-model-" + m.id }, input, h("div", null, h("b", null, m.name + (m.id === DEFAULT_MODEL ? " (recomendado)" : "")), h("span", null, m.note)));
    }),
  );
  const verify = h(
    "button",
    {
      class: "btn",
      type: "button",
      onclick: async () => {
        const k = key.value.trim();
        status.hidden = false;
        status.className = "small";
        if (!k) {
          status.textContent = "Pega primero tu clave.";
          return;
        }
        status.textContent = "Verificando…";
        verify.disabled = true;
        try {
          await checkKey(k, model);
          status.className = "small ok-txt";
          status.textContent = "La clave funciona. ✓";
        } catch (e) {
          status.className = "small err-txt";
          status.textContent = describeError(e);
        } finally {
          verify.disabled = false;
        }
      },
    },
    "Verificar clave",
  );
  const form = h(
    "form",
    { style: "display:grid;gap:14px" },
    h("h3", null, "Ajustes"),
    h(
      "div",
      { class: "field" },
      h("label", { for: "s-key" }, "Clave de API de Anthropic"),
      h("div", { class: "inline" }, key, show),
      status,
    ),
    h(
      "ol",
      { class: "steps" },
      h("li", null, "Entra a ", h("b", null, "console.anthropic.com"), " e inicia sesión."),
      h("li", null, "En ", h("b", null, "Billing"), ", carga saldo (con 5 USD alcanza para mucho)."),
      h("li", null, "En ", h("b", null, "API Keys"), ", crea una clave y pégala aquí."),
    ),
    h("div", { class: "small" }, "La clave se guarda solo en este celular y se usa únicamente para hablar con Claude."),
    h("div", { class: "field" }, h("span", { class: "lbl" }, "Modelo de Claude"), models),
    h(
      "div",
      { class: "sheet-actions" },
      verify,
      h(
        "div",
        { style: "display:flex;gap:8px" },
        h("button", { class: "btn", type: "button", onclick: () => sheet.close() }, "Cancelar"),
        h("button", { class: "btn primary", type: "submit" }, "Guardar"),
      ),
    ),
    h("div", { class: "small" }, "Tus actividades y chats se guardan solo en este dispositivo."),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    state.settings = { apiKey: key.value.trim(), model };
    await store.set("settings", state.settings);
    sheet.close();
    toast("Ajustes guardados.");
  });
  const sheet = openSheet(form, "Ajustes");
}

// ---------- Toast ----------
let toastTimer = null;
let toastUndo = null;
function toast(text, undo) {
  $("#toastTxt").textContent = text;
  toastUndo = undo || null;
  $("#toastBtn").hidden = !undo;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => {
      $("#toast").hidden = true;
      toastUndo = null;
    },
    undo ? 7000 : 3000,
  );
}
$("#toastBtn").addEventListener("click", async () => {
  const u = toastUndo;
  $("#toast").hidden = true;
  toastUndo = null;
  if (u) {
    await u();
    toast("Listo, lo recuperé.");
  }
});

// ---------- Chat con Claude y chats anteriores ----------
const SUGS = [
  "Tengo parcial de Java el jueves, ármame horas de estudio antes",
  "Agrega gimnasio lunes, miércoles y viernes a las 6 am",
  "¿Qué tengo mañana?",
  "Organiza mi semana: práctica en la Alcaldía de 8 a 12 entre semana",
];
let busy = null; // AbortController del turno en curso

function blankChat() {
  return { id: uid(), title: "Chat nuevo", createdAt: Date.now(), updatedAt: Date.now(), messages: [], view: [] };
}
async function saveChat(chat) {
  chat.updatedAt = Date.now();
  await store.set("chat:" + chat.id, JSON.parse(JSON.stringify(chat)));
  state.chats = [{ id: chat.id, title: chat.title, updatedAt: chat.updatedAt }, ...state.chats.filter((c) => c.id !== chat.id)];
  await store.set("chats", state.chats);
}
async function openChat(id) {
  if (busy) return;
  const c = await store.get("chat:" + id);
  if (!c) {
    state.chats = state.chats.filter((x) => x.id !== id);
    await store.set("chats", state.chats);
    toast("Ese chat ya no existe.");
    return;
  }
  state.chat = c;
  await store.set("currentChat", id);
  renderChat();
}
async function newChat() {
  if (busy) return;
  state.chat = blankChat();
  await store.del("currentChat");
  renderChat();
  $("#ask").focus({ preventScroll: true });
}

function changesEl(changes) {
  if (!changes || !changes.length) return null;
  const lbl = { created: "+ creada", updated: "~ cambio", done: "✓ hecha", deleted: "− borrada" };
  return h(
    "div",
    { class: "changes" },
    changes.map((c) =>
      h(
        "div",
        null,
        h("b", null, lbl[c.type] || c.type),
        h("span", null, `${c.title} · ${isDate(c.date) ? cap(fmtShort.format(parseYmd(c.date))) : ""}${c.start ? " " + c.start : ""}`),
      ),
    ),
  );
}
function bubble(item) {
  if (item.kind === "me") return h("div", { class: "msg me" }, item.text);
  if (item.kind === "err") return h("div", { class: "msg err" }, item.text);
  return h("div", { class: "msg ai" }, h("span", { class: "who" }, "Claude"), h("span", { class: "txt" }, item.text || ""), changesEl(item.changes));
}
function renderChat() {
  const box = $("#msgs");
  const c = state.chat;
  $("#chatTitle").textContent = c && c.view.length ? c.title : "Chat nuevo";
  const kids = [];
  if (!c || !c.view.length) {
    kids.push(
      h(
        "div",
        { class: "msg ai" },
        h("span", { class: "who" }, "Claude"),
        "Hola Jhullians. Cuéntame qué tienes que hacer y yo lo organizo en tu agenda: creo las actividades, les pongo hora y las acomodo en el calendario. También puedo mover, completar o borrar las que ya tienes.",
      ),
      h(
        "div",
        { class: "sugs" },
        SUGS.map((s) =>
          h(
            "button",
            {
              type: "button",
              onclick: () => {
                $("#ask").value = s;
                send();
              },
            },
            s,
          ),
        ),
      ),
    );
    if (!state.settings.apiKey) kids.push(keyNotice());
  } else {
    kids.push(...c.view.map(bubble));
  }
  box.replaceChildren(...kids);
  scrollChat();
}
function keyNotice() {
  return h(
    "div",
    { class: "notice" },
    h("span", null, "Para hablar con Claude, primero agrega tu clave de API."),
    h("button", { type: "button", onclick: openSettings }, "Configurar"),
  );
}
function scrollChat() {
  const v = $("#v-chat");
  requestAnimationFrame(() => {
    v.scrollTop = v.scrollHeight;
  });
}

function openChatsSheet() {
  const list = h("ul", { class: "chat-list" });
  const draw = () => {
    if (!state.chats.length) {
      list.replaceChildren(h("li", { class: "empty" }, "Todavía no tienes chats guardados. Cuando hables con Claude, aparecerán aquí."));
      return;
    }
    list.replaceChildren(
      ...state.chats
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((c) => {
          let armed = false;
          const delBtn = h("button", {
            class: "del",
            type: "button",
            "aria-label": "Eliminar chat: " + c.title,
            html: TRASH_SVG,
            onclick: async () => {
              if (!armed) {
                armed = true;
                delBtn.classList.add("confirm");
                delBtn.setAttribute("aria-label", "Toca otra vez para eliminar");
                return;
              }
              await store.del("chat:" + c.id);
              state.chats = state.chats.filter((x) => x.id !== c.id);
              await store.set("chats", state.chats);
              if (state.chat && state.chat.id === c.id) await newChat();
              draw();
            },
          });
          return h(
            "li",
            { class: "chat-row" + (state.chat && state.chat.id === c.id ? " current" : "") },
            h(
              "button",
              {
                type: "button",
                onclick: async () => {
                  sheet.close();
                  await openChat(c.id);
                },
              },
              h("span", { class: "ct" }, c.title),
              h("span", { class: "cd" }, fmtStamp.format(new Date(c.updatedAt))),
            ),
            delBtn,
          );
        }),
    );
  };
  draw();
  const content = h(
    "div",
    { style: "display:grid;gap:12px" },
    h("h3", null, "Chats anteriores"),
    h("p", { class: "small" }, "Abre uno para seguir la conversación donde la dejaste. Claude recuerda todo lo que hablaron en ese chat."),
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
          onclick: async () => {
            sheet.close();
            await newChat();
          },
        },
        "Empezar chat nuevo",
      ),
    ),
  );
  const sheet = openSheet(content, "Chats anteriores");
}

function contextBlock() {
  const now = new Date();
  const days = [];
  for (let i = 1; i < 21; i++) {
    const d = addDays(now, i);
    days.push(`${fmtShort.format(d)} = ${ymd(d)}`);
  }
  return (
    `[Contexto]\nHoy: ${fmtLongYear.format(now)} (${ymd(now)}), ${pad(now.getHours())}:${pad(now.getMinutes())}, zona ${TZ}.\n` +
    `Próximos días: ${days.join("; ")}.\n[/Contexto]\n\n`
  );
}

async function send() {
  const box = $("#ask");
  const text = box.value.trim();
  if (!text || busy) return;
  if (!state.settings.apiKey) {
    $("#msgs").append(keyNotice());
    scrollChat();
    openSettings();
    return;
  }
  if (!state.chat) state.chat = blankChat();
  const chat = state.chat;
  if (!chat.view.length) chat.title = text.length > 48 ? text.slice(0, 46).trimEnd() + "…" : text;
  box.value = "";
  autosize();

  const historyBefore = chat.messages;
  const meItem = { kind: "me", text };
  const aiItem = { kind: "ai", text: "", changes: [] };
  chat.view.push(meItem);
  if (chat.view.length === 1) renderChat();
  else $("#msgs").append(bubble(meItem));
  $("#chatTitle").textContent = chat.title;

  const txt = h("span", { class: "txt" });
  const dots = h("span", { class: "thinking", "aria-label": "Pensando" }, h("i"), h("i"), h("i"));
  const status = h("span", { class: "status" }, "Pensando…");
  const changesBox = h("div");
  const aiEl = h("div", { class: "msg ai" }, h("span", { class: "who" }, "Claude"), dots, txt, changesBox, status);
  $("#msgs").append(aiEl);
  scrollChat();

  const ctl = new AbortController();
  busy = ctl;
  setSendMode(true);
  await saveChat(chat);

  try {
    const { messages } = await runTurn({
      apiKey: state.settings.apiKey,
      model: state.settings.model,
      history: historyBefore,
      userContent: contextBlock() + text,
      agenda,
      signal: ctl.signal,
      onText: (delta) => {
        dots.remove();
        aiItem.text += delta;
        txt.textContent = aiItem.text;
        scrollChat();
      },
      onStatus: (s) => {
        status.textContent = s;
        status.hidden = !s;
      },
      onChange: (type, a) => {
        aiItem.changes.push({ type, title: a.title, date: a.date, start: a.start || "" });
        changesBox.replaceChildren(changesEl(aiItem.changes) || "");
        scrollChat();
      },
    });
    chat.messages = messages;
    if (!aiItem.text.trim()) aiItem.text = aiItem.changes.length ? "Listo, ya actualicé tu agenda." : "Listo.";
    chat.view.push(aiItem);
    dots.remove();
    txt.textContent = aiItem.text;
    status.remove();
  } catch (e) {
    // La conversación vuelve al último punto consistente; lo ya cambiado en la agenda se queda.
    chat.messages = historyBefore;
    dots.remove();
    status.remove();
    if (aiItem.text.trim() || aiItem.changes.length) chat.view.push(aiItem);
    else aiEl.remove();
    const errItem = { kind: "err", text: describeError(e) };
    chat.view.push(errItem);
    $("#msgs").append(bubble(errItem));
  } finally {
    busy = null;
    setSendMode(false);
    await saveChat(chat);
    await store.set("currentChat", chat.id);
    scrollChat();
  }
}
function setSendMode(on) {
  const b = $("#sendBtn");
  b.classList.toggle("stop", on);
  b.innerHTML = on ? STOP_SVG : SEND_SVG;
  b.setAttribute("aria-label", on ? "Detener" : "Enviar");
}
function autosize() {
  const t = $("#ask");
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 140) + "px";
}
$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  if (busy) busy.abort();
  else send();
});
$("#ask").addEventListener("input", autosize);
$("#ask").addEventListener("keydown", (e) => {
  // En el celular, Enter hace salto de línea; en computador, envía.
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !native && matchMedia("(pointer: fine)").matches) {
    e.preventDefault();
    if (!busy) send();
  }
});
$("#chatsBtn").addEventListener("click", openChatsSheet);
$("#newChatBtn").addEventListener("click", newChat);

// ---------- Pestañas y render ----------
function setTab(t) {
  state.tab = t;
  store.set("tab", t);
  document.querySelectorAll("nav.tabs button").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === t ? "page" : "false"));
  $("#v-hoy").hidden = t !== "hoy";
  $("#v-cal").hidden = t !== "cal";
  $("#v-chat").hidden = t !== "chat";
  $("#fab").hidden = t === "chat";
  if (t === "chat") scrollChat();
  render();
}
document.querySelectorAll("nav.tabs button").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
$("#fab").addEventListener("click", () => openActSheet(null));
$("#settingsBtn").addEventListener("click", openSettings);

function render() {
  $("#todayBig").textContent = cap(fmtLong.format(new Date()));
  if (state.tab === "hoy") renderHoy();
  if (state.tab === "cal") renderCal();
}

// Botón "atrás" de Android: cierra paneles, vuelve a Hoy y luego sale.
if (native) {
  App.addListener("backButton", () => {
    if (sheets.length) sheets[sheets.length - 1].close();
    else if (state.tab !== "hoy") setTab("hoy");
    else App.exitApp();
  });
  App.addListener("resume", () => render());
}

// ---------- Arranque ----------
async function boot() {
  setSendMode(false);
  store.persist();
  const [acts, settings, chats, currentId, tab] = await Promise.all([
    store.get("acts", []),
    store.get("settings", null),
    store.get("chats", []),
    store.get("currentChat", null),
    store.get("tab", "hoy"),
  ]);
  state.acts = Array.isArray(acts) ? acts : [];
  if (settings) state.settings = { apiKey: settings.apiKey || "", model: MODELS.some((m) => m.id === settings.model) ? settings.model : DEFAULT_MODEL };
  state.chats = Array.isArray(chats) ? chats : [];
  if (currentId) state.chat = await store.get("chat:" + currentId);
  if (!state.chat) state.chat = blankChat();

  if (!state.acts.length && !(await store.get("welcomed", false))) {
    state.acts.push(
      newAct(
        {
          title: "Probar la agenda: pídele a Claude que organice tu semana",
          date: todayStr(),
          category: "personal",
          notes: "Ve a la pestaña Claude y escríbele lo que tienes pendiente. Toca el cuadrito para marcar esta actividad como hecha.",
        },
        "claude",
      ),
    );
    await saveActs();
    await store.set("welcomed", true);
  }

  renderChat();
  setTab(["hoy", "cal", "chat"].includes(tab) ? tab : "hoy");

  let lastDay = todayStr();
  setInterval(() => {
    const t = todayStr();
    if (t !== lastDay) {
      lastDay = t;
      render();
    }
  }, 60000);

  if (!native && "serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
boot();
