// src/match/engine/core/validators/RookValidator.ts
import { MoveValidator } from './MoveValidator';
import { GameState, MoveIntent } from '../types';

export class RookValidator implements MoveValidator {
  validate(intent: MoveIntent, state: GameState): boolean {
    const { from, to } = intent;

    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    const dz = Math.abs(to.z - from.z);

    const isClassicX = dx > 0 && dy === 0 && dz === 0;
    const isClassicY = dx === 0 && dy > 0 && dz === 0;
    const isHyperX = dx === dz && dy === 0 && dx > 0;
    const isHyperY = dy === dz && dx === 0 && dy > 0;

    if (!(isClassicX || isClassicY || isHyperX || isHyperY)) {
      throw new Error('A Torre só pode se mover em retas 2D (X ou Y) ou em diagonais dimensionais (XZ ou YZ). Pulos puramente verticais são proibidos.');
    }

    // --- VERIFICAÇÃO DE OBSTRUÇÃO DE CAMINHO (COLISÕES DA TORRE) ---
    // Determina a direção unitária do vetor (-1, 0 ou 1)
    const stepX = to.x === from.x ? 0 : (to.x > from.x ? 1 : -1);
    const stepY = to.y === from.y ? 0 : (to.y > from.y ? 1 : -1);
    const stepZ = to.z === from.z ? 0 : (to.z > from.z ? 1 : -1);

    // O número de iterações é o deslocamento do único eixo que se moveu
    const totalSteps = Math.max(dx, dy, dz);

    let currentX = from.x + stepX;
    let currentY = from.y + stepY;
    let currentZ = from.z + stepZ;

    // Varre as casas intermediárias
    for (let i = 1; i < totalSteps; i++) {
      const dimension = state.dimensions[currentZ];

      if (!dimension || !dimension.isActive) {
        throw new Error(`O trajeto da Torre colapsou: a Dimensão ${currentZ + 1} está inativa.`);
      }

      if (dimension.grid[currentY][currentX] !== null) {
        throw new Error('O caminho da Torre está obstruído por outra peça.');
      }

      currentX += stepX;
      currentY += stepY;
      currentZ += stepZ;
    }

    return true;
  }
}