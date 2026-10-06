// Conversación con Claude a través de la API de Anthropic, con herramientas
// que leen y modifican la agenda guardada en el dispositivo.

import Anthropic from "@anthropic-ai/sdk";

export const MODELS = [
  {
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    note: "El más inteligente. Unos 2 a 6 centavos de dólar por mensaje.",
  },
  {
    id: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    note: "Rápido y muy capaz. Más o menos la mitad de lo que cuesta Opus.",
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    note: "El más económico y veloz. Menos de 1 centavo por mensaje.",
  },
];
export const DEFAULT_MODEL = MODELS[0].id;

export const CATEGORIES = ["estudio", "practica", "personal", "salud", "otro"];
const GASTO_CATS = ["comida", "transporte", "vivienda", "servicios", "estudio", "salud", "ocio", "ropa", "deudas", "otros"];
const INGRESO_CATS = ["salario", "practica", "freelance", "ventas", "regalo", "otros"];

const SYSTEM = `Eres Claude, el asistente dentro de la app de agenda y finanzas personales de Jhullians Forero, estudiante de software en Colombia que además hace su práctica en la Alcaldía. Tu trabajo es ayudarle a organizar su tiempo y su plata usando las herramientas de la app.

Cómo trabajar:
- Cada mensaje de Jhullians empieza con un bloque [Contexto] que trae la fecha y hora actuales y un calendario de referencia de los próximos días. Úsalo para convertir "mañana", "el jueves" o "la otra semana" en fechas exactas (YYYY-MM-DD).
- Antes de planear algo o de responder qué tiene pendiente, consulta la agenda con listar_actividades. No inventes actividades que no aparezcan ahí.
- Cuando te pida crear, planear u organizar, crea actividades concretas con horas realistas y sin cruces con lo que ya tiene. Si algo se repite, crea una actividad por cada día (máximo 40 por llamada).
- Para cambiar, mover o marcar como hecha una actividad, usa actualizar_actividades con su id. Borra solo cuando lo pida claramente.
- Categorías de actividades: estudio, practica (su práctica en la Alcaldía), personal, salud, otro.

Finanzas (en pesos colombianos, COP):
- La app lleva sus ingresos y gastos. El saldo disponible es lo que tenía al empezar + ingresos − gastos, y puede quedar negativo.
- Cuando diga que gastó o recibió plata, regístralo con registrar_movimientos. Interpreta "18 mil" como 18000, "una luca" como 1000 y "un palo" como 1000000. Si no dice la fecha, es hoy.
- Categorías de gastos: comida, transporte, vivienda, servicios, estudio, salud, ocio, ropa, deudas, otros. Categorías de ingresos: salario, practica, freelance, ventas, regalo, otros.
- Para preguntas sobre su plata usa resumen_finanzas o listar_movimientos; nunca inventes cifras. Si ves que gasta de más o queda en negativo, díselo con tacto y dale un consejo concreto.

Cómo responder:
- En español colombiano, cálido y breve: de 2 a 4 frases.
- Cuando hayas cambiado la agenda, di en una frase qué hiciste. La app ya le muestra la lista de cambios, así que no la repitas completa.
- Escribe texto plano: sin tablas, sin encabezados y sin markdown.`;

const DATE = { type: "string", description: "Fecha en formato YYYY-MM-DD" };
const TIME = { type: "string", description: "Hora en formato HH:MM de 24 horas, o vacío si es para todo el día" };
const CATEGORY = { type: "string", enum: CATEGORIES };

