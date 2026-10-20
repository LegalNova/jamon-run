# JAMÓN RUN

Pilla-pilla por equipos en vista cenital, en pixel art. Unos persiguen con una pata de jamón y otros huyen hasta que se acabe el tiempo.

Todo se genera por código: sprites, tiles, fuente, partículas, efectos de sonido y música (Web Audio en estilo 8-bit). No hay ni un solo asset externo.

**Tecnología:** Phaser 3.90 + TypeScript + Vite. Opcionalmente, Electron para usarlo como app de escritorio.

---

## Instalar y jugar

Necesitas Node.js 18 o superior.

```bash
npm install
npm run dev
```

Abre la dirección que aparece en la terminal (normalmente http://localhost:5173).

### Compilar

```bash
npm run build      # comprueba tipos y genera dist/
npm run preview    # sirve dist/ para probar la versión compilada
```

### App de escritorio (opcional, Electron)

```bash
npm run desktop       # compila y abre el juego en una ventana nativa
npm run package       # crea la app en release/ (p. ej. "Jamon Run.app" en macOS)
npm run desktop:test  # prueba automática: abre el juego oculto y comprueba que no hay errores (macOS/Linux)
```

Electron no está entre las dependencias del proyecto, así que `npm install` no lo descarga. Estos comandos lo bajan con `npx` la primera vez (unos 100 MB). En la app de escritorio, el botón **SALIR** cierra la aplicación.

---

## Cómo se juega

1. **Elige mapa:** Bosque, Desierto o Nieve.
2. **La ruleta decide tu bando al azar.**
   - **Escapista (azul):** sobrevive hasta que acabe el tiempo. Tu equipo gana si queda al menos uno vivo.
   - **Perseguidor (rojo):** elimina a todos los escapistas a jamonazos antes de que acabe el tiempo.
3. Por defecto juegan 3 perseguidores contra 5 escapistas (se puede cambiar en Opciones). Al resto los controla la IA.
4. Los escapistas tienen 100 de vida. Cada golpe de jamón quita 25 y los empuja. Al llegar a 0 quedan eliminados y se convierten en fantasma: pueden moverse libremente o seguir con la cámara a los que siguen vivos.

Los perseguidores salen 2 segundos después del «¡YA!» para dar ventaja a los escapistas. Tu personaje lleva una flecha amarilla encima.

### Controles por defecto

| Acción | Teclado | Mando |
|---|---|---|
| Moverse | WASD o flechas | Stick izquierdo / cruceta |
| Golpe (perseguidor) / Dash (escapista) | Espacio | A |
| Sprint | Shift | RB / RT / LB |
| Habilidad: lanzar jamón (perseguidor) / bomba de humo (escapista) | E | X / Y |
| Pausa | Esc | Start |

Las teclas se pueden reasignar en **Controles**. Las flechas siempre sirven para moverse. Los menús se manejan con teclado, ratón o mando.

### Habilidades

- **Escapistas**
  - **Sprint:** gasta la barra de energía, que se recarga sola. Si la vacías, tardas un momento en empezar a recargar.
  - **Dash:** un impulso corto con cooldown. Durante el dash no te pueden golpear: es una esquiva.
  - **Bomba de humo:** frena a los perseguidores que entran en ella, y los bots no ven a quien está dentro.
- **Perseguidores**
  - **Impulso en línea recta:** cuanto más tiempo corren sin girar, más rápido van (hasta +34%).
  - **Golpe de jamón:** un arco corto delante del perseguidor, con 0,8 s de cooldown.
  - **Lanzamiento de jamón:** un ataque a distancia con 6 s de cooldown.

### Objetos (aparecen cada pocos segundos)

| Objeto | Efecto | Quién puede cogerlo |
|---|---|---|
| Botiquín | +25 de vida | Escapistas heridos |
| Bota veloz | +40% de velocidad durante 5 s | Todos |
| Escudo | Bloquea un golpe | Escapistas |

### Biomas

- **Bosque:** los arbustos te esconden. Desde fuera solo te ven si están muy cerca, y los bots no te detectan. Un río con varios puentes hace de embudo.
- **Desierto:** ruinas con pasillos estrechos para despistar y arenas movedizas que frenan mucho.
- **Nieve:** un lago de hielo donde resbalas, nieve profunda que frena, y cabañas y montones de nieve para cortar la línea de visión.

---

## Opciones

En Opciones puedes cambiar: volumen de la música, volumen de los efectos, dificultad (Fácil, Normal o Difícil), pantalla completa, duración de la partida (de 1 a 5 minutos), número de perseguidores (1 a 5) y número de escapistas (1 a 8).

Todo se guarda solo en `localStorage`. La dificultad cambia la velocidad de reacción, la puntería, la anticipación y la velocidad de los bots de ambos bandos.

---

## Cambiar el balance

Todos los números de jugabilidad están en **`src/config/balance.ts`**:

| Grupo | Ejemplos |
|---|---|
| `match` | duración por defecto, tamaño de los equipos, cuenta atrás, retraso de salida de los perseguidores |
| `escapist` | vida, velocidad, sprint (multiplicador, gasto y recarga), dash (velocidad, duración, cooldown), bomba de humo |
| `chaser` | velocidad, impulso en línea recta, daño, cooldown, alcance y arco del golpe, knockback, lanzamiento de jamón |
| `terrain` | freno de las arenas movedizas, control y fricción del hielo, nieve profunda, distancia a la que se descubre a alguien en un arbusto |
| `items` | frecuencia de aparición, máximo en el mapa, curación, duración de la bota, probabilidad de cada objeto |
| `ai.easy` / `ai.normal` / `ai.hard` | tiempo de reacción, frecuencia de recálculo de rutas, velocidad, error de puntería, radio de peligro, probabilidad de dash |
| raíz | invulnerabilidad tras recibir un golpe, hit-stop, aturdimiento, radio del cuerpo |

Guarda el archivo y, con `npm run dev` abierto, el juego se recarga solo.

### Probar el balance automáticamente

Abre `http://localhost:5173/?autotest&speed=8` y empieza una partida. Tu personaje pasa a estar controlado por la IA, la simulación va 8 veces más rápida y cada partida se reinicia sola. Al terminar cada una aparece en la consola del navegador una línea como esta:

```
[autotest] map=forest winner=chaser time=103.0 alive=0
```

Con los valores actuales y dificultad Normal, en bot contra bot los perseguidores ganan alrededor del 60% de las partidas. El Bosque está algo más a su favor, y el Desierto y la Nieve rondan el 50%. Un jugador humano suele jugar mejor que un bot en cualquiera de los dos bandos.

## Editar los mapas

Los mapas están en **`src/world/maps.ts`**. Son cuadrículas ASCII de 48×30 tiles y la leyenda está en el propio archivo: `#` roca, `T` árbol/cactus/pino, `b` arbusto, `~` agua, `=` puente, `q` arenas movedizas, `R` ruinas, `i` hielo, `d` nieve profunda, `n` montón de nieve, `H` cabaña, `X` salida de los perseguidores y `o` punto de aparición de objetos.

Después de editarlos, comprueba que todo el mapa es alcanzable:

```bash
npm run check:maps
```

---

## Estructura

```
src/
  main.ts                 configuración de Phaser y escalado entero (pixel art nítido)
  config/balance.ts       TODOS los números de balance
  config/settings.ts      opciones y teclas (localStorage)
  core/audio.ts           efectos y música 8-bit con Web Audio
  core/input.ts           teclado + mando, buffer de pulsaciones, navegación de menús
  gfx/                    paleta, fuente bitmap, personajes, tiles, props, partículas
  world/maps.ts           los 3 mapas en ASCII
  world/grid.ts           terreno, A*, Dijkstra, línea de visión
  world/GameMap.ts        renderizado del mapa y colisión círculo-contra-tiles
  entities/Character.ts   movimiento, habilidades, daño, animación
  entities/BotBrain.ts    IA de perseguidores y escapistas
  entities/...            controlador del jugador, objetos, jamón lanzado, humo
  scenes/                 Boot, Title, Menu, MapSelect, RoleReveal, Game, UI,
                          Pause, Options, Controls, Credits, Results, Bye
  ui/widgets.ts           botones, filas de opciones, menús navegables
electron/                 envoltorio de escritorio opcional
scripts/check-maps.ts     validador de mapas
```

### Notas técnicas

- **Resolución:** 480×270, escalada con zoom entero (×2, ×3, ×4…) según el tamaño de la ventana y sin suavizado.
- **Colisiones:** cada personaje es un círculo que se resuelve contra los tiles por el punto más cercano. Así resbala por las esquinas en lugar de engancharse, y se mueve en sub-pasos para no atravesar paredes durante el dash.
- **IA de los perseguidores:** eligen objetivo según la distancia, la vida que le queda y cuántos compañeros ya lo persiguen. Usan A* sobre la cuadrícula e intentan cortar el paso cuando otro perseguidor ya va a por el mismo.
- **IA de los escapistas:** usan un mapa de distancias (Dijkstra) desde todos los perseguidores. Al huir eligen la casilla a la que llegan antes que ellos, abierta y lejos de bordes y esquinas. Además van a por objetos cuando es seguro, se esconden en arbustos y usan dash y humo.
