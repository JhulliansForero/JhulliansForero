// Finanzas personales: ingresos, gastos, saldo, movimientos fijos y presupuesto.
// Todo se guarda en el dispositivo.

import * as store from "./store.js";
import {
  $, h, cap, uid, ymd, monthKey, parseYmd, todayStr, isDate, fmtMoney, fmtNumber, fmtShort, fmtMonth, fmtMonthName,
  ARROW, openSheet, toast, confirmButton,
} from "./ui.js";

export const GASTO_CATS = {
  comida: "Comida",
  transporte: "Transporte",
  vivienda: "Vivienda",
  servicios: "Servicios",
  estudio: "Estudio",
  salud: "Salud",
  ocio: "Ocio",
  ropa: "Ropa",
  deudas: "Deudas",
  otros: "Otros",
};
export const INGRESO_CATS = {
  salario: "Salario",
  practica: "Práctica",
  freelance: "Freelance",
  ventas: "Ventas",
  regalo: "Regalo",
  otros: "Otros",
};
const catsFor = (type) => (type === "ingreso" ? INGRESO_CATS : GASTO_CATS);
const catLabel = (type, c) => catsFor(type)[c] || "Otros";

// ---------- Estado ----------
export const fin = { movs: [], fixed: [], initial: 0, budget: 0 };
let ctx = { changed: () => {} };
let viewMonth = monthKey(new Date());

let saving = Promise.resolve();
export function saveFin() {
  const snapshot = JSON.parse(JSON.stringify(fin));
  saving = saving.then(() => store.set("fin", snapshot)).catch(() => toast("No se pudo guardar en el celular."));
  ctx.changed();
  return saving;
}

export async function loadFin(context) {
  ctx = context;
  const saved = await store.get("fin", null);
  if (saved && typeof saved === "object") {
    fin.movs = Array.isArray(saved.movs) ? saved.movs : [];
    fin.fixed = Array.isArray(saved.fixed) ? saved.fixed : [];
    fin.initial = Number(saved.initial) || 0;
    fin.budget = Number(saved.budget) || 0;
  }
  if (postFixed()) await saveFin();
}

// ---------- Cálculos ----------
const sign = (m) => (m.type === "ingreso" ? 1 : -1);
export const balance = () => fin.initial + fin.movs.reduce((s, m) => s + sign(m) * m.amount, 0);
export function monthTotals(key) {
  let ing = 0;
  let gas = 0;
  for (const m of fin.movs) {
    if (!m.date.startsWith(key)) continue;
    if (m.type === "ingreso") ing += m.amount;
    else gas += m.amount;
  }
  return { ing, gas, net: ing - gas };
}
export function byCategory(key) {
  const totals = {};
  for (const m of fin.movs) {
    if (m.type !== "gasto" || !m.date.startsWith(key)) continue;
    totals[m.cat] = (totals[m.cat] || 0) + m.amount;
  }
  return Object.entries(totals)
    .map(([cat, amount]) => ({ cat, amount }))
    .sort((a, b) => b.amount - a.amount);
}
const daysIn = (y, m) => new Date(y, m, 0).getDate();
const addMonths = (key, n) => {
  const d = parseYmd(key + "-01");
  return monthKey(new Date(d.getFullYear(), d.getMonth() + n, 1));
};

// Registra solos los movimientos fijos (salario, arriendo...) cuando llega su día.
export function postFixed() {
  const today = todayStr();
  const current = monthKey(new Date());
  let posted = false;
  for (const f of fin.fixed) {
    if (!f.active) continue;
    f.posted = Array.isArray(f.posted) ? f.posted : [];
    let key = f.startMonth > addMonths(current, -11) ? f.startMonth : addMonths(current, -11);
    while (key <= current) {
      const [y, m] = key.split("-").map(Number);
      const due = `${key}-${String(Math.min(f.day, daysIn(y, m))).padStart(2, "0")}`;
      if (due <= today && !f.posted.includes(key)) {
        fin.movs.push({ id: uid(), type: f.type, amount: f.amount, cat: f.cat, desc: f.desc, date: due, fixedId: f.id, source: "fijo", createdAt: Date.now() });
        f.posted.push(key);
        posted = true;
      }
      key = addMonths(key, 1);
    }
    f.posted = f.posted.slice(-24);
  }
  return posted;
}