const TOOLS = [
  {
    name: "listar_actividades",
    description:
      "Lista las actividades de la agenda entre dos fechas (ambas incluidas), ordenadas por fecha y hora. Devuelve id, título, fecha, horas, categoría, si está hecha y notas.",
    input_schema: {
      type: "object",
      properties: { desde: DATE, hasta: DATE },
      required: ["desde", "hasta"],
    },
  },
  {
    name: "crear_actividades",
    description:
      "Crea una o varias actividades nuevas en la agenda. Devuelve los ids de las creadas y las que se rechazaron por datos inválidos.",
    input_schema: {
      type: "object",
      properties: {
        actividades: {
          type: "array",
          maxItems: 40,
          items: {
            type: "object",
            properties: {
              titulo: { type: "string", description: "Qué va a hacer, corto y claro" },
              fecha: DATE,
              inicio: TIME,
              fin: TIME,
              categoria: CATEGORY,
              notas: { type: "string", description: "Detalles opcionales" },
            },
            required: ["titulo", "fecha", "categoria"],
          },
        },
      },
      required: ["actividades"],
    },
  },
  {
    name: "actualizar_actividades",
    description:
      "Cambia campos de actividades existentes por id: título, fecha, horas, categoría, notas o si está hecha. Solo se cambian los campos que envíes.",
    input_schema: {
      type: "object",
      properties: {
        cambios: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              titulo: { type: "string" },
              fecha: DATE,
              inicio: TIME,
              fin: TIME,
              categoria: CATEGORY,
              notas: { type: "string" },
              hecha: { type: "boolean" },
            },
            required: ["id"],
          },
        },
      },
      required: ["cambios"],
    },
  },
  {
    name: "eliminar_actividades",
    description: "Elimina actividades por id. Úsala solo cuando Jhullians lo pida claramente.",
    input_schema: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" } } },
      required: ["ids"],
    },
  },
  {
    name: "registrar_movimientos",
    description:
      "Registra gastos o ingresos de dinero en pesos colombianos. Los gastos se restan del saldo y los ingresos se suman. Devuelve lo registrado y el saldo nuevo.",
    input_schema: {
      type: "object",
      properties: {
        movimientos: {
          type: "array",
          maxItems: 30,
          items: {
            type: "object",
            properties: {
              tipo: { type: "string", enum: ["gasto", "ingreso"] },
              monto: { type: "number", description: "Valor en pesos, sin puntos ni signo. Ej: 18000" },
              categoria: { type: "string", enum: [...new Set([...GASTO_CATS, ...INGRESO_CATS])] },
              descripcion: { type: "string", description: "En qué fue, corto. Ej: almuerzo" },
              fecha: DATE,
            },
            required: ["tipo", "monto", "categoria"],
          },
        },
      },
      required: ["movimientos"],
    },
  },
  {
    name: "listar_movimientos",
    description: "Lista los ingresos y gastos entre dos fechas (ambas incluidas), del más reciente al más antiguo, con su id.",
    input_schema: {
      type: "object",
      properties: { desde: DATE, hasta: DATE },
      required: ["desde", "hasta"],
    },
  },
  {
    name: "resumen_finanzas",
    description:
      "Devuelve el saldo disponible, los ingresos, gastos y balance de un mes, los gastos por categoría, el presupuesto mensual y los movimientos fijos.",
    input_schema: {
      type: "object",
      properties: { mes: { type: "string", description: "Mes en formato YYYY-MM. Si no se envía, el mes actual." } },
    },
  },
  {
    name: "eliminar_movimientos",
    description: "Elimina ingresos o gastos por id. Úsala solo cuando Jhullians lo pida claramente o para corregir un registro equivocado que tú hiciste.",
    input_schema: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" } } },
      required: ["ids"],
    },
  },
].map((t) => ({ ...t, eager_input_streaming: true }));

// ---------- Validación de entradas (el modelo puede mandar datos incompletos) ----------
const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00"));
const isTime = (s) => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

