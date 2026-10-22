/**
 * Entrada del jugador en binario (8 bytes, solo cuando cambia y como mucho 10 veces por segundo):
 *   [0] tipo (1)  [1] x (-100..100)  [2] y (-100..100)  [3] bits (1 = sprint)
 *   [4] golpes  [5] habilidades  [6] giros  [7] ruletas   ← contadores que dan la vuelta en 256
 * Un contador que sube = "ha pulsado" (si se pierde un mensaje, el siguiente lo recupera).
 */
export const INPUT_TAG = 1;
export const INPUT_BYTES = 8;

export interface InputPacket {
  x: number;
  y: number;
  sprint: boolean;
  a: number;
  b: number;
  o: number;
  q: number;
}

const clampI8 = (v: number) => Math.max(-100, Math.min(100, Math.round(v)));

export function encodeInput(p: InputPacket): ArrayBuffer {
  const buf = new ArrayBuffer(INPUT_BYTES);
  const d = new DataView(buf);
  d.setUint8(0, INPUT_TAG);
  d.setInt8(1, clampI8(p.x * 100));
  d.setInt8(2, clampI8(p.y * 100));
  d.setUint8(3, p.sprint ? 1 : 0);
  d.setUint8(4, p.a & 255);
  d.setUint8(5, p.b & 255);
  d.setUint8(6, p.o & 255);
  d.setUint8(7, p.q & 255);
  return buf;
}

/** null si no es una entrada válida (tamaño o tipo incorrectos). */
export function decodeInput(buf: ArrayBuffer): InputPacket | null {
  if (!(buf instanceof ArrayBuffer) || buf.byteLength !== INPUT_BYTES) return null;
  const d = new DataView(buf);
  if (d.getUint8(0) !== INPUT_TAG) return null;
  return { x: clampI8(d.getInt8(1)) / 100, y: clampI8(d.getInt8(2)) / 100, sprint: (d.getUint8(3) & 1) === 1, a: d.getUint8(4), b: d.getUint8(5), o: d.getUint8(6), q: d.getUint8(7) };
}

/** ¿Cuántas pulsaciones nuevas hay entre dos valores de un contador de 8 bits? (0 si es viejo o repetido) */
export function counterDelta(prev: number, now: number): number {
  if (prev < 0) return 0;
  const d = (now - prev) & 255;
  return d > 0 && d < 128 ? d : 0;
}
