# JAMONGUS

Pilla-pilla por equipos en vista cenital, en pixel art, con **4 modos de juego**: Pilla Jamón, Infección, Jamón Bomba y Escondite Jamonero. Se juega solo contra bots o **online con hasta 20 personas**, y todo va cargado de dopamina:

- **Lonchas** (la moneda del juego), misiones diarias y nivel.
- Una **tienda** de cosméticos.
- Monedas con combos, medallas y dos tiradas de la ruleta por partida, más tu propia tirada.
- Los **Parones Dopamina**: 2 o 3 veces por partida todo se congela y toca uno de **8 minijuegos** (a veces dos seguidos: ¡Parón Doble!).
- Dos **eventos** aparte: la **Ruleta** (rojo, negro o verde, con tus lonchas) y la **Carrera de caballos**.
- Se juega en **ordenador, móvil y tablet**: controles táctiles con joystick, y se puede instalar como app (PWA).

Todo se genera por código: sprites, tiles, fuente, partículas, efectos de sonido, música (Web Audio en estilo 8-bit) y voces (Web Speech). No hay ni un solo asset externo.

**Jugar online:** https://jamongus.jamon-run.workers.dev (la dirección antigua, `jamon-run.jamon-run.workers.dev`, redirige aquí y conserva tus lonchas).

**Tecnología:** Phaser 3.90 + TypeScript + Vite en el cliente; Cloudflare Workers + Durable Objects (plan gratuito) en el servidor. Opcionalmente, Electron para usarlo como app de escritorio.

---

## Invitar a tus amigos

1. Entra en el juego y elige **JUGAR ONLINE → CREAR SALA PRIVADA**.
2. En la sala pulsa **COPIAR ENLACE** y pásaselo (es la dirección del juego con `?sala=CÓDIGO`). También pueden entrar con **UNIRSE CON CÓDIGO** escribiendo las 5 letras que ves arriba.
3. Cada uno pulsa **¡ESTOY LISTO!**. Cuando estén todos, el anfitrión (★) pulsa **EMPEZAR PARTIDA**.

El anfitrión elige el **modo** (o deja **VOTACIÓN**: cada uno vota con **TU VOTO** y gana el más votado; si hay empate, al azar), el mapa, cuántos **cazadores** hay al empezar (automático o de 1 a 5), la duración, la dificultad de los bots, si la sala sale en la partida rápida y hasta cuántos personajes se rellena con bots (no, 8, 12, 16 o 20). El anfitrión también puede activar o quitar el **Parón** (minijuego a mitad de partida). En la sala, mientras esperáis, el botón **MINIJUEGO** te deja jugar uno contra bots (si empieza la partida, te lleva a ella). Si a alguien se le corta la conexión, un bot lleva su personaje y lo recupera al volver dentro de 15 segundos.

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

Al terminar, wrangler muestra la URL pública (`https://jamongus.<tu-subdominio>.workers.dev`).

**Despliegue automático:** `.github/workflows/deploy.yml` compila y despliega en cada push a `main`. Necesita dos secretos en el repositorio:

```bash
gh secret set CLOUDFLARE_API_TOKEN     # token creado con la plantilla "Edit Cloudflare Workers"
gh secret set CLOUDFLARE_ACCOUNT_ID    # aparece en `npx wrangler whoami`
```

Sin esos secretos, el workflow compila igualmente y avisa de que no despliega.

Cuánto da de sí el plan gratuito, con la prueba de carga de 50 jugadores: ver **Servidor, rendimiento y plan gratuito** más abajo.

**Cambio de nombre (JAMON RUN → JAMONGUS):** el Worker nuevo se llama `jamongus`. El antiguo (`jamon-run`) se despliega con `npx wrangler deploy --env legacy` y solo redirige (301) a la dirección nueva; los perfiles con lonchas se traspasan solos la primera vez que entras en la nueva.

### App de escritorio (opcional, Electron)

```bash
npm run desktop       # compila y abre el juego en una ventana nativa
npm run package       # crea la app en release/ (p. ej. "JAMONGUS.app" en macOS)
npm run desktop:test  # prueba automática: abre el juego oculto y comprueba que no hay errores (macOS/Linux)
```

Electron no está entre las dependencias del proyecto: estos comandos lo bajan con `npx` la primera vez (unos 100 MB). El modo online en la app de escritorio necesita la versión desplegada.

---

## Lonchas, nivel, misiones y tienda