// ---------- Operaciones (también las usa Claude) ----------
export async function addMovs(items, source) {
  const created = items.map((x) => ({
    id: uid(),
    type: x.type === "ingreso" ? "ingreso" : "gasto",
    amount: Math.round(x.amount),
    cat: catsFor(x.type)[x.cat] ? x.cat : "otros",
    desc: (x.desc || "").slice(0, 120),
    date: isDate(x.date) ? x.date : todayStr(),
    source,
    createdAt: Date.now(),
  }));
  fin.movs.push(...created);
  await saveFin();
  return created;
}
export async function removeMovs(ids, undoLabel) {
  const removed = fin.movs.filter((m) => ids.includes(m.id));
  if (!removed.length) return removed;
  fin.movs = fin.movs.filter((m) => !ids.includes(m.id));
  await saveFin();
  toast(undoLabel || `Eliminaste ${removed.length} movimiento${removed.length === 1 ? "" : "s"}`, async () => {
    fin.movs.push(...removed);
    await saveFin();
  });
  return removed;
}
export const listMovs = (desde, hasta) =>
  fin.movs.filter((m) => m.date >= desde && m.date <= hasta).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

export function summaryFor(key) {
  const t = monthTotals(key);
  return {
    saldo_disponible: balance(),
    saldo_inicial: fin.initial,
    mes: key,
    ingresos_mes: t.ing,
    gastos_mes: t.gas,
    balance_mes: t.net,
    presupuesto_mensual: fin.budget || null,
    gastos_por_categoria: byCategory(key).map((c) => ({ categoria: c.cat, total: c.amount })),
    fijos: fin.fixed.filter((f) => f.active).map((f) => ({ tipo: f.type, monto: f.amount, categoria: f.cat, descripcion: f.desc, dia: f.day })),
  };
}

export function widgetPayload() {
  const now = new Date();
  const key = monthKey(now);
  const t = monthTotals(key);
  const b = balance();
  return { saldo: fmtMoney(b), neg: b < 0, mes: key, mesNombre: cap(fmtMonthName.format(now)), ing: fmtMoney(t.ing), gas: fmtMoney(t.gas) };
}

// ---------- Interfaz ----------
function amountInput(id, value) {
  const input = h("input", { id, type: "text", inputmode: "numeric", autocomplete: "off", class: "money-input", placeholder: "0", value: value ? fmtNumber(value) : "" });
  input.addEventListener("input", () => {
    const digits = input.value.replace(/\D/g, "").slice(0, 13);
    input.value = digits ? fmtNumber(Number(digits)) : "";
  });
  return input;
}
const readAmount = (input) => Number(input.value.replace(/\D/g, "")) || 0;

function chipGroup(options, selected, onPick, label) {
  const box = h("div", { class: "chips", role: "group", "aria-label": label });
  const draw = (sel) =>
    box.replaceChildren(
      ...Object.entries(options).map(([k, l]) =>
        h(
          "button",
          {
            type: "button",
            "aria-pressed": k === sel ? "true" : "false",
            onclick: () => {
              onPick(k);
              draw(k);
            },
          },
          l,
        ),
      ),
    );
  draw(selected);
  return { el: box, draw };
}