function cleanFields(x, partial) {
  if (!x || typeof x !== "object") return { error: "entrada inválida" };
  const o = {};
  if (x.titulo !== undefined) {
    if (typeof x.titulo !== "string" || !x.titulo.trim()) return { error: "título vacío" };
    o.title = x.titulo.trim().slice(0, 120);
  }
  if (x.fecha !== undefined) {
    if (!isDate(x.fecha)) return { error: `fecha inválida: ${String(x.fecha)}` };
    o.date = x.fecha;
  }
  for (const [src, dst] of [["inicio", "start"], ["fin", "end"]]) {
    if (x[src] === undefined) continue;
    if (x[src] === "" || x[src] === null) o[dst] = "";
    else if (isTime(x[src])) o[dst] = x[src];
    else return { error: `hora inválida: ${String(x[src])}` };
  }
  if (x.categoria !== undefined) o.category = CATEGORIES.includes(x.categoria) ? x.categoria : "otro";
  if (x.notas !== undefined) o.notes = typeof x.notas === "string" ? x.notas.slice(0, 1000) : "";
  if (x.hecha !== undefined) {
    if (typeof x.hecha !== "boolean") return { error: "hecha debe ser true o false" };
    o.done = x.hecha;
  }
  if (!partial) {
    if (!o.title || !o.date) return { error: "faltan título o fecha" };
    if (o.end && !o.start) o.end = "";
  }
  return { value: o };
}

function toModel(a) {
  return {
    id: a.id,
    titulo: a.title,
    fecha: a.date,
    inicio: a.start || "",
    fin: a.end || "",
    categoria: a.category,
    hecha: !!a.done,
    ...(a.notes ? { notas: a.notes.slice(0, 200) } : {}),
  };
}

