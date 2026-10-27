Hola. Quiero seguir trabajando en un mapa que hice con Claude en otro chat.

## Mi proyecto: "Mapa vivo de Pamplona"

Soy Jhullians, estudiante de software en Colombia. Tengo un mapa interactivo de Pamplona (Norte de Santander) en 2D y 3D. Está en mi repositorio de GitHub `JhulliansForero/JhulliansForero`, rama `claude/hola-hxbom2`, en la carpeta `proyectos/mapa-pamplona/`. Ahí está `README.md`, con el manual completo.

Resumen:

- Es **un solo archivo HTML** (`pamplona-map.html`) con JavaScript sin frameworks: el 2D usa Canvas y el 3D usa three.js r128 desde cdnjs.
- El código está en `fuente/page.html`. Los datos están en `fuente/data.json` y se insertan donde dice `/*DATA*/` con `python3 build.py`.
- Los datos vienen de **Overture Maps / OpenStreetMap** (`fetch.py` y `prep.py`) y el relieve de **AWS Terrain Tiles**. No uso Google Maps.
- Tiene:
  - Luz de mañana, tarde y noche según la hora real y la posición del sol.
  - 21 categorías de lugares con íconos dibujados en Canvas (sin emojis).
  - Nombres de calles y barrios.
  - Edificios coloniales con techos de teja y la catedral con torre.
  - Vida simulada: personas, carros, motos, bicis, animales y lluvia.
- Las coordenadas están en metros, con origen en lon −72.6465, lat 7.3770. El Parque Águeda Gallardo queda cerca de (−190, −65).

## Lo que te pido

1. Antes de cambiar algo, lee `proyectos/mapa-pamplona/README.md` y la parte de `fuente/page.html` que vas a tocar.
2. Haz los cambios en `fuente/page.html`. Después corre `python3 build.py` y copia el `pamplona-map.html` nuevo a la carpeta del proyecto.
3. Pruébalo y muéstrame capturas en 2D y 3D, de día y de noche, y en celular, antes de decirme que quedó listo.
4. Todo en español, con colores suaves (nada fosforescente).
5. No uses datos de Google Maps ni logos de marcas reales.
6. Guarda los cambios en la rama `claude/hola-hxbom2`.
