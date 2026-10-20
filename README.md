# JAMÓN RUN

Pilla-pilla por equipos en vista cenital, en pixel art. El **equipo AZUL** persigue con una pata de jamón; el **equipo ROJO** huye hasta que se acabe el tiempo. Se juega solo contra bots o **online con hasta 20 personas**.

Todo se genera por código: sprites, tiles, fuente, partículas, efectos de sonido, música (Web Audio en estilo 8-bit) y voces (Web Speech). No hay ni un solo asset externo.

**Jugar online:** https://jamon-run.jamon-run.workers.dev

**Tecnología:** Phaser 3.90 + TypeScript + Vite en el cliente; Cloudflare Workers + Durable Objects (plan gratuito) en el servidor. Opcionalmente, Electron para usarlo como app de escritorio.

---

## Invitar a tus amigos

1. Entra en el juego y elige **JUGAR ONLINE → CREAR SALA PRIVADA**.
2. En la sala pulsa **COPIAR ENLACE** y pásaselo (es la dirección del juego con `?sala=CÓDIGO`). También pueden entrar con **UNIRSE CON CÓDIGO** escribiendo las 5 letras que ves arriba.
3. Cada uno pulsa **¡ESTOY LISTO!**. Cuando estén todos, el anfitrión (★) pulsa **EMPEZAR PARTIDA**.

El anfitrión elige el mapa, la duración, la dificultad de los bots, si la sala sale en la partida rápida y hasta cuántos personajes se rellena con bots (no, 8, 12, 16 o 20). Los equipos se reparten al azar, con más o menos 1 azul por cada 3 rojos. Si a alguien se le corta la conexión, un bot lleva su personaje y lo recupera al volver dentro de 15 segundos.

¿Sin amigos a mano? **PARTIDA RÁPIDA** te mete en una sala pública con sitio (o crea una).

---

## Instalar y jugar en local

Necesitas Node.js 18 o superior.

```bash
npm install
npm run dev
```

