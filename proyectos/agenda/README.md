# Agenda de Jhullians

App de agenda para el celular con calendario y un chat con Claude que crea, mueve y completa actividades por ti.

- **Hoy**: actividades del día, progreso y próximos 7 días.
- **Calendario**: vista mensual por categorías (Estudio, Práctica, Personal, Salud, Otro).
- **Claude**: chat que modifica la agenda. Los chats quedan guardados y puedes retomar cualquiera desde "Chats anteriores".

Todo se guarda en el dispositivo (IndexedDB). Solo los mensajes del chat salen a internet, directo a la API de Anthropic.

## Instalar

- **Android (APK):** cada push a `proyectos/agenda/` compila un APK con GitHub Actions y lo publica en *Releases* como `Agenda-Jhullians.apk`. Las versiones nuevas se instalan encima sin perder datos porque todas se firman con la misma llave (`signing/debug.keystore`).
- **Web instalable (PWA):** el mismo flujo publica `www/` en la rama `gh-pages`. Con GitHub Pages activado sobre esa rama, abre la página en el celular y toca *Agregar a pantalla de inicio*.

## Clave de API

El chat usa la API de Claude con tu propia clave (console.anthropic.com → API Keys). Se pega una vez en **Ajustes** dentro de la app y queda guardada solo en el dispositivo.

## Desarrollo

```bash
npm install
npm run build      # genera www/app.js
npm run dev        # servidor local en http://localhost:8000
```

Para compilar el APK en tu computador necesitas Android Studio:

```bash
npx cap add android
npx capacitor-assets generate --android
npx cap sync android
npx cap open android
```

## Estructura

- `src/app.js`: interfaz (pantallas, formularios, chat, ajustes).
- `src/claude.js`: conversación con Claude y herramientas que leen y cambian la agenda.
- `src/store.js`: almacenamiento local.
- `www/`: HTML, estilos, fuentes, íconos, manifiesto y service worker.
- `assets/`: ícono y pantalla de inicio de Android.
