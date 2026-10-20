/**
 * BALANCE DEL JUEGO
 * Todos los números que afectan a la jugabilidad están aquí.
 * Unidades: píxeles del mundo (1 tile = 16 px), segundos, puntos de vida.
 */

export const TILE = 16;

/** Resolución lógica del juego (se escala con zoom entero). */
export const VIEW_W = 480;
export const VIEW_H = 270;

export const BALANCE = {
  match: {
    /** Duración por defecto (segundos). Se puede cambiar en Opciones. */
    defaultDuration: 120,
    durationOptions: [60, 90, 120, 180, 300],
    defaultChasers: 3,
    defaultEscapists: 5,
    minChasers: 1,
    maxChasers: 5,
    minEscapists: 1,
    maxEscapists: 8,
    /** Cuenta atrás antes de empezar. */
    countdown: 3,
    /** Segundos extra que los perseguidores esperan tras el "¡YA!". */
    chaserReleaseDelay: 2,
  },

  /** Radio de colisión de los personajes. */
  bodyRadius: 5,

  escapist: {
    maxHp: 100,
    speed: 76,
    accel: 900,
    sprintMultiplier: 1.55,
    energyMax: 100,
    /** Energía gastada por segundo de sprint. */
    sprintDrain: 38,
    /** Energía recuperada por segundo sin sprint. */
    energyRegen: 20,
    /** Tras vaciar la barra, hay que esperar este tiempo antes de recargar. */
    exhaustedDelay: 1.0,
    dashSpeed: 300,
    dashDuration: 0.14,
    dashCooldown: 2.2,
    /** Invulnerable durante el dash. */
    dashIFrames: true,
    /** Habilidad especial (E): bomba de humo. */
    smokeCooldown: 14,
    smokeDuration: 3.5,
    smokeRadius: 26,
    /** Multiplicador de velocidad para perseguidores dentro del humo. */
    smokeSlow: 0.55,
  },

  chaser: {
    speed: 63,
    /** Velocidad máxima tras correr en línea recta un rato. */
    straightBonusMax: 0.34,
    /** Segundos de carrera recta para alcanzar el bonus máximo. */
    straightBonusTime: 1.1,
    /** Diferencia de ángulo (rad) que rompe la "línea recta". */
    straightAngleTolerance: 0.35,
    /** Fracción del impulso en línea recta que se conserva al girar. */
    turnKeep: 0.1,
    accel: 760,
    sprintMultiplier: 1.15,
    energyMax: 100,
    sprintDrain: 50,
    energyRegen: 14,
    exhaustedDelay: 1.2,

    /** Golpe de jamón cuerpo a cuerpo. */
    attackDamage: 25,
    attackCooldown: 0.8,
    attackRange: 19,
    /** Medio ángulo del arco del golpe (radianes). ~65º */
    attackArc: 1.13,
    /** Retraso entre pulsar y el impacto (la anticipación del swing). */
    attackWindup: 0.08,
    attackKnockback: 210,
    /** Ralentización mientras golpea. */
    attackMoveSlow: 0.45,

    /** Lanzamiento de jamón (E). */
    throwDamage: 25,
    throwCooldown: 6,
    throwSpeed: 230,
    throwRange: 170,
    throwKnockback: 160,
  },

  /** Tras recibir un golpe, el escapista es invulnerable este tiempo. */
  hitInvulnerability: 0.8,
  /** Pequeño parón (hit-stop) al golpear, en segundos. */
  hitStop: 0.055,
  /** Tiempo aturdido tras el knockback. */
  hitStun: 0.15,
  knockbackFriction: 9,

  terrain: {
    /** Arenas movedizas: multiplicador de velocidad. */
    quicksandSlow: 0.45,
    /** Hielo: control reducido (0 = nada de control, 1 = normal). */
    iceControl: 0.18,
    /** Fricción del hielo (cuanto más bajo, más resbala). */
    iceFriction: 0.6,
    /** Nieve profunda. */
    deepSnowSlow: 0.75,
    /** Distancia a la que un perseguidor ve a alguien escondido en un arbusto. */
    bushRevealDistance: 26,
  },

  items: {
    spawnInterval: 9,
    firstSpawn: 4,
    maxOnMap: 3,
    medkitHeal: 25,
    bootDuration: 5,
    bootMultiplier: 1.4,
    /** Probabilidades relativas de cada objeto. */
    weights: { medkit: 4, boot: 3, shield: 3, gold: 1 },
    /** Tiempo que dura un objeto en el suelo antes de desaparecer. */
    lifetime: 25,
  },

  /** Parámetros de IA por dificultad. */
  ai: {
    easy: {
      reaction: 0.55,
      repath: 0.7,
      speedMul: 0.86,
      aimError: 0.45,
      throwChance: 0.25,
      dangerRadius: 85,
      dashChance: 0.25,
      attackDelay: 0.25,
      lead: 0,
    },
    normal: {
      reaction: 0.3,
      repath: 0.45,
      speedMul: 0.95,
      aimError: 0.2,
      throwChance: 0.55,
      dangerRadius: 118,
      dashChance: 0.6,
      attackDelay: 0.1,
      lead: 0.5,
    },
    hard: {
      reaction: 0.14,
      repath: 0.25,
      speedMul: 1.0,
      aimError: 0.06,
      throwChance: 0.9,
      dangerRadius: 150,
      dashChance: 0.9,
      attackDelay: 0.03,
      lead: 1,
    },
  },
} as const;