`npm run dev` levanta a la vez el cliente (Vite, http://localhost:5173) y el servidor (wrangler, puerto 8787). Vite pasa `/api` y `/ws` al servidor, así que el modo online funciona en local. Para probar una sala, abre varias pestañas con el enlace de la sala: cada pestaña cuenta como un jugador distinto.

### Compilar

```bash
npm run build      # comprueba tipos de cliente y servidor y genera dist/
npm run preview    # sirve dist/ (solo el juego, sin servidor online)
```

### Desplegar (gratis, en Cloudflare)

El mismo Worker sirve el juego (`dist/`) y las salas online.

```bash
npx wrangler login     # una sola vez
npm run deploy         # compila y despliega
```

Al terminar, wrangler muestra la URL pública (`https://jamon-run.<tu-subdominio>.workers.dev`).

**Despliegue automático:** `.github/workflows/deploy.yml` compila y despliega en cada push a `main`. Necesita dos secretos en el repositorio:

```bash
gh secret set CLOUDFLARE_API_TOKEN     # token creado con la plantilla "Edit Cloudflare Workers"
gh secret set CLOUDFLARE_ACCOUNT_ID    # aparece en `npx wrangler whoami`
```

Sin esos secretos, el workflow compila igualmente y avisa de que no despliega.

El plan gratuito de Cloudflare da para jugar de sobra con amigos: unas 2 horas diarias de partidas de 20 personas con la sala llena, y mucho más con menos gente.

### App de escritorio (opcional, Electron)

```bash
npm run desktop       # compila y abre el juego en una ventana nativa
npm run package       # crea la app en release/ (p. ej. "Jamon Run.app" en macOS)
npm run desktop:test  # prueba automática: abre el juego oculto y comprueba que no hay errores (macOS/Linux)
```

Electron no está entre las dependencias del proyecto: estos comandos lo bajan con `npx` la primera vez (unos 100 MB). El modo online en la app de escritorio necesita la versión desplegada.

---

## Cómo se juega

1. **Elige mapa** (contra bots) o entra en una **sala online**.
2. **La ruleta muestra tu bando** (al azar).
   - **Equipo ROJO (escapistas):** chándal rojo, gorra «GUCHI», cadena dorada, riñonera y zapatillas blancas. Sobrevive hasta que acabe el tiempo: tu equipo gana si queda al menos uno vivo.
   - **Equipo AZUL (perseguidores):** uniforme azul y pata de jamón. Pilla a todos los rojos antes de que acabe el tiempo.
3. Los rojos tienen 100 de vida. Cada jamonazo quita 25 y los empuja. Al llegar a 0 quedan eliminados y se convierten en fantasma: pueden volar por el mapa o seguir con la cámara a los que siguen vivos.

Los azules salen 2 segundos después del «¡YA!». Tu personaje lleva una flecha amarilla encima; online, cada jugador lleva su nombre.

### Mi personaje

Desde el menú, el menú online o la sala. Puedes cambiar nombre, color, piel, peinado, color de pelo, sombrero, gafas y extra (entre 8 y 12 opciones cada uno). La vista previa gira sola y puedes probarte los dos uniformes. En partida el uniforme de tu equipo va encima de tu ropa, pero conservas tu estilo. Se guarda en el navegador y, online, lo ven los demás.

### Controles por defecto

| Acción | Teclado | Mando |
|---|---|---|
| Moverse | WASD o flechas | Stick izquierdo / cruceta |
| Golpe (azul) / Dash (rojo) | Espacio | A |
| Sprint | Shift | RB / RT / LB |
| Habilidad: lanzar jamón (azul) / bomba de humo (rojo) | E | X / Y |
| Rueda de frases | T | Select |
| Pantalla completa | F | — |
| Pausa | Esc | Start |

Las teclas se pueden reasignar en **Controles**. Las flechas siempre sirven para moverse. Los menús se manejan con teclado, ratón o mando. Online, la pausa es solo un menú: la partida sigue.

### Frases y voces

Los personajes sueltan frases en bocadillos según lo que pasa: «¡Píllalo!», «¡A por él!», «¡Jamonazo!», «¡Te pillé!», «¡Socorro!», «¡Ni me tocas!», «¡Mi gorra no!»… Con **T** abres la rueda de frases rápidas (eliges con 1–8 o con el ratón). Se oyen con la voz sintetizada del navegador, con un tono distinto para cada equipo; se pueden quitar en **Opciones → Voces**. Online, todos ven y oyen las frases de todos.

### Habilidades

- **Equipo rojo**
  - **Sprint:** gasta energía, que se recarga sola.
  - **Dash:** un impulso corto con cooldown. Durante el dash no te pueden golpear.
  - **Bomba de humo:** frena a los azules que entran en ella, y los bots no ven a quien está dentro.
- **Equipo azul**
  - **Impulso en línea recta:** cuanto más tiempo corren sin girar, más rápido van (hasta +34%).
  - **Golpe de jamón:** un arco corto delante, con 0,8 s de cooldown.
  - **Lanzamiento de jamón:** un ataque a distancia con 6 s de cooldown.

### Objetos

| Objeto | Efecto | Quién puede cogerlo |
|---|---|---|
| Botiquín | +25 de vida | Rojos heridos |
| Bota veloz | +40% de velocidad durante 5 s | Todos |
| Escudo | Bloquea un golpe | Rojos |

### Biomas

- **Bosque:** arbustos que te esconden y un río con varios puentes.
- **Desierto:** ruinas con pasillos estrechos y arenas movedizas que frenan mucho.
- **Nieve:** un lago de hielo donde resbalas, nieve profunda, cabañas y montones de nieve.

Con más personajes, el mapa crece repitiéndose en espejo: 48×30 tiles hasta 9 personajes, 94×30 hasta 15 y 94×58 hasta 20.

---

## Opciones

Volumen de la música, volumen de los efectos, dificultad de los bots, pantalla completa, voces, duración de la partida y tamaño de los equipos (contra bots). Todo se guarda solo en `localStorage`.

El juego ocupa siempre toda la ventana, con un zoom entero para que el pixel art se vea nítido. El HUD se ancla a los bordes de la pantalla.

---

## Cambiar el balance y la configuración

Todos los números están en **`shared/balance.ts`**. Lo usan el cliente y el servidor:

| Grupo | Ejemplos |
|---|---|
| `match` | duración por defecto, tamaño de los equipos, cuenta atrás, retraso de salida de los azules |
| `escapist` / `chaser` | velocidades, sprint, dash, golpe, lanzamiento, bomba de humo |
| `terrain` | arenas movedizas, hielo, nieve profunda, arbustos |
| `items` | frecuencia y efectos de los objetos |
| `ai.easy` / `ai.normal` / `ai.hard` | reacción, puntería, velocidad y valentía de los bots |
| `NET` | tick del servidor (20 Hz), entradas por segundo (15), máximo de jugadores (20), reconexión (15 s), retraso de interpolación, proporción de equipos, opciones de relleno con bots |
| `MAP_SCALE` | cuándo crece el mapa según los jugadores |
| `PHRASES` / `VOICE` | frases de los bocadillos y de la rueda, probabilidades, tono y velocidad de la voz por equipo |

### Pruebas útiles

- `http://localhost:5173/?autotest&speed=8`: tu personaje lo controla la IA y la partida va 8 veces más rápida; en la consola aparece quién gana cada partida (útil para ajustar el balance).
- `?lag=120`: simula 120 ms de ping para comprobar la predicción y la interpolación online.
- `npm run check:maps`: comprueba que todos los mapas (también los escalados) están conectados.

## Editar los mapas

Los mapas están en **`shared/maps.ts`**: cuadrículas ASCII de 48×30 tiles con la leyenda en el propio archivo. Después de editarlos, ejecuta `npm run check:maps`.

---

## Estructura

```
shared/                   código común a cliente y servidor (sin Phaser)
  balance.ts              TODOS los números de balance, red, frases y voces
  maps.ts · grid.ts       mapas ASCII, terreno, A*, Dijkstra, línea de visión
  mapScale.ts             mapas más grandes para más jugadores
  collision.ts            colisión círculo-contra-tiles (sin atascos en esquinas)
  look.ts                 opciones de "Mi personaje"
  protocol.ts             mensajes de red
  sim/                    simulación de la partida: personajes, IA, objetos, reglas
server/src/               Cloudflare Worker: sala (Durable Object, 20 Hz) y partida rápida
src/                      cliente Phaser
  game/                   modelo offline y vistas (personajes, objetos, jamones)
  net/                    conexión, reconexión y modelo online (predicción + interpolación)
  gfx/                    pixel art generado por código
  core/                   audio, voces y entrada (teclado + mando)
  scenes/                 Title, Menu, Online, Lobby, Character, MapSelect, RoleReveal,
                          Game, UI, Pause, Options, Controls, Credits, Results, Bye
electron/                 envoltorio de escritorio opcional
wrangler.toml             configuración del Worker
.github/workflows/        despliegue automático
```

### Cómo funciona el online

- **Servidor autoritativo:** cada sala es un Durable Object que ejecuta la misma simulación que el modo offline, a 20 ticks por segundo, y envía a cada jugador un snapshot compacto (unos 8 KB/s con 20 personajes).
- **El cliente solo envía entradas:** dirección, sprint y contadores de pulsaciones, como mucho 15 veces por segundo y solo cuando cambian.
- **Predicción:** tu personaje se mueve al instante con la misma simulación. Cuando llega el snapshot, se compara con dónde estabas cuando el servidor lo calculó y se corrige suavemente; con 150 ms de ping la corrección media es de unas décimas de píxel.
- **Interpolación:** los demás se dibujan unos 100 ms en el pasado, entre dos snapshots, y los efectos se reproducen a la vez que se ven.
- **Reconexión:** si en 4 s no llega nada, la conexión se da por perdida y se reintenta. El servidor guarda tu sitio 15 s y mientras tanto un bot lleva tu personaje.
