// "Pegar datos": convierte el bloque que entregan otros chats de Claude en
// actividades, movimientos, fijos, notas y hábitos listos para agregar.
// Solo valida y normaliza; quien llama decide si los agrega.

const CATS = ["estudio", "practica", "personal", "salud", "otro"];
const GASTO = ["comida", "transporte", "vivienda", "servicios", "estudio", "salud", "ocio", "ropa", "deudas", "otros"];
const INGRESO = ["salario", "practica", "freelance", "ventas", "regalo", "otros"];
const COLORS = ["verde", "azul", "amarillo", "rosa", "lila", "gris"];
const REPEAT = { no: "none", diario: "daily", entre_semana: "weekdays", semanal: "weekly", mensual: "monthly" };
const REMIND = [-1, 0, 5, 10, 15, 30, 60, 1440];
const DAYS = { D: 0, L: 1, M: 2, X: 3, J: 4, V: 5, S: 6 };

const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00"));
const isTime = (s) => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
// Pesos enteros: en Colombia el punto separa miles ("18.000" = 18000).
const money = (v) => Math.round(typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d]/g, "")));
const norm = (s) => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Saca el JSON aunque venga dentro de un bloque ```json o con texto alrededor.
export function extractJson(text) {
  const t = String(text || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : t;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No encontré datos. Pega el bloque completo que empieza con { y termina con }.");
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new Error("El bloque está incompleto o mal copiado. Cópialo otra vez completo, desde { hasta }.");
  }
}

export function parse(text, today) {
  const data = extractJson(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Esos datos no tienen el formato de la agenda.");
  const out = { acts: [], movs: [], fixed: [], notes: [], habits: [], errors: [] };
  const arr = (k) => (Array.isArray(data[k]) ? data[k] : []);
  const err = (what, i, why) => out.errors.push(`${what} ${i + 1}: ${why}`);

  arr("actividades").forEach((x, i) => {
    const title = str(x?.titulo, 120);
    if (!title) return err("Actividad", i, "falta el título");
    if (!isDate(x.fecha)) return err("Actividad", i, `fecha inválida (${x?.fecha ?? "vacía"})`);
    const start = isTime(x.inicio) ? x.inicio : "";
    let end = isTime(x.fin) ? x.fin : "";
    if (!start || (end && end <= start)) end = "";
    const repeat = REPEAT[norm(x.repetir).replace(/\s+/g, "_")] || "none";
    const remind = REMIND.includes(Number(x.recordatorio_min)) ? Number(x.recordatorio_min) : 15;
    out.acts.push({
      title,
      date: x.fecha,
      start,
      end,
      category: CATS.includes(norm(x.categoria)) ? norm(x.categoria) : "otro",
      notes: str(x.notas, 1000),
      repeat,
      until: repeat !== "none" && isDate(x.hasta) && x.hasta >= x.fecha ? x.hasta : "",
      remind,
    });
  });

  arr("movimientos").forEach((x, i) => {
    const type = norm(x?.tipo) === "ingreso" ? "ingreso" : norm(x?.tipo) === "gasto" ? "gasto" : null;
    if (!type) return err("Movimiento", i, "el tipo debe ser gasto o ingreso");
    const amount = money(x.monto);
    if (!Number.isFinite(amount) || amount <= 0) return err("Movimiento", i, "monto inválido");
    const cats = type === "ingreso" ? INGRESO : GASTO;
    out.movs.push({
      type,
      amount,
      cat: cats.includes(norm(x.categoria)) ? norm(x.categoria) : "otros",
      desc: str(x.descripcion, 120),
      date: isDate(x.fecha) ? x.fecha : today,
    });
  });

  arr("fijos").forEach((x, i) => {
    const type = norm(x?.tipo) === "ingreso" ? "ingreso" : norm(x?.tipo) === "gasto" ? "gasto" : null;
    if (!type) return err("Fijo", i, "el tipo debe ser gasto o ingreso");
    const amount = money(x.monto);
    const day = Math.round(Number(x.dia));
    const name = str(x.nombre, 80);
    if (!Number.isFinite(amount) || amount <= 0) return err("Fijo", i, "monto inválido");
    if (!(day >= 1 && day <= 31)) return err("Fijo", i, "el día debe estar entre 1 y 31");
    if (!name) return err("Fijo", i, "falta el nombre");
    const cats = type === "ingreso" ? INGRESO : GASTO;
    out.fixed.push({ type, amount, cat: cats.includes(norm(x.categoria)) ? norm(x.categoria) : "otros", desc: name, day });
  });

  arr("notas").forEach((x, i) => {
    const title = str(x?.titulo, 100);
    const body = str(x?.texto, 5000);
    const items = Array.isArray(x?.lista) ? x.lista.map((t) => str(t, 200)).filter(Boolean) : [];
    if (!title && !body && !items.length) return err("Nota", i, "está vacía");
    out.notes.push({
      title,
      kind: items.length ? "lista" : "texto",
      body: items.length ? "" : body,
      items: items.map((t) => ({ t, done: false })),
      color: COLORS.includes(norm(x.color)) ? norm(x.color) : "verde",
      pinned: x.fijada === true,
    });
  });

  arr("habitos").forEach((x, i) => {
    const name = str(x?.nombre, 60);
    if (!name) return err("Hábito", i, "falta el nombre");
    let days = Array.isArray(x.dias) ? x.dias.map((d) => DAYS[String(d).trim().toUpperCase().charAt(0)]).filter((d) => d !== undefined) : [];
    days = [...new Set(days)];
    if (!days.length) days = [0, 1, 2, 3, 4, 5, 6];
    out.habits.push({ name, days, remindAt: isTime(x.hora) ? x.hora : "" });
  });

  const total = out.acts.length + out.movs.length + out.fixed.length + out.notes.length + out.habits.length;
  if (!total && !out.errors.length) throw new Error("El bloque no trae actividades, movimientos, fijos, notas ni hábitos.");
  return out;
}

// Llaves para no agregar dos veces lo mismo si se pega el mismo bloque de nuevo.
export const keyAct = (a) => [norm(a.title), a.date, a.start || ""].join("|");
export const keyMov = (m) => [m.type, m.amount, m.date, norm(m.desc)].join("|");
export const keyFixed = (f) => [f.type, norm(f.desc), f.day].join("|");
export const keyNote = (n) => [norm(n.title), norm(n.body).slice(0, 80), (n.items || []).map((i) => norm(i.t)).join(",").slice(0, 80)].join("|");
export const keyHabit = (h) => norm(h.name);
