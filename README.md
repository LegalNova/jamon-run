# JAMÓN RUN

Pilla-pilla por equipos en vista cenital, en pixel art, con **4 modos de juego**: Pilla Jamón, Infección, Jamón Bomba y Escondite Jamonero. Se juega solo contra bots o **online con hasta 20 personas**, y todo va cargado de dopamina: monedas con combos, medallas, dos tiradas de la ruleta por partida, tu propia tirada y una carrera de caballos en cada partida.

Todo se genera por código: sprites, tiles, fuente, partículas, efectos de sonido, música (Web Audio en estilo 8-bit) y voces (Web Speech). No hay ni un solo asset externo.

**Jugar online:** https://jamon-run.jamon-run.workers.dev

**Tecnología:** Phaser 3.90 + TypeScript + Vite en el cliente; Cloudflare Workers + Durable Objects (plan gratuito) en el servidor. Opcionalmente, Electron para usarlo como app de escritorio.

---

## Invitar a tus amigos

1. Entra en el juego y elige **JUGAR ONLINE → CREAR SALA PRIVADA**.
2. En la sala pulsa **COPIAR ENLACE** y pásaselo (es la dirección del juego con `?sala=CÓDIGO`). También pueden entrar con **UNIRSE CON CÓDIGO** escribiendo las 5 letras que ves arriba.
3. Cada uno pulsa **¡ESTOY LISTO!**. Cuando estén todos, el anfitrión (★) pulsa **EMPEZAR PARTIDA**.

El anfitrión elige el **modo** (o deja **VOTACIÓN**: cada uno vota con **TU VOTO** y gana el más votado; si hay empate, al azar), el mapa, cuántos **cazadores** hay al empezar (automático o de 1 a 5), la duración, la dificultad de los bots, si la sala sale en la partida rápida y hasta cuántos personajes se rellena con bots (no, 8, 12, 16 o 20). Cada uno elige también su **caballo** para la carrera. Si a alguien se le corta la conexión, un bot lleva su personaje y lo recupera al volver dentro de 15 segundos.

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

## Modos de juego

Contra bots: **JUGAR CON BOTS → ELIGE MODO** (cuatro tarjetas animadas) → tutorial rápido de 4 viñetas → mapa → ruleta de bando y caballo → ¡a jugar! Los bots juegan los cuatro modos.

### 1. Pilla Jamón (el clásico)

Los **azules** pillan a jamonazos; los **rojos** huyen y se rescatan entre ellos. Ganan los rojos si queda alguno libre al acabar el tiempo; los azules, si en algún momento no queda ninguno libre. Las reglas completas están más abajo.

### 2. Infección

- Empieza **un infectado al azar** (verde, con ojos que brillan). Si toca a un superviviente, lo convierte, con un estallido de partículas verdes.
- Los infectados son **un 10% más rápidos**, pero no pueden esprintar: los supervivientes se escapan esprintando mientras les dure la energía.
- **Objetos de los supervivientes** (se guardan y se usan con **E**):
  - **Barrera:** tapa un pasillo detrás de ti durante 5 s.
  - **Granada de humo:** frena y ciega a los infectados.
  - **Botas:** más velocidad.
- La **música se acelera** según quedan menos supervivientes.
- Cuando queda uno, sale el aviso **«¡ÚLTIMO SUPERVIVIENTE!»** y los infectados lo ven en el minimapa cada 4 segundos.
- Dura **2:30**. Si aguanta alguien, ganan los supervivientes; si el que aguanta es el último, se lleva el título de **LEYENDA**.
- Se juega **de noche**: oscuridad, farolas y la linterna de cada superviviente.

### 3. Jamón Bomba