export function openMovSheet(m, presetType) {
  const editing = !!(m && m.id);
  let type = editing ? m.type : presetType === "ingreso" ? "ingreso" : "gasto";
  let cat = editing ? m.cat : type === "ingreso" ? "salario" : "comida";
  const amount = amountInput("m-amount", editing ? m.amount : 0);
  const desc = h("input", { id: "m-desc", type: "text", maxlength: "120", value: editing ? m.desc : "", placeholder: "Ej: almuerzo, pasaje, arriendo", autocomplete: "off" });
  const date = h("input", { id: "m-date", type: "date", value: editing ? m.date : todayStr() });
  const err = h("div", { class: "small err-txt", hidden: true });
  const title = h("h3");
  let cats = chipGroup(catsFor(type), cat, (k) => (cat = k), "Categoría");
  const catsWrap = h("div", { class: "field" }, h("span", { class: "lbl" }, "Categoría"), cats.el);
  const typeBox = h("div", { class: "seg", role: "group", "aria-label": "Tipo" });
  const drawType = () => {
    title.textContent = editing ? (type === "ingreso" ? "Editar ingreso" : "Editar gasto") : type === "ingreso" ? "Nuevo ingreso" : "Nuevo gasto";
    typeBox.replaceChildren(
      ...[
        ["gasto", "Gasto"],
        ["ingreso", "Ingreso"],
      ].map(([k, l]) =>
        h(
          "button",
          {
            type: "button",
            class: k,
            "aria-pressed": k === type ? "true" : "false",
            onclick: () => {
              if (type === k) return;
              type = k;
              cat = k === "ingreso" ? "salario" : "comida";
              cats = chipGroup(catsFor(type), cat, (c) => (cat = c), "Categoría");
              catsWrap.replaceChildren(h("span", { class: "lbl" }, "Categoría"), cats.el);
              drawType();
            },
          },
          l,
        ),
      ),
    );
  };
  drawType();

  const del = editing
    ? confirmButton("Eliminar", "¿Eliminar? Toca otra vez", async () => {
        sheet.close();
        await removeMovs([m.id], `Eliminaste ${m.type === "ingreso" ? "un ingreso" : "un gasto"} de ${fmtMoney(m.amount)}`);
      })
    : h("span");

  const form = h(
    "form",
    { style: "display:grid;gap:14px" },
    title,
    typeBox,
    h("div", { class: "field" }, h("label", { for: "m-amount" }, "Valor (pesos)"), h("div", { class: "money-wrap" }, h("span", null, "$"), amount)),
    catsWrap,
    h("div", { class: "field" }, h("label", { for: "m-desc" }, "Descripción"), desc),
    h("div", { class: "field" }, h("label", { for: "m-date" }, "Fecha"), date),
    m && m.fixedId ? h("div", { class: "small" }, "Registrado automáticamente por un movimiento fijo.") : null,
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
    const value = readAmount(amount);
    if (value <= 0) {
      err.hidden = false;
      err.textContent = "Escribe un valor mayor que cero.";
      amount.focus();
      return;
    }
    if (!isDate(date.value)) {
      err.hidden = false;
      err.textContent = "Elige una fecha.";
      return;
    }
    if (editing) {
      Object.assign(m, { type, amount: value, cat, desc: desc.value.trim(), date: date.value });
      await saveFin();
    } else {
      await addMovs([{ type, amount: value, cat, desc: desc.value.trim(), date: date.value }], "tú");
      viewMonth = date.value.slice(0, 7);
      toast(type === "ingreso" ? `Ingreso de ${fmtMoney(value)} registrado` : `Gasto de ${fmtMoney(value)} registrado`);
    }
    sheet.close();
  });
  const sheet = openSheet(form, "Movimiento");
  if (!editing) setTimeout(() => amount.focus(), 60);
}