- **Lonchas** 🥓: la moneda del juego. Es **solo virtual**: no se compra con dinero real, no se cambia por nada fuera del juego y no hay cajas de botín de pago. Se ganan:
  - por jugar y por ganar;
  - por las monedas que consigues en la partida (golpes, rescates, sobrevivir, combos…);
  - por los minijuegos y por las misiones.
- **Saldo** arriba a la derecha, con contador animado al ganar o gastar.
- **Regalo diario:** en **MISIONES**. Da más si vienes días seguidos (hasta 7).
- **Misiones diarias:** 3 cada día, por ejemplo «Gana 2 minijuegos», «Pasa el jamón bomba 5 veces» o «Sobrevive 60 s». Tienen barra de progreso; cuando se completan, sale un aviso y se recogen con animación.
- **Nivel y XP:** al subir de nivel hay confeti y sonido, y te llevas un **cosmético gratis**.
- **Tienda:** con lonchas compras cosméticos que también ven los demás online:
  - gorros;
  - rastros de partículas al correr;
  - efectos de golpe;
  - marcos de nombre;
  - emotes (tecla G);
  - bailes de victoria (en el podio y como MVP).
- El saldo **nunca baja de 0**. Si te quedas a 0, recibes **lonchas de rescate** (una vez al día).
- **Todo se guarda en el servidor:** un Durable Object por jugador. El navegador solo pide cosas («compra esto», «recoge el regalo») y el servidor decide.
  - **Online**, el servidor de la sala calcula lo que ganas: no se puede trucar desde el navegador.
  - **Offline** (bots y Sala de minijuegos) el resultado lo calcula tu navegador, así que tiene **topes**: por partida, por día y con un tiempo mínimo entre partidas.

## Parones Dopamina y eventos

- **Cuántos:** 2 o 3 por partida según la duración (uno cada 45-60 s más o menos). El anfitrión elige **POCOS / NORMAL / MUCHOS** (o ninguno) en la sala; contra bots, en **Opciones → Parones**.
- **Sin repetir:** los minijuegos salen de una **bolsa barajada**: en una partida no se repite ninguno y la bolsa se acuerda de los últimos de partidas anteriores, para que salgan todos.
- **Parón Doble:** a veces tocan dos minijuegos seguidos, con transiciones rápidas.
- **La partida se congela para todos a la vez:** nadie se mueve ni recibe golpes; se paran el reloj, las mechas, las ruletas y los objetos. Online lo decide el servidor, así que todos entran y salen a la vez.
- **Fases de un Parón:** «¡PARÓN!» gigante → tragaperras que elige el minijuego → **2 s** de recordatorio con el dibujo y los controles → minijuego (10-20 s) → podio → cuenta atrás **3-2-1**.
- **Recompensas:** el podio cobra lonchas y XP; **el ganador elige una ventaja** (+10% de velocidad, escudo de un golpe o recarga un 20% más rápida); las **rachas** suben el multiplicador (x1.2, x1.5, x2).
- **Reacciones:** 🔥😂😱👏🍖 con las teclas **1-5** o con los botones del borde derecho en el móvil.
- **Sala de minijuegos:** todos se pueden jugar sueltos desde **MINIJUEGOS**.

### Evento Ruleta (una vez por partida como mucho)

- Todo se congela. Solo hay **tres botones enormes**: **ROJO 1:1**, **NEGRO 1:1** y **VERDE (0 / 00) 17:1**. Se eligen con el ratón, el dedo, las teclas **1-3** o el mando.
- Cantidad con **10 / 50 / 100 / TODO** y **− / +**, en grande. Una sola apuesta por ronda: el botón elegido se queda marcado y enseña lo que puedes ganar.
- **10 s** con barra de tiempo; si no eliges nada, no apuestas.
- La rueda, la bola y el croupier, en una mesa limpia. **El número lo saca el servidor** (`crypto.getRandomValues`) y el saldo lo cambia el servidor: desde el navegador no se puede trucar.
- Resultado 3 s y vuelta automática con 3-2-1.

### Evento Carrera de caballos

- Al salir, **eliges tu caballo ganador** (8 s). Cuotas de 2x a 12x.
- Durante la carrera, machacando ESPACIO (o tocando la pantalla) **animas a tu caballo**. Si gana, cobras lonchas según la cuota.

### Los 8 minijuegos

Todos se juegan con ← →, ESPACIO y E, o tocando la pantalla.

