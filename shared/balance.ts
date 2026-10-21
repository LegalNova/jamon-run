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
    durationOptions: [60, 90, 120, 150, 180, 300],
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
  /** Cazadores al empezar (0 = automático). */
  huntersOptions: [0, 1, 2, 3, 4, 5],
  /** Duraciones que puede elegir el anfitrión (s). */
  durationOptions: [60, 90, 120, 150, 180, 300],
} as const;

/**
 * Los mapas crecen con el número de jugadores: se repiten en espejo.
 * sx/sy = copias en horizontal/vertical.
 */
export const MAP_SCALE: { maxPlayers: number; sx: number; sy: number }[] = [
  { maxPlayers: 9, sx: 1, sy: 1 },
  // Hasta 20: el doble de ancho (con 2x2 quedaban demasiado dispersos y no había acción).
  { maxPlayers: 20, sx: 2, sy: 1 },
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
    '¡Cerebroooos... de jamón!', // 23 infectado
    '¡Que no me toque, que no me toque!', // 24 superviviente
    '¡Toma, pa ti, que quema!', // 25 bomba
    '¡Quema, quema, quema!', // 26 bomba
    '¿Esa papelera se ha movido?', // 27 buscador
    'Soy una farola. Muy normal.', // 28 escondido
    '¡Ruleta, ruleta!', // 29
    '¡Vamos, Pata Negra!', // 30
    '¡Soy una LEYENDA!', // 31
  ],
  /** Rueda de frases rápidas (tecla T): 8 por equipo. */
  wheel: {
    chaser: [0, 1, 2, 14, 15, 16, 17, 13],
    escapist: [5, 6, 18, 19, 21, 8, 10, 11],
  },
  /** Ruedas propias de cada modo (cazador / presa). */
  modeWheel: {
    infeccion: { chaser: [23, 0, 16, 1, 15, 11, 12, 13], escapist: [24, 9, 8, 19, 10, 31, 12, 11] },
    bomba: { chaser: [25, 26, 11, 9, 12, 29, 30, 13], escapist: [21, 5, 11, 9, 12, 29, 30, 13] },
    escondite: { chaser: [27, 0, 16, 1, 15, 12, 30, 13], escapist: [28, 11, 21, 5, 8, 29, 30, 13] },
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

/** Valores de cada modo de juego. */
export const MODES = {
  pilla: { duration: 120 },
  infeccion: {
    duration: 150,
    /** Infectados al empezar (0 = automático: 1). */
    startInfected: 1,
    /** Los infectados son un 10% más rápidos. */
    infectedSpeed: 1.1,
    /** Distancia de contagio (px, además de los radios). */
    touch: 3,
    /** Barrera temporal: segundos y longitud en tiles. */
    barrierSeconds: 5,
    barrierLength: 3,
    /** Cada cuánto ven los infectados al último superviviente en el minimapa (s). */
    lastPing: 4,
    itemWeights: { barrier: 3, boot: 3, grenade: 3 },
  },
  bomba: {
    /** Mecha oculta: entre min y max segundos. */
    fuseMin: 15,
    fuseMax: 25,
    /** Segundos sin poder devolverle el jamón al mismo. */
    noReturn: 2,
    /** El que lleva el jamón va un poco más rápido. */
    holderSpeed: 1.12,
    /** Con más de este número de vivos hay 2 jamones bomba. */
    twoBombsOver: 10,
    /** Pausa entre rondas (s). */
    between: 3,
    touch: 3,
  },
  escondite: {
    duration: 180,
    /** Fase de esconderse (los buscadores no ven ni se mueven). */
    hideSeconds: 30,
    /** Pistas sonoras de los escondidos: cada N s (en el último tramo, cada M s). */
    hintEvery: 20,
    hintEveryLate: 10,
    lateFrom: 30,
    /** Daño al escondido por golpe y vida que pierde el buscador al golpear un objeto normal. */
    hitDamage: 50,
    missPenalty: 8,
    seekerHp: 100,
    /** Velocidad moviéndose disfrazado. */
    disguisedSpeed: 0.8,
    /** Distancia para transformarse en un objeto (px). */
    disguiseRange: 26,
    /** Densidad de objetos: uno cada N tiles libres. */
    propDensity: 11,
  },
} as const;

/**
 * DOPAMINA: monedas, combos, medallas, ruleta de la suerte y carrera de caballos.
 * (Monedas del juego: no se compran con dinero real.)
 */
export const HYPE = {
  /** Combo: si ganas monedas otra vez en este tiempo, sube el multiplicador. */
  comboWindow: 4,
  comboMax: 5,
  coins: {
    hit: 5,
    trap: 25,
    rescue: 30,
    dodge: 10,
    block: 10,
    item: 5,
    infect: 30,
    surviveTick: 5,
    lastSurvivor: 100,
    pass: 10,
    closeCall: 20,
    roundSurvived: 15,
    find: 20,
    eliminate: 40,
    hintSurvived: 5,
    win: 60,
    jackpot: 200,
    roulette: 50,
  },
  /** Ruleta de la suerte global: 2 tiradas por partida (fracción de la partida). */
  globalSpinsAt: [0.2, 0.6],
  /** En Jamón Bomba (sin tiempo fijo): segundos de partida. */
  bombaSpinsAt: [20, 60],
  spinDelay: 2.4,
  effectSeconds: 15,
  /** Tirada personal: 1 por partida, disponible tras estos segundos. */
  personalSpins: 1,
  personalFrom: 10,
  /** Ruleta global: efectos para todos durante effectSeconds. */
  globalWheel: ['turbo', 'lluvia', 'cabezones', 'cambiazo', 'escudos', 'doble'],
  /** Ruleta personal (Q): premios y su probabilidad relativa. */
  personalWheel: ['botas', 'escudo', 'monedas', 'dash', 'invisible', 'jackpot'],
  personalWeights: [3, 3, 3, 2, 2, 0.7],
  turboSpeed: 1.3,
  /** Monedas que caen con la lluvia de monedas y cuánto vale cada una. */
  rainCoins: 14,
  coinValue: 10,
  medalBonus: 25,
  /** Cada cuántos segundos dan monedas por seguir vivo. */
  surviveEvery: 10,
} as const;

/** Nivel según la experiencia acumulada (perfil local). */
export function levelFor(xp: number): { level: number; cur: number; next: number } {
  let level = 1;
  let need = 200;
  let base = 0;
  while (xp >= base + need) {
    base += need;
    level++;
    need = Math.round(need * 1.25);
  }
  return { level, cur: xp - base, next: need };
}

/**
 * PARÓN DOPAMINA: una vez por partida, entre el 30% y el 70% del tiempo, todo se congela
 * y toca un minijuego. Duraciones de cada fase (s) y ventajas del ganador.
 */
export const PARON = {
  /** Cuántos Parones de minijuegos según lo que elija el anfitrión (uno cada ~45-60 s). */
  levels: { no: 0, pocos: 1, normal: 2, muchos: 3 },
  /** Con partidas largas (más de longFrom s) sale uno más. */
  longFrom: 150,
  /** Ni muy al principio ni muy al final, y separados entre sí. */
  firstAt: 25,
  minGap: 30,
  endMargin: 15,
  /** Jamón Bomba no tiene tiempo fijo: segundos en los que puede saltar cada Parón. */
  bombaEvery: 55,
  /** Probabilidad de "Parón Doble" (dos minijuegos seguidos rápidos). */
  doubleChance: 0.2,
  /** Eventos aparte (como mucho uno de cada por partida): probabilidad de que salgan. */
  eventChance: { ruleta: 0.65, carrera: 0.5 },
  phases: { break: 1.5, slot: 2.4, howto: 2, podium: 4, podiumQuick: 2.2, count: 3 },
  /** Ventajas para lo que queda de partida: +10% velocidad, escudo, recarga un 20% más rápida. */
  perkSpeed: 1.1,
  perkCooldown: 0.8,
  /** Reacciones (1-5) por segundo como mucho. */
  reactionsPerSec: 3,
  /** Cuántos minijuegos recientes recuerda la bolsa para no repetir entre partidas. */
  bagMemory: 4,
} as const;

export type ParonLevel = keyof typeof PARON.levels;

/** Valores de los minijuegos (pagos, cuotas, duraciones...). */
export const MG = {
  /** EVENTO RULETA: rojo, negro o verde (0 y 00). Se apuesta con lonchas; lo decide el servidor. */
  ruleta: {
    bet: 10,
    spin: 5,
    show: 3,
    pay: { rojo: 1, negro: 1, verde: 17 },
    amounts: [10, 50, 100],
    step: 10,
    /** Apuesta máxima (también lo que significa "TODO" si tienes más). */
    maxBet: 500,
  },
  caballos: {
    pick: 8,
    race: 10,
    show: 2.5,
    horses: ['PATA NEGRA', 'IBÉRICO VELOZ', 'SERRANO TURBO', 'BELLOTA EXPRESS', 'JAMONCITO', 'LONCHA LOCA'],
    /** Apuesta fija: si gana tu caballo cobras apuesta x cuota en lonchas. */
    stake: 10,
    bonusCap: 150,
    /** Empujoncito por cada pulsación al animar (máximo por segundo). */
    cheer: 0.0022,
    cheerPerSec: 7,
  },
  atrapa: { duration: 15, lanes: 5, every: 0.42 },
  cuenta: { rounds: 3, show: 4.5, pick: 2.6, reveal: 1.2, min: [5, 7, 9], max: [8, 11, 14] },
  corta: { cuts: 5, duration: 15, period: 1.3, periodStep: 0.16, cooldown: 0.35 },
  torre: { duration: 20, period: 1.5, minPeriod: 0.42, step: 0.07, perfect: 0.04 },
  tira: { duration: 15, beat: 0.5, window: 0.09, near: 0.18, winAt: 1 },
  trilero: { cups: [3, 4, 5], swaps: [5, 7, 9], swapTime: [0.42, 0.32, 0.25], show: 1.1, pick: 2.3, reveal: 1.1 },
  reflejos: { rounds: 3, waitMin: 1.4, waitMax: 3.6, window: 1.5, early: 1000, gap: 0.9 },
  ritmo: { duration: 15, bpm: 128, perfect: 0.06, good: 0.13 },
} as const;
