# Agenda de Jhullians

App personal para Android (y web instalable) que funciona sin internet: agenda, calendario, finanzas, hábitos y notas, con notificaciones y widgets.

- **Hoy**: progreso del día, lo que sigue, actividades, hábitos y próximos 7 días.
- **Calendario**: vista mensual por categorías (Estudio, Práctica, Personal, Salud, Otro). Las actividades pueden repetirse (diario, entre semana, semanal o mensual) y tener recordatorio.
- **Finanzas**: saldo disponible (puede quedar negativo), ingresos y gastos del mes, gastos por categoría, presupuesto mensual y movimientos fijos que se registran solos.
- **Hábitos**: días de la semana, recordatorio opcional y racha.
- **Notas**: texto o lista de chequeo, con color, búsqueda y nota fijada.
- **Notificaciones**: recordatorios de actividades y hábitos, resumen de la mañana, aviso de movimientos fijos y recordatorio nocturno para anotar gastos.
- **Widgets**: Hoy, Finanzas, Nota y Resumen.
- **Copia de seguridad**: exporta todo a un archivo JSON y lo restaura.

Todo se guarda en el dispositivo (IndexedDB). La app no usa internet.

## Compilar el APK

Necesitas Node 22, JDK 21 y el SDK de Android (plataforma 36).

```bash
npm ci
npm run build                     # genera www/app.js
npx cap sync android              # copia la app web al proyecto Android
cp signing/debug.keystore ~/.android/debug.keystore
cd android && ./gradlew assembleDebug
```

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`. Todas las versiones se firman con la misma llave (`signing/debug.keystore`) para que se instalen encima sin perder datos.

El flujo `.github/workflows/agenda.yml` hace lo mismo en GitHub Actions, publica el APK en *Releases* y sube la versión web a la rama `gh-pages`.

## Estructura

- `src/app.js`: pantallas Hoy y Calendario, ajustes, notificaciones, widgets y arranque.
- `src/finanzas.js`, `src/habitos.js`, `src/notas.js`: cada sección.
- `src/notify.js`: notificaciones locales. `src/backup.js`: copia de seguridad. `src/store.js`: almacenamiento.
- `www/`: HTML, estilos, fuentes, íconos, manifiesto y service worker.
- `android/`: proyecto Android con los widgets nativos (`app/src/main/java/com/jhullians/agenda/`) y sus diseños (`res/layout/widget_*.xml`).