1. **Corta el Jamón:** pulsa cuando el cuchillo pase por la marca. 5 cortes, cada vez más rápidos.
2. **Torre de Lonchas:** suelta la loncha; lo que sobresale se cae. Gana la torre más alta.
3. **Tira y Afloja:** azules contra rojos, pulsando **al ritmo** del indicador.
4. **Trilero del Jamón:** sigue el cubilete de la loncha dorada (3, 4 y 5 cubiletes, mezcla justa).
5. **Reflejos Ibéricos:** cuando sale el jamón, ¡pulsa! Si te adelantas, fuera.
6. **Ritmo Jamonero:** flechas al ritmo de una canción chiptune.
7. **Atrapa Lonchas:** mueve la cesta y atrapa lonchas; las doradas valen más y las bombas restan.
8. **Cuenta Jamones:** se ven un momento muchos jamones y lonchas; ¿cuántos jamones había?

Cada minijuego es un módulo de `shared/minigames/` con la misma interfaz (`input`, `tick`, `state`, `results`, `bot`), así que añadir otro es fácil. Lo ejecutan igual el servidor (online) y el navegador (offline).

## Modos de juego

Contra bots: **JUGAR → ELIGE MODO** (cuatro tarjetas animadas) → tutorial rápido de 4 viñetas → mapa → ruleta de bando con **2 s de recordatorio** (objetivo y controles) → ¡a jugar! Los bots juegan los cuatro modos.

La **primera vez** que pulsas JUGAR sale un **tutorial jugable de 30 s** (moverse, golpear y sprint) adaptado a teclado, mando o pantalla táctil; se puede saltar y repetir desde **CÓMO JUGAR**, que además resume cada modo en una tarjeta con dibujo, 3 frases y tus controles.

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
- Los escondidos se **transforman en objetos del mapa** con **E**: papelera, farola, maceta, caja, silla, barril, banco o cubo (y en **La Casa**, en sofá, lámpara, nevera, lavadora, cama, armario, tele, bici, macetas y cajas). Si estás junto a un objeto, copias ese mismo (y su giro); si no, cambias al siguiente.
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
- **Medallas:** MVP, INTOCABLE, SALVAVIDAS, CARNICERO, ESCURRIDIZO, LEYENDA, PACIENTE CERO, PATATA CALIENTE, ÚLTIMO EN PIE, CAMALEÓN, OJO DE HALCÓN, FRANCOTIRADOR, JACKPOT… Cada una da monedas extra.
- **Al acabar:**
  - Tus monedas suben rodando.
  - Ves tus medallas.
  - Las lonchas ganadas suben rodando y la barra de experiencia se llena; si **subes de nivel**, hay fuegos artificiales y un cosmético gratis.
  - Antes, el **MVP** de la partida sale en una pantalla especial con su baile de victoria.
  - Ves si batiste tu **récord** del modo y el **ranking de la partida** por monedas.
- **RÉCORDS** (en el menú):
  - Tus estadísticas por modo (partidas, victorias, récord y monedas), guardadas en tu perfil del servidor.
  - El **ranking mundial** con las mejores partidas online de cada modo.

---

## Cómo se juega (Pilla Jamón)

1. **Elige mapa** (contra bots) o entra en una **sala online**.
2. **La ruleta muestra tu bando** (al azar).
   - **Equipo ROJO (escapistas):** chándal oscuro con monograma de doble G y raya verde-roja-verde (parodia «GUCHI», no es el logo real), gorra roja, cadena dorada gorda, pendiente, riñonera y zapatillas blancas. Sobrevive hasta que acabe el tiempo y rescata a tus compañeros enjamonados: tu equipo gana si queda al menos uno libre.
   - **Equipo AZUL (perseguidores):** pata de jamón y brazalete azul. El atuendo depende de la ciudad: **policías** en París, **seguridad del casino** en Las Vegas, **gente normal de la calle** en Barcelona y uniforme azul en el resto. Pilla a todos los rojos antes de que acabe el tiempo. (En el Escondite, los buscadores van igual.)
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
| Emote (el que tengas puesto) | G | — |
| Reacciones en el Parón 🔥😂😱👏🍖 | 1 a 5 | — |
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
- **Las Vegas:** de noche, en morados, rosas y dorados. Avenida con luces de neón que parpadean, casinos inventados (JAMÓN PALACE, PATA NEGRA, LUCKY CERDO…), tragaperras y coches como obstáculos, una fuente grande en el centro, un **parking de dos plantas** unidas por ascensores y callejones traseros. Tiene su propia música. Cada ~15 s una tragaperras da el **premio gordo** y suelta monedas.

