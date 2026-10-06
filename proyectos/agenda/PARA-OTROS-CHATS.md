Hola. Te cuento de mi app para que me ayudes a llenarla.

## Mi app: "Agenda de Jhullians"

Soy Jhullians, estudiante de software en Colombia, y hago mi práctica en la Alcaldía. Tengo en mi celular Android una app personal que funciona sin internet y guarda todo en el teléfono. Tiene:

- **Hoy y Calendario:** actividades con fecha, hora de inicio y fin, categoría, notas y recordatorio. Pueden repetirse (todos los días, entre semana, cada semana o cada mes).
- **Finanzas (en pesos colombianos):** gastos e ingresos. Cada gasto se resta de mi saldo y cada ingreso se suma; el saldo puede quedar en negativo. También tiene movimientos fijos que se registran solos cada mes (sueldo, arriendo, plan del celular).
- **Hábitos:** con los días de la semana que me tocan y una hora de recordatorio. La app lleva la racha.
- **Notas:** de texto o de lista de chequeo, con color, y puedo fijar una.

La app tiene una opción **Ajustes → Pegar datos**: pego un bloque JSON y agrega todo de una vez, sin borrar lo que ya tengo.

## Lo que te pido

Cuando te pida organizar actividades, anotar gastos o ingresos, o crear notas o hábitos, respóndeme normal y **al final dame UN SOLO bloque de código JSON** con el formato de abajo, para copiarlo y pegarlo en la app. Incluye solo las secciones que apliquen.

Reglas:

- **Fechas** reales en formato `AAAA-MM-DD`. Si no sabes qué fecha es hoy, pregúntamela antes de calcular "mañana", "el jueves", etc.
- **Horas** en formato de 24 horas `HH:MM` (las 6 pm son `"18:00"`). Si es para todo el día, deja `"inicio": ""`.
- **Montos** como número entero en pesos, sin puntos ni signo: 18 mil → `18000`, un palo → `1000000`.
- **No inventes** datos que no te di. Si falta algo importante (la fecha o el valor), pregúntame.
- **JSON válido**: comillas dobles, sin comentarios y sin coma después del último elemento.

Valores permitidos:

| Campo | Valores |
|---|---|
| `actividades[].categoria` | `estudio`, `practica` (mi práctica en la Alcaldía), `personal`, `salud`, `otro` |
| `actividades[].repetir` | `no`, `diario`, `entre_semana`, `semanal`, `mensual` (opcional `hasta`: fecha final) |
| `actividades[].recordatorio_min` | `-1` (sin recordatorio), `0`, `5`, `10`, `15`, `30`, `60`, `1440` (un día antes) |
| `movimientos[].tipo` y `fijos[].tipo` | `gasto` o `ingreso` |
| Categorías de **gasto** | `comida`, `transporte`, `vivienda`, `servicios`, `estudio`, `salud`, `ocio`, `ropa`, `deudas`, `otros` |
| Categorías de **ingreso** | `salario`, `practica`, `freelance`, `ventas`, `regalo`, `otros` |
| `notas[].color` | `verde`, `azul`, `amarillo`, `rosa`, `lila`, `gris` |
| `habitos[].dias` | letras `L`, `M`, `X` (miércoles), `J`, `V`, `S`, `D` |

## Formato (ejemplo completo)

```json
{
  "agenda_jhullians": 1,
  "actividades": [
    {
      "titulo": "Estudiar Java: colecciones",
      "fecha": "2026-10-08",
      "inicio": "18:00",
      "fin": "19:30",
      "categoria": "estudio",
      "repetir": "no",
      "recordatorio_min": 15,
      "notas": "Repasar List, Set y Map"
    },
    {
      "titulo": "Práctica en la Alcaldía",
      "fecha": "2026-10-06",
      "inicio": "08:00",
      "fin": "12:00",
      "categoria": "practica",
      "repetir": "entre_semana",
      "hasta": "2026-12-18",
      "recordatorio_min": 30,
      "notas": ""
    }
  ],
  "movimientos": [
    { "tipo": "gasto", "monto": 18000, "categoria": "comida", "descripcion": "Almuerzo", "fecha": "2026-10-06" },
    { "tipo": "gasto", "monto": 5800, "categoria": "transporte", "descripcion": "Bus", "fecha": "2026-10-06" },
    { "tipo": "ingreso", "monto": 250000, "categoria": "freelance", "descripcion": "Página web cliente", "fecha": "2026-10-05" }
  ],
  "fijos": [
    { "tipo": "ingreso", "monto": 1300000, "categoria": "practica", "nombre": "Auxilio de práctica", "dia": 1 },
    { "tipo": "gasto", "monto": 45000, "categoria": "servicios", "nombre": "Plan del celular", "dia": 15 }
  ],
  "notas": [
    { "titulo": "Mercado", "lista": ["Arroz", "Huevos", "Café"], "color": "amarillo", "fijada": true },
    { "titulo": "Ideas de proyecto", "texto": "App de inventario con Spring Boot y PostgreSQL", "color": "azul", "fijada": false }
  ],
  "habitos": [
    { "nombre": "Leer 20 minutos", "dias": ["L", "M", "X", "J", "V"], "hora": "21:30" },
    { "nombre": "Tomar agua", "dias": ["L", "M", "X", "J", "V", "S", "D"], "hora": "" }
  ]
}
```

Notas sobre el formato:

- Una nota es de **texto** (usa `"texto"`) o de **lista** (usa `"lista"`), no ambas.
- Los **fijos** empiezan a registrarse solos el mes siguiente. Si un pago de este mes ya pasó, ponlo también en `movimientos`.
- Un movimiento con **fecha futura** (por ejemplo, las cuotas de una deuda) queda **programado**: no se descuenta del saldo hasta que llega su día, y ese día me llega una notificación. Así que puedes planear pagos con sus fechas reales.
- Si te pido solo gastos, devuelve solo `"agenda_jhullians"` y `"movimientos"`.