function openFixedSheet(f) {
  const editing = !!(f && f.id);
  let type = editing ? f.type : "ingreso";
  let cat = editing ? f.cat : "salario";
  const amount = amountInput("x-amount", editing ? f.amount : 0);
  const desc = h("input", { id: "x-desc", type: "text", maxlength: "80", value: editing ? f.desc : "", placeholder: "Ej: Sueldo, Arriendo, Plan del celular", autocomplete: "off" });
  const day = h("input", { id: "x-day", type: "number", min: "1", max: "31", inputmode: "numeric", value: editing ? String(f.day) : "1" });
  const nowToo = h("input", { id: "x-now", type: "checkbox", checked: true });
  const err = h("div", { class: "small err-txt", hidden: true });
  let cats = chipGroup(catsFor(type), cat, (k) => (cat = k), "Categoría");
  const catsWrap = h("div", { class: "field" }, h("span", { class: "lbl" }, "Categoría"), cats.el);
  const typeBox = h("div", { class: "seg", role: "group", "aria-label": "Tipo" });
  const drawType = () =>
    typeBox.replaceChildren(
      ...[
        ["ingreso", "Ingreso fijo"],
        ["gasto", "Gasto fijo"],
      ].map(([k, l]) =>
        h(
          "button",
          {
            type: "button",
            class: k,
            "aria-pressed": k === type ? "true" : "false",
            onclick: () => {
              if (type === k) return;
              type = k;
              cat = k === "ingreso" ? "salario" : "vivienda";
              cats = chipGroup(catsFor(type), cat, (c) => (cat = c), "Categoría");
              catsWrap.replaceChildren(h("span", { class: "lbl" }, "Categoría"), cats.el);
              drawType();
            },
          },
          l,
        ),
      ),
    );
  drawType();

  const del = editing
    ? confirmButton("Quitar", "¿Quitar? Toca otra vez", async () => {
        fin.fixed = fin.fixed.filter((x) => x.id !== f.id);
        sheet.close();
        await saveFin();
        toast("Quitaste el movimiento fijo. Lo ya registrado se queda.");
      })
    : h("span");

  const form = h(
    "form",
    { style: "display:grid;gap:14px" },
    h("h3", null, editing ? "Editar fijo" : "Nuevo movimiento fijo"),
    h("p", { class: "small" }, "Se registra solo cada mes en el día que elijas. Por ejemplo, tu sueldo o el arriendo."),
    typeBox,
    h("div", { class: "field" }, h("label", { for: "x-amount" }, "Valor (pesos)"), h("div", { class: "money-wrap" }, h("span", null, "$"), amount)),
    catsWrap,
    h("div", { class: "field" }, h("label", { for: "x-desc" }, "Nombre"), desc),
    h("div", { class: "field" }, h("label", { for: "x-day" }, "Día del mes"), day),
    editing ? null : h("label", { class: "check", for: "x-now" }, nowToo, "Registrarlo también este mes si el día ya pasó"),
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
    const value = readAmount(amount);
    const d = Math.round(Number(day.value));
    const name = desc.value.trim();
    const fail = (msg) => {
      err.hidden = false;
      err.textContent = msg;
    };
    if (value <= 0) return fail("Escribe un valor mayor que cero.");
    if (!name) return fail("Ponle un nombre, por ejemplo “Sueldo”.");
    if (!(d >= 1 && d <= 31)) return fail("El día debe estar entre 1 y 31.");
    if (editing) {
      Object.assign(f, { type, amount: value, cat, desc: name, day: d });
    } else {
      const current = monthKey(new Date());
      fin.fixed.push({
        id: uid(),
        type,
        amount: value,
        cat,
        desc: name,
        day: d,
        active: true,
        startMonth: current,
        // Si no quiere registrarlo este mes, se marca como ya registrado.
        posted: nowToo.checked ? [] : [current],
      });
      postFixed();
    }
    sheet.close();
    await saveFin();
  });
  const sheet = openSheet(form, "Movimiento fijo");
}

function openFinSettings() {
  const initial = amountInput("f-initial", Math.abs(fin.initial));
  const negInitial = h("input", { id: "f-neg", type: "checkbox", checked: fin.initial < 0 });
  const budget = amountInput("f-budget", fin.budget);
  const form = h(
    "form",
    { style: "display:grid;gap:14px" },
    h("h3", null, "Ajustes de finanzas"),
    h(
      "div",
      { class: "field" },
      h("label", { for: "f-initial" }, "¿Cuánta plata tienes hoy?"),
      h("div", { class: "money-wrap" }, h("span", null, "$"), initial),
      h("label", { class: "check", for: "f-neg" }, negInitial, "Es una deuda (empiezo en negativo)"),
      h("span", { class: "small" }, "Es tu punto de partida. A esto se le suman los ingresos y se le restan los gastos."),
    ),
    h(
      "div",
      { class: "field" },
      h("label", { for: "f-budget" }, "Presupuesto de gastos por mes (opcional)"),
      h("div", { class: "money-wrap" }, h("span", null, "$"), budget),
      h("span", { class: "small" }, "Te muestra cuánto te queda para gastar en el mes. Déjalo vacío para no usarlo."),
    ),
    h(
      "div",
      { class: "sheet-actions" },
      h("span"),
      h(
        "div",
        { style: "display:flex;gap:8px" },
        h("button", { class: "btn", type: "button", onclick: () => sheet.close() }, "Cancelar"),
        h("button", { class: "btn primary", type: "submit" }, "Guardar"),
      ),
    ),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = readAmount(initial);
    fin.initial = negInitial.checked ? -v : v;
    fin.budget = readAmount(budget);
    sheet.close();
    await saveFin();
  });
  const sheet = openSheet(form, "Ajustes de finanzas");
}

const GEAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>';

export function renderFin() {
  const v = $("#v-fin");
  const b = balance();
  const now = monthKey(new Date());
  const t = monthTotals(viewMonth);
  const cats = byCategory(viewMonth);
  const monthDate = parseYmd(viewMonth + "-01");
  const kids = [];

  // Saldo disponible
  kids.push(
    h(
      "section",
      { class: "fin-hero" + (b < 0 ? " neg" : "") },
      h(
        "div",
        { class: "fin-hero-top" },
        h("span", { class: "eyebrow" }, "Saldo disponible"),
        h("button", { class: "icon-btn ghost", type: "button", "aria-label": "Ajustes de finanzas", html: GEAR, onclick: openFinSettings }),
      ),
      h("div", { class: "fin-balance" }, fmtMoney(b)),
      h(
        "div",
        { class: "small" },
        b < 0 ? "Estás en negativo: has gastado más de lo que tenías." : fin.movs.length || fin.initial ? "Lo que tenías + ingresos − gastos." : "Toca el ícono de ajustes para poner cuánta plata tienes hoy.",
      ),
      h(
        "div",
        { class: "fin-actions" },
        h("button", { class: "btn primary", type: "button", onclick: () => openMovSheet(null, "gasto") }, "− Gasto"),
        h("button", { class: "btn", type: "button", onclick: () => openMovSheet(null, "ingreso") }, "+ Ingreso"),
      ),
    ),
  );

  // Mes
  kids.push(
    h(
      "div",
      { class: "cal-head" },
      h("h2", null, cap(fmtMonth.format(monthDate))),
      h(
        "div",
        { class: "cal-nav" },
        viewMonth !== now
          ? h(
              "button",
              {
                class: "chip-btn",
                type: "button",
                onclick: () => {
                  viewMonth = now;
                  renderFin();
                },
              },
              "Este mes",
            )
          : null,
        h("button", {
          class: "icon-btn",
          type: "button",
          "aria-label": "Mes anterior",
          html: ARROW("M15 6l-6 6 6 6"),
          onclick: () => {
            viewMonth = addMonths(viewMonth, -1);
            renderFin();
          },
        }),
        h("button", {
          class: "icon-btn",
          type: "button",
          "aria-label": "Mes siguiente",
          html: ARROW("M9 6l6 6-6 6"),
          onclick: () => {
            viewMonth = addMonths(viewMonth, 1);
            renderFin();
          },
        }),
      ),
    ),
  );

  const maxFlow = Math.max(t.ing, t.gas, 1);
  kids.push(
    h(
      "section",
      { class: "summary fin-month" },
      h(
        "div",
        { class: "flow" },
        h("span", { class: "flow-lbl" }, "Ingresos"),
        h("div", { class: "flow-track" }, h("i", { class: "in", style: `width:${(t.ing / maxFlow) * 100}%` })),
        h("span", { class: "flow-val" }, fmtMoney(t.ing)),
      ),
      h(
        "div",
        { class: "flow" },
        h("span", { class: "flow-lbl" }, "Gastos"),
        h("div", { class: "flow-track" }, h("i", { class: "out", style: `width:${(t.gas / maxFlow) * 100}%` })),
        h("span", { class: "flow-val" }, fmtMoney(t.gas)),
      ),
      h(
        "div",
        { class: "summary-row" },
        h("span", { class: "small" }, "Balance del mes"),
        h("b", { class: "num " + (t.net < 0 ? "err-txt" : "ok-txt") }, (t.net > 0 ? "+" : "") + fmtMoney(t.net)),
      ),
      fin.budget && viewMonth === now ? budgetEl(t.gas) : null,
    ),
  );

  // En qué se fue la plata
  kids.push(h("div", { class: "section-h" }, h("h2", null, "¿En qué se fue la plata?"), h("span", null, cats.length ? `${cats.length} categorías` : "")));
  if (!cats.length) kids.push(h("div", { class: "empty" }, "Sin gastos este mes. Toca “− Gasto” cuando compres algo."));
  else {
    const top = cats[0].amount;
    kids.push(
      h(
        "ul",
        { class: "bars", "aria-label": "Gastos por categoría" },
        cats.map((c) =>
          h(
            "li",
            { title: `${GASTO_CATS[c.cat] || "Otros"}: ${fmtMoney(c.amount)}` },
            h("span", { class: "bar-lbl" }, GASTO_CATS[c.cat] || "Otros"),
            h("span", { class: "bar-track" }, h("i", { style: `width:${Math.max(2, (c.amount / top) * 100)}%` })),
            h("span", { class: "bar-val" }, fmtMoney(c.amount), h("small", null, ` ${pctLabel(c.amount / t.gas)}`)),
          ),
        ),
      ),
    );
  }

  // Fijos
  kids.push(
    h(
      "div",
      { class: "section-h" },
      h("h2", null, "Fijos cada mes"),
      h("button", { class: "chip-btn", type: "button", onclick: () => openFixedSheet(null) }, "+ Fijo"),
    ),
  );
  const fixed = fin.fixed.filter((f) => f.active);
  if (!fixed.length) kids.push(h("div", { class: "empty" }, "Agrega tu sueldo, el arriendo o lo que se repite cada mes, y se registra solo."));
  else
    kids.push(
      h(
        "ul",
        { class: "mov-list" },
        fixed.map((f) =>
          h(
            "li",
            null,
            h(
              "button",
              { type: "button", class: "mov", onclick: () => openFixedSheet(f) },
              h("span", { class: "mov-main" }, h("span", { class: "t" }, f.desc), h("span", { class: "meta" }, `Día ${f.day} · ${catLabel(f.type, f.cat)}`)),
              h("span", { class: "mov-amt " + f.type }, (f.type === "ingreso" ? "+" : "−") + fmtMoney(f.amount)),
            ),
          ),
        ),
      ),
    );

  // Movimientos del mes
  const movs = fin.movs.filter((m) => m.date.startsWith(viewMonth)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  kids.push(h("div", { class: "section-h" }, h("h2", null, "Movimientos"), h("span", null, movs.length ? String(movs.length) : "")));
  if (!movs.length) kids.push(h("div", { class: "empty" }, "No hay movimientos en este mes."));
  else {
    let lastDate = "";
    const list = h("ul", { class: "mov-list" });
    for (const m of movs) {
      if (m.date !== lastDate) {
        lastDate = m.date;
        list.append(h("li", { class: "day-label" }, cap(fmtShort.format(parseYmd(m.date)))));
      }
      list.append(
        h(
          "li",
          null,
          h(
            "button",
            { type: "button", class: "mov", onclick: () => openMovSheet(m) },
            h(
              "span",
              { class: "mov-main" },
              h("span", { class: "t" }, m.desc || catLabel(m.type, m.cat)),
              h("span", { class: "meta" }, h("span", null, catLabel(m.type, m.cat)), m.source === "claude" ? h("span", { class: "by-claude" }, "✦ Claude") : null, m.fixedId ? h("span", null, "fijo") : null),
            ),
            h("span", { class: "mov-amt " + m.type }, (m.type === "ingreso" ? "+" : "−") + fmtMoney(m.amount)),
          ),
        ),
      );
    }
    kids.push(list);
  }
  v.replaceChildren(...kids);
}

function pctLabel(f) {
  const p = Math.round(f * 100);
  return p < 1 ? "<1%" : `${p}%`;
}

function budgetEl(spent) {
  const left = fin.budget - spent;
  const pct = Math.min(100, (spent / fin.budget) * 100);
  return h(
    "div",
    { class: "budget" + (left < 0 ? " over" : "") },
    h("div", { class: "summary-row" }, h("span", { class: "small" }, "Presupuesto del mes"), h("span", { class: "small num" }, `${fmtMoney(spent)} de ${fmtMoney(fin.budget)}`)),
    h("div", { class: "bar" }, h("i", { style: `width:${pct}%` })),
    h("span", { class: "small " + (left < 0 ? "err-txt" : "") }, left < 0 ? `Te pasaste por ${fmtMoney(-left)}.` : `Te quedan ${fmtMoney(left)} para gastar este mes.`),
  );
}

export function showMonth(key) {
  viewMonth = key;
}