Solo para el Escondite:
- **La Casa:** una casa por dentro vista desde arriba: entrada, salón, cocina, comedor, baño, 3 dormitorios, pasillo, escalera, garaje, sótano, desván y lavadero. Las **puertas se abren solas** al acercarte (cerradas tapan la vista). Cada habitación tiene su **interruptor de la luz**: algunas empiezan a oscuras y los buscadores las encienden (o apagan) al pisarlo. Muebles por todas partes para transformarse.

Arenas pequeñas (para Jamón Bomba):
- **La Plaza:** fuente central y carriles bici.
- **La Azotea:** tejados de París con chimeneas.
- **El Patio:** patio andaluz con fuente y macetas.

Con más personajes, el mapa crece repitiéndose en espejo: 48×30 tiles hasta 9 personajes y 94×30 hasta 20 (las arenas, 32×20 o 62×20).

---

## En el móvil y la tablet

- **Controles táctiles** (solo en pantallas táctiles): joystick que aparece donde pones el dedo, a la izquierda, y botones grandes y semitransparentes a la derecha: acción, sprint (mantener), habilidad, girar (Escondite), frases, ruleta y pausa. Los nombres cambian según lo que hace cada botón en ese momento.
- **Siempre en horizontal:** en vertical sale «GIRA EL MÓVIL». Al pulsar JUGAR se pone en pantalla completa (en iPhone, Safari no lo permite y se juega igual).
- Respeta el notch y las esquinas redondeadas (*safe areas*). La interfaz se adapta de 360 px a 4K.
- Menús, tienda, sala y minijuegos se usan con el dedo, con zonas de toque más grandes que el dibujo. Para escribir el nombre o el código de sala se abre el teclado del móvil.
- **Vibración** al golpear y al pulsar botones (Android).
- **Calidad automática:** si el móvil no llega a ~42 FPS, menos partículas y sin efectos de ambiente. También se puede fijar en **Opciones → Calidad**.
- **Instalable** como app (PWA): «Añadir a pantalla de inicio».

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
| `HYPE` | monedas de cada acción, combos, cuándo gira la ruleta, efectos y premios, medallas |
| `PARON` | cuándo salta el Parón (entre el 30% y el 70%), duración de cada fase, ventajas del ganador |
| `MG` | pagos de la ruleta, cuotas y apuesta de los caballos, duraciones y dificultad de cada minijuego |
| `ECONOMY` (`shared/economy.ts`) | lonchas por partida y por minijuego, regalo diario, misiones, rachas, topes offline, XP, catálogo y precios de la tienda |

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
  economy.ts              lonchas, nivel, misiones, tienda y cosméticos (lo aplica el servidor)
  minigames/              Parón Dopamina y los 8 minijuegos (misma interfaz, con bots)
  sim/                    simulación de la partida: personajes, IA de los 4 modos, objetos,
                          Hype.ts (monedas, combos, medallas, ruletas y carrera)
server/src/               Cloudflare Worker: sala (Durable Object, 20 Hz), partida rápida,
                          perfil de cada jugador (Durable Object Profile) y /api/me
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

- **Servidor autoritativo:** cada sala es un Durable Object que ejecuta la misma simulación que el modo offline, a 20 ticks por segundo, y envía a cada jugador un snapshot compacto (unos 18 KB/s por jugador con 17 personajes). El servidor decide las transformaciones, los contagios, las mechas, las ruletas y la carrera; los clientes solo lo dibujan.
- **El cliente solo envía entradas:** un mensaje **binario de 8 bytes** (dirección, sprint y contadores de pulsaciones), **solo cuando cambia algo** y **como mucho 10 veces por segundo**. El joystick y el stick se redondean a 16 direcciones para no mandar un mensaje por cada milímetro.
- **Hibernación:** las salas usan la API de hibernación de WebSockets de Cloudflare. En el lobby, sin partida, la sala se puede dormir sin cortar las conexiones, y los pings de mantenimiento (`ping` → `pong`) los contesta Cloudflare sin despertarla (`setWebSocketAutoResponse`). El bucle de 20 ticks solo corre durante la partida y se para si la sala se queda vacía; una sala vacía borra lo que tenía guardado.
- **Límites por jugador:** como mucho 30 mensajes por segundo (14 de entrada, 4 de ajustes, 2 de cambios de aspecto…), mensajes de más de 4 KB ignorados y expulsión si alguien inunda la sala. Todo se valida en el servidor.
- **Predicción:** tu personaje se mueve al instante con la misma simulación. Cuando llega el snapshot, se compara con dónde estabas cuando el servidor lo calculó y se corrige suavemente; con 150 ms de ping la corrección media es de unas décimas de píxel.
- **Interpolación:** los demás se dibujan unos 100 ms en el pasado, entre dos snapshots, y los efectos se reproducen a la vez que se ven.
- **Reconexión:** si en 5 s no llega nada, la conexión se da por perdida y se reintenta. El servidor guarda tu sitio 15 s y mientras tanto un bot lleva tu personaje.

