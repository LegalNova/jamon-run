import type { ModeId } from '../sim/types';
import { BombaMode } from './bomba';
import { EsconditeMode } from './escondite';
import { InfeccionMode } from './infeccion';
import { PillaMode } from './pilla';
import type { GameMode } from './types';

export * from './rules';
export * from './types';

export function createMode(id: ModeId): GameMode {
  switch (id) {
    case 'infeccion':
      return new InfeccionMode();
    case 'bomba':
      return new BombaMode();
    case 'escondite':
      return new EsconditeMode();
    default:
      return new PillaMode();
  }
}