// Ejecuta una herramienta contra la agenda. `agenda` lo provee la app.
async function runTool(block, agenda, report) {
  const input = block.input && typeof block.input === "object" ? block.input : {};
  switch (block.name) {
    case "listar_actividades": {
      if (!isDate(input.desde) || !isDate(input.hasta)) throw new Error("desde y hasta deben ser fechas YYYY-MM-DD");
      report.status("Revisando tu agenda…");
      const list = agenda.list(input.desde, input.hasta);
      return { total: list.length, actividades: list.slice(0, 150).map(toModel), recortada: list.length > 150 };
    }
    case "crear_actividades": {
      if (!Array.isArray(input.actividades)) throw new Error("actividades debe ser una lista");
      const items = input.actividades.slice(0, 40);
      report.status(`Creando ${items.length} actividad${items.length === 1 ? "" : "es"}…`);
      const valid = [];
      const rechazadas = [];
      items.forEach((x, i) => {
        const r = cleanFields(x, false);
        if (r.error) rechazadas.push({ indice: i, motivo: r.error });
        else valid.push(r.value);
      });
      const created = await agenda.create(valid);
      created.forEach((a) => report.change("created", a));
      return { creadas: created.map((a) => ({ id: a.id, titulo: a.title, fecha: a.date, inicio: a.start })), rechazadas };
    }
    case "actualizar_actividades": {
      if (!Array.isArray(input.cambios)) throw new Error("cambios debe ser una lista");
      report.status("Actualizando tu agenda…");
      const patches = [];
      const errores = [];
      for (const c of input.cambios.slice(0, 60)) {
        const r = cleanFields(c, true);
        if (r.error) errores.push({ id: String(c?.id ?? ""), motivo: r.error });
        else patches.push({ id: String(c.id), changes: r.value });
      }
      const { updated, missing } = await agenda.update(patches);
      updated.forEach((a) => report.change(a.done ? "done" : "updated", a));
      return { actualizadas: updated.map((a) => a.id), no_encontradas: missing, errores };
    }
    case "eliminar_actividades": {
      if (!Array.isArray(input.ids)) throw new Error("ids debe ser una lista");
      report.status("Eliminando…");
      const { removed, missing } = await agenda.remove(input.ids.map(String).slice(0, 60));
      removed.forEach((a) => report.change("deleted", a));
      return { eliminadas: removed.map((a) => a.id), no_encontradas: missing };
    }
    case "registrar_movimientos": {
      if (!Array.isArray(input.movimientos)) throw new Error("movimientos debe ser una lista");
      const valid = [];
      const rechazados = [];
      input.movimientos.slice(0, 30).forEach((x, i) => {
        const type = x?.tipo === "ingreso" ? "ingreso" : x?.tipo === "gasto" ? "gasto" : null;
        const amount = Number(x?.monto);
        if (!type) return rechazados.push({ indice: i, motivo: "tipo debe ser gasto o ingreso" });
        if (!Number.isFinite(amount) || amount <= 0) return rechazados.push({ indice: i, motivo: "monto inválido" });
        if (x.fecha !== undefined && !isDate(x.fecha)) return rechazados.push({ indice: i, motivo: "fecha inválida" });
        const cats = type === "ingreso" ? INGRESO_CATS : GASTO_CATS;
        valid.push({ type, amount: Math.round(amount), cat: cats.includes(x.categoria) ? x.categoria : "otros", desc: typeof x.descripcion === "string" ? x.descripcion.trim() : "", date: x.fecha });
      });
      report.status("Anotando en tus finanzas…");
      const created = valid.length ? await agenda.addMovs(valid) : [];
      created.forEach((m) => report.change(m.type, { title: m.desc || m.cat, date: m.date, amount: m.amount }));
      return {
        registrados: created.map((m) => ({ id: m.id, tipo: m.type, monto: m.amount, categoria: m.cat, fecha: m.date })),
        rechazados,
        saldo_disponible: agenda.summary().saldo_disponible,
      };
    }
    case "listar_movimientos": {
      if (!isDate(input.desde) || !isDate(input.hasta)) throw new Error("desde y hasta deben ser fechas YYYY-MM-DD");
      report.status("Revisando tus finanzas…");
      const list = agenda.listMovs(input.desde, input.hasta);
      return {
        total: list.length,
        movimientos: list.slice(0, 200).map((m) => ({ id: m.id, tipo: m.type, monto: m.amount, categoria: m.cat, descripcion: m.desc, fecha: m.date })),
        recortada: list.length > 200,
      };
    }
    case "resumen_finanzas": {
      if (input.mes !== undefined && !/^\d{4}-\d{2}$/.test(String(input.mes))) throw new Error("mes debe tener formato YYYY-MM");
      report.status("Revisando tus finanzas…");
      return agenda.summary(input.mes);
    }
    case "eliminar_movimientos": {
      if (!Array.isArray(input.ids)) throw new Error("ids debe ser una lista");
      report.status("Eliminando…");
      const { removed, missing } = await agenda.removeMovs(input.ids.map(String).slice(0, 60));
      removed.forEach((m) => report.change("mov_deleted", { title: m.desc || m.cat, date: m.date, amount: m.amount }));
      return { eliminados: removed.map((m) => m.id), no_encontrados: missing, saldo_disponible: agenda.summary().saldo_disponible };
    }
    default:
      throw new Error(`herramienta desconocida: ${block.name}`);
  }
}

function modelParams(model) {
  if (model.startsWith("claude-haiku")) return {};
  // Pensamiento adaptativo, esfuerzo medio y respaldo automático si el modelo declina.
  return {
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };
}

// Tras un cambio de modelo a mitad de respuesta, lo que quedó antes del último
// bloque `fallback` (salvo texto) no se reenvía ni se ejecuta.
const ECHO_BEFORE_FALLBACK = new Set(["text", "fallback"]);
function echoable(content) {
  const last = content.map((b) => b.type).lastIndexOf("fallback");
  if (last < 0) return content;
  return content.filter((b, i) => i >= last || ECHO_BEFORE_FALLBACK.has(b.type));
}

export class TurnError extends Error {
  constructor(kind, message, cause) {
    super(message);
    this.kind = kind;
    this.cause = cause;
  }
}