## Servidor, rendimiento y plan gratuito

### Prueba de carga (50 jugadores)

`npm run loadtest` lanza clientes falsos (Node + `ws`) que se conectan como el juego: se unen a una sala, se ponen listos, juegan partidas de Pilla de 5 min con Parones, mandan entradas binarias solo cuando cambian (cambian de dirección cada 0,3-1,5 s y golpean de vez en cuando) y hacen ping cada 2 s.

```bash
npm run loadtest                                   # 50 clientes, 3 salas, 5 min contra wrangler dev
npm run loadtest -- --url https://jamongus.jamon-run.workers.dev --minutes 2
npm run bench:tick -- 17                           # coste de un tick del servidor (en Node)
```

Resultado con **50 clientes en 3 salas (17-17-16) durante 5 minutos**, en producción (`jamongus.jamon-run.workers.dev`, desde España) y en local (`wrangler dev`):

| Medida | Producción | Local |
|---|---|---|
| Partidas jugadas a la vez | 3 de 3 | 3 de 3 |
| Desconexiones y errores | **0** | **0** |
| Ritmo de los ticks del servidor (hora del servidor en cada snapshot) | p50 **50 ms**, p95 50 ms, máx. 50 ms | p50 50 ms, p95 52 ms, máx. 86 ms |
| Ticks perdidos | 13 de ~18 000 (0,07%) | 10 de ~18 000 |
| Llegada de snapshots al cliente | p50 50 ms, máx. 522 ms (p95 201 ms: en los Parones se manda 1 de cada 4, a propósito) | p50 50 ms |
| Mensajes que reciben los clientes | ~930/s en total (~19 por jugador y segundo) | ~980/s |
| Datos que reciben | ~970 KB/s en total (~19 KB/s por jugador) | ~1 MB/s |
| Entradas que envía cada jugador | **~2 por segundo** (como mucho 10) | ~2 por segundo |
| Ping | p50 36 ms, p95 113 ms | p50 3 ms |
| Coste de un tick (3 pasos + snapshot JSON, medido en Node) | — | 17 jugadores: p50 0,17 ms, p95 1,0 ms (de 50 ms disponibles) |

Dentro de Cloudflare el reloj no avanza mientras se ejecuta el código, así que el coste del tick se mide en Node con la misma simulación (`npm run bench:tick`); desde fuera se mide el ritmo real al que llegan los ticks.

### Cuánto da el plan gratuito (Workers Free)

Límites diarios que cuentan aquí:
- **100 000 peticiones** a Durable Objects. Cada mensaje **entrante** por WebSocket cuenta como 1/20 de petición; los salientes (snapshots) no cuentan.
- **13 000 GB·s** de tiempo de Durable Objects (cada sala despierta cuenta como 128 MB). Las salas hibernadas no cuentan, ni tampoco las respuestas automáticas a los pings.

Con **50 jugadores a la vez en 3 salas**:
- **Mensajes entrantes** por jugador: ~2 entradas/s (medido) + 0,5 pings/s + algo de lobby y minijuegos ≈ **2,5/s**. Son 125 mensajes/s = 6,25 peticiones/s, así que 100 000 peticiones dan para **~16 000 s ≈ 260 minutos al día (unas 4 horas)**.
- **Tiempo de las 3 salas despiertas:** 3 × 0,125 GB = 0,375 GB, así que 13 000 GB·s dan para ~34 700 s ≈ 580 minutos. No es lo que limita.
- **Peor caso** (todos moviendo el stick sin parar, 10 entradas/s): unos **60 minutos al día**.

Con 20 jugadores en una sola sala da para unas 11 horas al día. Las páginas y los archivos del juego no gastan peticiones de Durable Objects. Si se pasa de algún límite, Cloudflare corta hasta las 00:00 UTC (no cobra nada).

