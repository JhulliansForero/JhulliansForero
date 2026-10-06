// Notas personales: texto o lista de chequeo, con color, fijadas y búsqueda.

import * as store from "./store.js";
import { $, h, uid, fmtStamp, openSheet, toast, confirmButton } from "./ui.js";

export const COLORS = {
  verde: "Verde",
  azul: "Azul",
  amarillo: "Amarillo",
  rosa: "Rosa",
  lila: "Lila",
  gris: "Gris",
};

export const notes = [];
let ctx = { changed: () => {} };
let query = "";

let saving = Promise.resolve();
export function saveNotes() {
  const snapshot = JSON.parse(JSON.stringify(notes));
  saving = saving.then(() => store.set("notes", snapshot)).catch(() => toast("No se pudo guardar en el celular."));
  ctx.changed();
  return saving;
}

export async function loadNotes(context) {
  ctx = context;
  const saved = await store.get("notes", []);
  notes.splice(0, notes.length, ...(Array.isArray(saved) ? saved : []));
}

const sorted = () => notes.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);

// La nota que muestra el widget: la fijada más reciente, o la más reciente.
export function featured() {
  return sorted()[0] || null;
}

export function noteText(n, max = 400) {
  if (n.kind === "lista") {
    return (n.items || [])
      .map((it) => `${it.done ? "☑" : "☐"} ${it.t}`)
      .join("\n")
      .slice(0, max);
  }
  return (n.body || "").slice(0, max);
}

export function widgetPayload() {
  const n = featured();
  if (!n) return null;
  const items = n.kind === "lista" ? n.items || [] : [];
  return {
    id: n.id,
    title: n.title || "Nota sin título",
    body: noteText(n, 300),
    color: n.color || "verde",
    pinned: !!n.pinned,
    progress: items.length ? `${items.filter((i) => i.done).length} de ${items.length} listos` : "",
    total: notes.length,
  };
}

// ---------- Editor ----------
export function openNoteSheet(n) {
  const editing = !!(n && n.id);
  const draft = editing
    ? JSON.parse(JSON.stringify(n))
    : { id: uid(), title: "", body: "", kind: "texto", items: [], color: "verde", pinned: false, createdAt: Date.now(), updatedAt: Date.now() };

  const title = h("input", { id: "n-title", type: "text", maxlength: "100", value: draft.title, placeholder: "Título", autocomplete: "off", class: "note-title-input" });
  const body = h("textarea", { id: "n-body", rows: "8", maxlength: "5000", placeholder: "Escribe aquí…" });
  body.value = draft.body || "";
  const listBox = h("div", { class: "checklist" });
  const content = h("div");

  const drawList = () => {
    listBox.replaceChildren(
      ...draft.items.map((it, i) => {
        const cb = h("input", { type: "checkbox", id: `n-it-${i}`, checked: it.done, "aria-label": "Listo" });
        cb.addEventListener("change", () => {
          it.done = cb.checked;
          drawList();
        });
        const txt = h("input", { type: "text", value: it.t, maxlength: "200", "aria-label": "Elemento", placeholder: "Elemento" });
        txt.addEventListener("input", () => (it.t = txt.value));
        txt.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            draft.items.splice(i + 1, 0, { t: "", done: false });
            drawList();
            listBox.querySelectorAll('input[type="text"]')[i + 1]?.focus();
          }
        });
        const del = h("button", {
          type: "button",
          class: "x",
          "aria-label": "Quitar elemento",
          onclick: () => {
            draft.items.splice(i, 1);
            drawList();
          },
          html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        });
        return h("div", { class: "check-item" + (it.done ? " done" : "") }, cb, txt, del);
      }),
      h(
        "button",
        {
          type: "button",
          class: "chip-btn",
          onclick: () => {
            draft.items.push({ t: "", done: false });
            drawList();
            const inputs = listBox.querySelectorAll('input[type="text"]');
            inputs[inputs.length - 1]?.focus();
          },
        },
        "+ Agregar elemento",
      ),
    );
  };

  const kindBox = h("div", { class: "seg", role: "group", "aria-label": "Tipo de nota" });
  const drawKind = () => {
    kindBox.replaceChildren(
      ...[
        ["texto", "Texto"],
        ["lista", "Lista"],
      ].map(([k, l]) =>
        h(
          "button",
          {
            type: "button",
            "aria-pressed": draft.kind === k ? "true" : "false",
            onclick: () => {
              if (draft.kind === k) return;
              if (k === "lista") {
                // Cada línea del texto se vuelve un elemento.
                const lines = body.value.split("\n").map((s) => s.trim()).filter(Boolean);
                if (!draft.items.length) draft.items = lines.map((t) => ({ t, done: false }));
                if (!draft.items.length) draft.items = [{ t: "", done: false }];
              } else {
                body.value = draft.items.map((it) => it.t).filter(Boolean).join("\n");
              }
              draft.kind = k;
              drawKind();
            },
          },
          l,
        ),
      ),
    );
    if (draft.kind === "lista") {
      drawList();
      content.replaceChildren(listBox);
    } else content.replaceChildren(body);
  };
  drawKind();

  const colorBox = h("div", { class: "note-colors", role: "radiogroup", "aria-label": "Color" });
  const drawColors = () =>
    colorBox.replaceChildren(
      ...Object.entries(COLORS).map(([k, l]) =>
        h("button", {
          type: "button",
          class: "swatch n-" + k,
          role: "radio",
          "aria-checked": draft.color === k ? "true" : "false",
          "aria-label": l,
          onclick: () => {
            draft.color = k;
            drawColors();
          },
        }),
      ),
    );
  drawColors();

  const pin = h("input", { id: "n-pin", type: "checkbox", checked: draft.pinned });
  const del = editing
    ? confirmButton("Eliminar", "¿Eliminar? Toca otra vez", async () => {
        sheet.close();
        const i = notes.findIndex((x) => x.id === n.id);
        const removed = i >= 0 ? notes.splice(i, 1)[0] : null;
        await saveNotes();
        toast("Eliminaste la nota", async () => {
          if (removed) notes.push(removed);
          await saveNotes();
        });
      })
    : h("span");

  const form = h(
    "form",
    { style: "display:grid;gap:12px" },
    title,
    kindBox,
    content,
    h("div", { class: "field" }, h("span", { class: "lbl" }, "Color"), colorBox),
    h("label", { class: "check", for: "n-pin" }, pin, "Fijar arriba y mostrar en el widget"),
    editing ? h("div", { class: "small" }, "Editada " + fmtStamp.format(new Date(n.updatedAt))) : null,
    h(
      "div",
      { class: "sheet-actions" },
      del,
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
    draft.title = title.value.trim();
    draft.pinned = pin.checked;
    if (draft.kind === "lista") {
      draft.items = draft.items.map((it) => ({ t: it.t.trim(), done: !!it.done })).filter((it) => it.t);
      draft.body = "";
    } else {
      draft.body = body.value.trim();
      draft.items = [];
    }
    if (!draft.title && !draft.body && !draft.items.length) {
      sheet.close();
      return;
    }
    draft.updatedAt = Date.now();
    const i = notes.findIndex((x) => x.id === draft.id);
    if (i >= 0) notes[i] = draft;
    else notes.push(draft);
    sheet.close();
    await saveNotes();
  });
  const sheet = openSheet(form, editing ? "Editar nota" : "Nueva nota");
  if (!editing) setTimeout(() => title.focus(), 60);
}