export type Difficulty = keyof typeof BALANCE.ai;
export type AIParams = (typeof BALANCE.ai)[Difficulty];

/** Multijugador online. */
export const NET = {
  /** Ticks por segundo del servidor (simulación autoritativa). */
  tickRate: 20,
  /** Máximo de mensajes de entrada por segundo que envía cada cliente. */
  inputRate: 15,
  maxPlayers: 20,
  roomCodeLength: 5,
  /** Segundos que se guarda el sitio a un jugador desconectado. */
  reconnectSeconds: 15,
  /** Retraso de interpolación de los demás jugadores (ms, unos 2 snapshots). */
  interpolationDelayMs: 100,
  /** Proporción de equipos: 1 perseguidor por cada N escapistas. */
  escapistsPerChaser: 3,
  /** Opciones de relleno con bots que puede elegir el anfitrión (0 = sin bots). */
  botFillOptions: [0, 8, 12, 16, 20],
  /** Duraciones que puede elegir el anfitrión (s). */
  durationOptions: [60, 90, 120, 180, 300],
} as const;

/**
 * Los mapas crecen con el número de jugadores: se repiten en espejo.
 * sx/sy = copias en horizontal/vertical.
 */
export const MAP_SCALE: { maxPlayers: number; sx: number; sy: number }[] = [
  { maxPlayers: 9, sx: 1, sy: 1 },
  { maxPlayers: 15, sx: 2, sy: 1 },
  { maxPlayers: 20, sx: 2, sy: 2 },
];

/** Frases de los bocadillos (y de la voz). Se envían por la red por su índice. */
export const PHRASES = {
  list: [
    '¡Alto ahí, figura!', // 0  azul
    '¡Ven aquí, que te loncheo!', // 1  azul
    '¡Jamonazo de bellota!', // 2  azul
    '¡Pillado y loncheado!', // 3  azul
    '¡Socorro, que me lonchean!', // 4  rojo
    '¡Ni me tocas, pringao!', // 5  rojo
    '¡Mi gorra no, que es original!', // 6  rojo
    '¡Hola, hola!', // 7
    '¡Por aquí, primo!', // 8
    '¡Cuidado!', // 9
    '¡Gracias, crack!', // 10
    '¡Jajajaja!', // 11
    '¡Vamos, vamos!', // 12
    '¡Buena partida!', // 13
    '¡Ese chándal es de mercadillo!', // 14 azul
    '¡No corras, que es peor!', // 15 azul
    '¡Rodeadlo!', // 16 azul
    '¡Vigilad al enjamonado!', // 17 azul
    '¡Rescatadme, porfa!', // 18 rojo
    '¡Voy a por ti, aguanta!', // 19 rojo
    '¡Libre otra vez!', // 20 rojo
    '¡Que no me pillas, que no!', // 21 rojo
    '¡Jamón de oro, chavales!', // 22 rojo
  ],
  /** Rueda de frases rápidas (tecla T): 8 por equipo. */
  wheel: {
    chaser: [0, 1, 2, 14, 15, 16, 17, 13],
    escapist: [5, 6, 18, 19, 21, 8, 10, 11],
  },
  /** Segundos mínimos entre dos frases del mismo personaje. */
  cooldown: 3,
  /** Probabilidad de decir algo en cada situación. */
  chance: { hit: 0.5, ko: 0.9, dodge: 0.7, release: 0.5, chase: 0.05, rescue: 0.9 },
  bubbleSeconds: 2.2,
} as const;

/** Voz sintetizada (Web Speech API). */
export const VOICE = {
  lang: 'es-ES',
  /** Tono por equipo: los azules más graves, los rojos más agudos. */
  pitch: { chaser: 0.6, escapist: 1.55 },
  rate: { chaser: 0.95, escapist: 1.15 },
  /** Segundos mínimos entre dos frases habladas (para no saturar). */
  cooldown: 1.2,
  /** Solo se oyen los personajes a esta distancia (px) o menos. */
  hearDistance: 260,
} as const;

/**
 * Rescate (como en "polis y cacos"): al rojo que pillan lo "enjamonan" unos segundos.
 * Si un compañero se queda a su lado lo libera; si nadie llega a tiempo, queda fuera.
 */
export const RESCUE = {
  enabled: true,
  /** Segundos atrapado antes de quedar fuera de la partida. */
  trapSeconds: 12,
  /** Segundos que hay que estar al lado para liberarlo. */
  rescueTime: 1.6,
  /** Distancia (px) a la que se puede rescatar. */
  radius: 20,
  /** Vida con la que vuelve. */
  reviveHp: 50,
  /** Invulnerabilidad al volver (s). */
  reviveInvuln: 1.5,
  /** Lo que baja la barra de rescate por segundo si nadie ayuda. */
  decay: 0.5,
} as const;

/** Mecánicas especiales de los mapas de ciudad y anuncios. */
export const CITY = {
  /** París: segundos antes de poder volver a usar el metro. */
  metroCooldown: 3,
  /** Barcelona: multiplicador de velocidad en el carril bici. */
  laneMultiplier: 1.35,
  /** Ceuta: ráfagas de levante que empujan a todos hacia el oeste. */
  levante: { firstAt: 14, interval: 22, duration: 4.5, force: 42 },
  /** Ventana (s) para encadenar pilladas ("¡DOBLE PILLADA!"). */
  streakWindow: 7,
} as const;
