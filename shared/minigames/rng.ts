/** Azar de verdad (crypto.getRandomValues): lo usa el servidor para ruleta, caballos y trilero. */
export function secureRandom(): number {
  const c = (globalThis as unknown as { crypto: { getRandomValues(a: Uint32Array): Uint32Array } }).crypto;
  const a = new Uint32Array(1);
  c.getRandomValues(a);
  return a[0] / 4294967296;
}
