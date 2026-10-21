import type { Env } from './index';

/** Identificador de cuenta del navegador (aleatorio, solo lo conoce su dueño). */
export function validAccount(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id);
}

export function profileOf(env: Env, id: string) {
  return env.PROFILE.get(env.PROFILE.idFromName('p:' + id));
}
