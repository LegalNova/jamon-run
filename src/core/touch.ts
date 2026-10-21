/** ¿Es un dispositivo táctil? (móvil o tablet). Se decide una vez al cargar. */
export const IS_TOUCH: boolean =
  typeof window !== 'undefined' &&
  (('ontouchstart' in window && navigator.maxTouchPoints > 0) || window.matchMedia?.('(pointer: coarse)').matches === true);