- Todos contra todos, cada uno con su ropa. A uno al azar le toca el **jamón bomba**, con una **mecha oculta de 15 a 25 s**.
- **Tocando a alguien se lo pasas.** No se lo puedes devolver al mismo hasta pasados 2 s, y quien lo lleva va un poco más rápido.
- La **mecha suena cada vez más rápido** al final, y la pantalla de quien lo lleva late en rojo.
- Si te explota encima, **quedas fuera**, con confeti y lonchas de jamón volando.
- Se juega **ronda tras ronda hasta que queda uno**. Con más de 10 vivos hay **2 jamones bomba** a la vez.
- Mapas recomendados: las **arenas pequeñas** (La Plaza, La Azotea, El Patio).

### 4. Escondite Jamonero (prop hunt)

- **30 segundos para esconderse:** los buscadores no ven nada y no se pueden mover, y hay una cuenta atrás grande.
- Los escondidos se **transforman en objetos del mapa** con **E**: papelera, farola, maceta, caja, silla, barril, banco o cubo. Si estás junto a un objeto, copias ese mismo (y su giro); si no, cambias al siguiente.
  - **R** gira el objeto.
  - **SHIFT** te ancla: no te mueves nada. Disfrazado y quieto, eres igual que un objeto de verdad, sin nombre, sin vida y sin indicador para el otro equipo.
- Moverse disfrazado hace **temblar el objeto y levanta polvo**.
- Cada **20 s** (cada **10 s** en los últimos 30) todos los escondidos hacen un **ruidito de pista**: un silbido, una risita, un «oink» o un chirrido, con un «?» encima.
- Los buscadores golpean con el jamón:
  - Si es un escondido, le hacen daño y lo **descubren**.
  - Si es un **objeto de verdad**, se hacen daño a sí mismos. Con 0 de vida se quedan mareados un rato.
- Los escondidos eliminados pasan a ser **fantasmas**.
- Dura **3 minutos**. Ganan los escondidos si queda alguno.
- Se juega **de noche**, con linterna para los buscadores.

### Dopamina en todos los modos

- **Monedas:** por pillar, rescatar, esquivar, bloquear, infectar, pasar la bomba (más si quedaba poca mecha), sobrevivir rondas, encontrar escondidos, aguantar pistas, ganar… Si encadenas acciones en menos de 4 s sube el **COMBO** (x2, x3… hasta x5).
- **Ruleta para todos:** **2 tiradas por partida**. Puede salir:
  - **TURBO:** todos más rápidos.
  - **LLUVIA DE MONEDAS:** caen monedas del cielo.
  - **CABEZONES:** cabezas gigantes.
  - **CAMBIAZO:** todos intercambian posiciones.
  - **ESCUDOS GRATIS.**
  - **MONEDAS X2.**
- **Tu ruleta (Q):** una tirada personal por partida, a partir de los 10 s. Puede salir:
  - Botas turbo.
  - Escudo.
  - +50 monedas.
  - Dash infinito.
  - Invisibilidad.
  - O el **¡JACKPOT!** (+200).
- **Carrera de caballos:** antes de cada partida apuestas por un caballo: PATA NEGRA, BELLOTA EXPRESS, LONCHA LOCA o SERRANITO. A mitad de partida se corre la carrera en pantalla y **gana uno al azar**. Si acertaste, +100 monedas y la medalla SUERTUDO.
- **Medallas:** MVP, INTOCABLE, SALVAVIDAS, CARNICERO, ESCURRIDIZO, LEYENDA, PACIENTE CERO, PATATA CALIENTE, ÚLTIMO EN PIE, CAMALEÓN, OJO DE HALCÓN, FRANCOTIRADOR, JACKPOT, SUERTUDO… Cada una da monedas extra.
- **Al acabar:**
  - Tus monedas suben rodando.
  - Ves tus medallas.
  - La barra de experiencia se llena; si **subes de nivel**, hay fuegos artificiales.
  - Ves si batiste tu **récord** del modo y el **ranking de la partida** por monedas.
- **RÉCORDS** (en el menú):
  - Tus estadísticas por modo (partidas, victorias, récord y monedas). Se guardan en el navegador; las monedas son del juego y no se compran con dinero real.
  - El **ranking mundial** con las mejores partidas online de cada modo.

