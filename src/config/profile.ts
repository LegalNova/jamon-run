import { Look, randomLook, sanitizeLook } from '../../shared/look';

const LOOK_KEY = 'jamonrun.look.v1';
const ID_KEY = 'jamonrun.playerId.v1';

function load(): Look {
  try {
    const raw = localStorage.getItem(LOOK_KEY);
    if (raw) return sanitizeLook(JSON.parse(raw), 'JUGADOR');
  } catch {
    /* sin almacenamiento */
  }
  return { ...randomLook('JUGADOR'), skin: 1 };
}

/** Aspecto del jugador ("Mi personaje"). */
export const profile: { look: Look } = { look: load() };

export function saveLook(look: Look): void {
  profile.look = sanitizeLook(look, 'JUGADOR');
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(profile.look));
  } catch {
    /* sin almacenamiento */
  }
}

/** Identificador estable del jugador (para reconectar a una sala online). */
export function playerId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9-]/g, '');
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return `anon-${Math.random().toString(36).slice(2)}`;
  }
}
