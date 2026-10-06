// Utilidades de interfaz compartidas: creación de elementos, fechas, paneles y avisos.

export const $ = (s) => document.querySelector(s);

export function h(tag, attrs, ...kids) {
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

export const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const parseYmd = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d || 1);
};
export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const todayStr = () => ymd(new Date());
export const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const uid = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
};

export const fmtLong = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" });
export const fmtLongYear = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const fmtShort = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short" });
export const fmtMonth = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" });
export const fmtMonthName = new Intl.DateTimeFormat("es-CO", { month: "long" });
export const fmtStamp = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const money = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0, minimumFractionDigits: 0 });
export const fmtMoney = (n) => money.format(Math.round(n || 0));
const plain = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
export const fmtNumber = (n) => plain.format(Math.round(n || 0));

export const ARROW = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;

// ---------- Paneles que suben desde abajo ----------
export const sheets = [];
export function openSheet(content, label) {
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

// ---------- Aviso inferior con "Deshacer" opcional ----------
let toastTimer = null;
let toastUndo = null;
export function toast(text, undo) {
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
export function initToast() {
  $("#toastBtn").addEventListener("click", async () => {
    const u = toastUndo;
    $("#toast").hidden = true;
    toastUndo = null;
    if (u) {
      await u();
      toast("Listo, lo recuperé.");
    }
  });
}

// Botón de dos toques para acciones destructivas (los diálogos del sistema no se usan).
export function confirmButton(label, confirmLabel, onConfirm, cls = "btn danger") {
  let armed = false;
  const b = h(
    "button",
    {
      class: cls,
      type: "button",
      onclick: async () => {
        if (!armed) {
          armed = true;
          b.classList.add("confirm");
          b.textContent = confirmLabel;
          return;
        }
        await onConfirm();
      },
    },
    label,
  );
  return b;
}
