/** ¿Es un dispositivo táctil? (móvil o tablet). Se decide una vez al cargar. */
export const IS_TOUCH: boolean =
  typeof window !== 'undefined' &&
  (('ontouchstart' in window && navigator.maxTouchPoints > 0) || window.matchMedia?.('(pointer: coarse)').matches === true);

/** Cambia las instrucciones de teclado por las de toque (solo en táctiles). */
export function touchify(s: string): string {
  if (!IS_TOUCH) return s;
  return s
    .replace('← O ESPACIO · → O E', 'TOCA A LA IZQUIERDA O A LA DERECHA')
    .replace('← → (O ESPACIO / E)', 'TOCA A LOS LADOS')
    .replace('← → ELIGE TU VENTAJA · ESPACIO', 'TOCA TU VENTAJA')
    .replace(/← → (ELIGE|ELEGIR)( TU CABALLO GANADOR)? · ESPACIO( CONFIRMAR| CONFIRMA)?/, 'TOCA PARA ELEGIR')
    .replace('← → ELIGE TU CABALLO GANADOR', 'TOCA TU CABALLO GANADOR')
    .replace('ESPACIO: ELEGIR Y LUEGO ¡ANIMARLO!', 'TÓCALO Y LUEGO ¡MACHACA LA PANTALLA!')
    .replace('← → · ESPACIO', 'TOCAR')
    .replace('← → MUEVE LA CESTA · TOCA A LOS LADOS', 'TOCA A LOS LADOS PARA MOVER LA CESTA')
    .replace('CON ← →', 'TOCANDO A LOS LADOS')
    .replace('MACHACA ESPACIO', 'MACHACA LA PANTALLA')
    .replace('PULSA ESPACIO', 'TOCA')
    .replace('¡ESPACIO!', '¡TOCA!')
    .replace('ESPACIO (AL RITMO)', 'TOCAR AL RITMO')
    .replace(/ESPACIO/g, 'TOCAR')
    .replace('← →', 'TOCA A LOS LADOS');
}