export function describeError(err) {
  if (err instanceof TurnError) return err.message;
  if (err instanceof Anthropic.APIUserAbortError) return "Detuviste la respuesta.";
  if (err instanceof Anthropic.AuthenticationError) return "Tu clave de API no es válida. Revísala en Ajustes.";
  if (err instanceof Anthropic.PermissionDeniedError) return "Tu clave de API no tiene permiso para usar este modelo. Prueba otro modelo en Ajustes.";
  if (err instanceof Anthropic.NotFoundError) return "Este modelo no está disponible para tu cuenta. Elige otro en Ajustes.";
  if (err instanceof Anthropic.RateLimitError) return "Enviaste muchos mensajes seguidos. Espera un minuto y vuelve a intentarlo.";
  if (err instanceof Anthropic.BadRequestError)
    return `Anthropic rechazó la solicitud. Si dice "credit balance", te falta saldo: recarga en console.anthropic.com.\n\nDetalle: ${err.message}`;
  if (err instanceof Anthropic.InternalServerError) return "Los servidores de Claude están ocupados. Inténtalo de nuevo en un momento.";
  if (err instanceof Anthropic.APIConnectionError) return "No hay conexión a internet. Tus actividades siguen guardadas en el celular.";
  if (err instanceof Anthropic.APIError) return `Error de la API (${err.status ?? "?"}): ${err.message}`;
  return "Algo falló al hablar con Claude. Envía el mensaje otra vez.";
}

/**
 * Corre un turno completo: envía el mensaje, ejecuta las herramientas que pida
 * Claude y repite hasta que termine.
 * Devuelve { messages } con la conversación completa para guardarla tal cual.
 */
export async function runTurn({ apiKey, model, history, userContent, agenda, onText, onStatus, onChange, signal }) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const messages = [...history, { role: "user", content: userContent }];
  const report = { status: onStatus, change: onChange };
  let hadText = false;
  let jsonRetries = 0;

  for (let round = 0; round < 12; round++) {
    let roundHasText = false;
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 64000,
        system: SYSTEM,
        tools: TOOLS,
        messages,
        cache_control: { type: "ephemeral" },
        ...modelParams(model),
      },
      { signal },
    );
    stream.on("text", (delta) => {
      if (!roundHasText) {
        roundHasText = true;
        if (hadText) onText("\n\n");
        hadText = true;
        onStatus("");
      }
      onText(delta);
    });

    let message;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Solo se reintenta cuando la entrada de una herramienta llegó como JSON ilegible.
      if (err instanceof Anthropic.APIError || signal?.aborted || jsonRetries++ >= 2) throw err;
      continue;
    }

    if (message.stop_reason === "refusal") {
      throw new TurnError("refusal", "Claude no pudo ayudar con ese mensaje. Prueba a decirlo de otra forma.");
    }

    const content = echoable(message.content);
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content });
      continue;
    }

    const toolUses = content.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) {
      messages.push({ role: "assistant", content });
      return { messages };
    }
    if (message.stop_reason === "max_tokens") {
      throw new TurnError("truncated", "La respuesta de Claude se cortó a mitad de camino. Pídele menos cosas a la vez.");
    }

    messages.push({ role: "assistant", content });
    const results = await Promise.all(
      toolUses.map(async (block) => {
        try {
          const out = await runTool(block, agenda, report);
          return { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) };
        } catch (e) {
          return { type: "tool_result", tool_use_id: block.id, is_error: true, content: String(e?.message || e) };
        }
      }),
    );
    if (signal?.aborted) throw new Anthropic.APIUserAbortError();
    messages.push({ role: "user", content: results });
    onStatus("Pensando…");
  }
  throw new TurnError("loop", "Claude tardó demasiados pasos en responder. Inténtalo con una petición más concreta.");
}

// Prueba la clave sin gastar saldo (consultar un modelo no cuesta).
export async function checkKey(apiKey, model) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  await client.models.retrieve(model);
}