---

## Cómo se juega (Pilla Jamón)

1. **Elige mapa** (contra bots) o entra en una **sala online**.
2. **La ruleta muestra tu bando** (al azar).
   - **Equipo ROJO (escapistas):** chándal oscuro con monograma de doble G y raya verde-roja-verde (parodia «GUCHI», no es el logo real), gorra roja, cadena dorada gorda, pendiente, riñonera y zapatillas blancas. Sobrevive hasta que acabe el tiempo y rescata a tus compañeros enjamonados: tu equipo gana si queda al menos uno libre.
   - **Equipo AZUL (perseguidores):** pata de jamón y brazalete azul. El atuendo depende de la ciudad: **policías** en París, **militares** en Ceuta, **gente normal de la calle** en Barcelona y uniforme azul en el resto. Pilla a todos los rojos antes de que acabe el tiempo. (En el Escondite, los buscadores van igual.)
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
| Habilidad: lanzar jamón / humo / usar objeto / disfrazarse | E | X |
| Girar el disfraz (Escondite) | R | Y |
| Tirada personal de la ruleta | Q | LT |
| Rueda de frases | T | Select |
| Pantalla completa | F | — |
| Pausa | Esc | Start |

Las teclas se pueden reasignar en **Controles**. Las flechas siempre sirven para moverse. Los menús se manejan con teclado, ratón o mando. Online, la pausa es solo un menú: la partida sigue.

### Frases y voces

Los personajes sueltan frases en bocadillos según lo que pasa: «¡Alto ahí, figura!», «¡Ven aquí, que te loncheo!», «¡Ese chándal es de mercadillo!», «¡Vigilad al enjamonado!», «¡Ni me tocas, pringao!», «¡Mi gorra no, que es original!», «¡Rescatadme, porfa!», «¡Gracias, crack!»… Con **T** abres la rueda de frases rápidas (eliges con 1–8 o con el ratón). Se oyen con la voz sintetizada del navegador, con un tono distinto para cada equipo; se pueden quitar en **Opciones → Voces**. Online, todos ven y oyen las frases de todos.

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

### Rescates (como en «polis y cacos»)

Cuando a un rojo le quitan toda la vida no queda fuera de golpe: lo **enjamonan** (se queda en una jaula de jamón) durante 12 segundos. Si un compañero se queda **a su lado 1,6 s**, lo libera con media vida. Si nadie llega a tiempo, queda fuera y pasa a ser fantasma. Los azules ganan si en algún momento no queda **ningún rojo libre**, así que les toca vigilar a los atrapados. Los azules que pillan a varios seguidos se llevan un «¡DOBLE PILLADA!».

El **jamón de oro** (un objeto que aparece de vez en cuando) libera de golpe a todos los rojos atrapados.

### Mapas

Clásicos:
- **Bosque:** arbustos que te esconden y un río con varios puentes.
- **Desierto:** ruinas con pasillos estrechos y arenas movedizas que frenan mucho.
- **Nieve:** un lago de hielo donde resbalas, nieve profunda, cabañas y montones de nieve.

Ciudades:
- **París:** la Torre Eiffel en el Campo de Marte, el Sena con tres puentes, la pirámide del Louvre, tejados de zinc, terrazas de café y **bocas de metro** (Guimard): si entras en una, apareces en la siguiente estación.
- **Barcelona:** la Sagrada Família (con su grúa), manzanas del Eixample con chaflán, suelo de panot, bancos de trencadís, palmeras, la playa de la Barceloneta y **carriles bici** que te aceleran.
- **Ceuta:** las Murallas Reales con el foso de San Felipe y sus puentes, el Hércules entre las columnas, casas blancas, el monte Hacho y la playa. Cada cierto tiempo sopla el **levante** y empuja a todos hacia el oeste.

Arenas pequeñas (para Jamón Bomba):
- **La Plaza:** fuente central y carriles bici.
- **La Azotea:** tejados de París con chimeneas.
- **El Patio:** patio andaluz con fuente y macetas.

