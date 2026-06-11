// src/match/engine/core/validators/KnightValidator.ts
import { MoveValidator } from './MoveValidator';
import { GameState, MoveIntent } from '../types';

export class KnightValidator implements MoveValidator {
  validate(intent: MoveIntent, state: GameState): boolean {
    const dx = Math.abs(intent.to.x - intent.from.x);
    const dy = Math.abs(intent.to.y - intent.from.y);
    const dz = Math.abs(intent.to.z - intent.from.z);

    // 1. Movimento em L Clássico (Apenas no mesmo tabuleiro 2D / Eixo Z parado)
    const isClassicL = (dx === 2 && dy === 1 && dz === 0) || (dx === 1 && dy === 2 && dz === 0);

    // 2. Movimento em L Multidimensional (O "L" projeta-se entre os tabuleiros)
    // Caso A: Salto longo dimensional (2 no Z) -> Precisa andar exatamente 1 em X ou 1 em Y, mantendo o outro zerado.
    const isQuantumLongZ = dz === 2 && ((dx === 1 && dy === 0) || (dx === 0 && dy === 1));

    // Caso B: Salto curto dimensional (1 no Z) -> Precisa andar exatamente 2 em X ou 2 em Y, mantendo o outro zerado.
    const isQuantumShortZ = dz === 1 && ((dx === 2 && dy === 0) || (dx === 0 && dy === 2));

    if (!isClassicL && !isQuantumLongZ && !isQuantumShortZ) {
      throw new Error('Movimento inválido: O Cavalo Quântico só pode se mover em "L" estrito (2x1) usando no máximo dois eixos.');
    }

    // Trava de segurança para limites do array de dimensões do estado
    if (intent.to.z < 0 || intent.to.z >= state.dimensions.length) {
      throw new Error('O Cavalo tentou saltar para uma fenda dimensional inexistente.');
    }

    return true; // O Cavalo pula peças! Caminhos intermediários ignorados com sucesso.
  }
}