export function openNoteById(id) {
  const n = notes.find((x) => x.id === id);
  if (n) openNoteSheet(n);
}

// ---------- Pantalla ----------
export function renderNotes() {
  const v = $("#v-notas");
  const q = query.trim().toLowerCase();
  const list = sorted().filter((n) => !q || (n.title + " " + noteText(n, 5000)).toLowerCase().includes(q));
  const search = h("input", { id: "notes-q", type: "search", placeholder: "Buscar en tus notas", value: query, autocomplete: "off", "aria-label": "Buscar notas" });
  search.addEventListener("input", () => {
    query = search.value;
    const pos = search.selectionStart;
    renderNotes();
    const s = $("#notes-q");
    s.focus();
    s.setSelectionRange(pos, pos);
  });
  const kids = [h("div", { class: "notes-search" }, search)];
  if (!notes.length) {
    kids.push(
      h(
        "div",
        { class: "empty" },
        h("strong", null, "Tus notas van aquí"),
        h("span", null, "Ideas, apuntes de clase, la lista del mercado o pendientes de la práctica. Toca + para crear la primera."),
      ),
    );
  } else if (!list.length) {
    kids.push(h("div", { class: "empty" }, `Nada coincide con “${query}”.`));
  } else {
    kids.push(
      h(
        "div",
        { class: "notes-grid" },
        list.map((n) => {
          const items = n.kind === "lista" ? n.items || [] : [];
          return h(
            "button",
            { type: "button", class: "note-card n-" + (n.color || "verde"), onclick: () => openNoteSheet(n) },
            n.pinned ? h("span", { class: "pin" }, "Fijada") : null,
            n.title ? h("span", { class: "note-t" }, n.title) : null,
            n.kind === "lista"
              ? h(
                  "span",
                  { class: "note-list" },
                  items.slice(0, 6).map((it) => h("span", { class: it.done ? "done" : "" }, (it.done ? "☑ " : "☐ ") + it.t)),
                  items.length > 6 ? h("span", { class: "more" }, `+${items.length - 6} más`) : null,
                )
              : h("span", { class: "note-b" }, (n.body || "").slice(0, 280)),
            items.length ? h("span", { class: "note-meta" }, `${items.filter((i) => i.done).length} de ${items.length} listos`) : null,
          );
        }),
      ),
    );
  }
  v.replaceChildren(...kids);
}