Con más personajes, el mapa crece repitiéndose en espejo: 48×30 tiles hasta 9 personajes y 94×30 hasta 20 (las arenas, 32×20 o 62×20).

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
| `RESCUE` | segundos atrapado, tiempo y distancia para rescatar, vida al volver |
| `CITY` | enfriamiento del metro, velocidad del carril bici, fuerza y frecuencia del levante, ventana de rachas |
| `PHRASES` / `VOICE` | frases de los bocadillos y de la rueda (también una rueda por modo), probabilidades, tono y velocidad de la voz por equipo |
| `MODES` | valores de cada modo: duración, velocidad de los infectados, barreras, mecha del jamón bomba, fase de esconderse, pistas, daño, objetos del mapa… |
| `HYPE` | monedas de cada acción, combos, cuándo gira la ruleta, efectos y premios, carrera de caballos, medallas |

### Pruebas útiles

- `http://localhost:5173/?autotest&speed=8`: tu personaje lo controla la IA y la partida va 8 veces más rápida; en la consola aparece quién gana cada partida (útil para ajustar el balance).
- `?lag=120`: simula 120 ms de ping para comprobar la predicción y la interpolación online.
- `npm run check:maps`: comprueba que todos los mapas (también los escalados) están conectados.
- `npx esbuild scripts/sim-test.ts --bundle --platform=node --outfile=/tmp/simtest.cjs && node /tmp/simtest.cjs 6 20`: juega 6 partidas de bots de cada modo con 20 personajes, sin pantalla, y muestra los ganadores, la duración, las monedas y cuánto tarda cada paso de la simulación.

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
  props.ts                objetos del Escondite (con semilla: iguales en servidor y clientes)
  modes/                  un módulo por modo con la misma interfaz (preparar, reglas, tick,
                          victoria, datos del HUD): pilla, infeccion, bomba, escondite
  sim/                    simulación de la partida: personajes, IA de los 4 modos, objetos,
                          Hype.ts (monedas, combos, medallas, ruletas y carrera)
server/src/               Cloudflare Worker: sala (Durable Object, 20 Hz) y partida rápida
src/                      cliente Phaser
  game/                   modelo offline y vistas (personajes, objetos, jamones)
  net/                    conexión, reconexión y modelo online (predicción + interpolación)
  gfx/                    pixel art generado por código
  core/                   audio, voces y entrada (teclado + mando)
  ui/hype.ts              HUD de dopamina: monedas, combos, ruletas, carrera, medallas
  scenes/                 Title, Menu, ModeSelect, Tutorial, Online, Lobby, Character,
                          MapSelect, RoleReveal, Game, UI, Pause, Options, Controls,
                          Credits, Results, Records, Bye
electron/                 envoltorio de escritorio opcional
wrangler.toml             configuración del Worker
.github/workflows/        despliegue automático
```

### Cómo funciona el online

- **Servidor autoritativo:** cada sala es un Durable Object que ejecuta la misma simulación que el modo offline, a 20 ticks por segundo, y envía a cada jugador un snapshot compacto (unos 8 KB/s con 20 personajes). El servidor decide las transformaciones, los contagios, las mechas, las ruletas y la carrera; los clientes solo lo dibujan.
- **El cliente solo envía entradas:** dirección, sprint y contadores de pulsaciones, como mucho 15 veces por segundo y solo cuando cambian.
- **Predicción:** tu personaje se mueve al instante con la misma simulación. Cuando llega el snapshot, se compara con dónde estabas cuando el servidor lo calculó y se corrige suavemente; con 150 ms de ping la corrección media es de unas décimas de píxel.
- **Interpolación:** los demás se dibujan unos 100 ms en el pasado, entre dos snapshots, y los efectos se reproducen a la vez que se ven.
- **Reconexión:** si en 4 s no llega nada, la conexión se da por perdida y se reintenta. El servidor guarda tu sitio 15 s y mientras tanto un bot lleva tu personaje.
