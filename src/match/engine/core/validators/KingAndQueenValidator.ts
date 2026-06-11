// src/match/engine/core/validators/QueenAndKingValidator.ts
import { MoveValidator } from './MoveValidator';
import { GameState, MoveIntent } from '../types';
import { RookValidator } from './RookValidator';
import { BishopValidator } from './BishopValidator';

export class QueenValidator implements MoveValidator {
  private rookValidator = new RookValidator();
  private bishopValidator = new BishopValidator();

  validate(intent: MoveIntent, state: GameState): boolean {
    // 1. Tenta validar como movimento retilíneo (Torre)
    try {
      if (this.rookValidator.validate(intent, state)) return true;
    } catch (err: any) {
      const message = err?.message || '';

      // Se a torre acusar obstrução, nós adaptamos a mensagem para a Rainha antes de estourar o erro
      if (message.includes('obstruído')) {
        throw new Error('O caminho da Rainha está obstruído por outra peça.');
      }
      if (message.includes('inativa')) {
        throw new Error('O trajeto da Rainha colapsou: a dimensão de destino está inativa.');
      }
    }

    // 2. Tenta validar como movimento diagonal (Bispo)
    try {
      if (this.bishopValidator.validate(intent, state)) return true;
    } catch (err: any) {
      const message = err?.message || '';

      // Se o bispo acusar obstrução no hiperespaço, fazemos o mesmo tratamento
      if (message.includes('obstruído')) {
        throw new Error('O caminho da Rainha está obstruído por outra peça.');
      }
      if (message.includes('inativa')) {
        throw new Error('O trajeto da Rainha colapsou: a dimensão intermediária está inativa.');
      }
    }

    // Se ambas as geometrias falharem, o movimento é completamente inválido
    throw new Error('A Rainha só pode se mover em linhas retas ou diagonais (2D ou multidimensionais).');
  }
}

export class KingValidator implements MoveValidator {
  private queenValidator = new QueenValidator();

  validate(intent: MoveIntent, state: GameState): boolean {
    const dx = Math.abs(intent.to.x - intent.from.x);
    const dy = Math.abs(intent.to.y - intent.from.y);
    const dz = Math.abs(intent.to.z - intent.from.z);

    // O Rei se move como a Rainha, mas a distância máxima em qualquer eixo é 1
    if (dx > 1 || dy > 1 || dz > 1) {
      throw new Error('O Rei só pode se mover 1 casa por vez (inclusive entre dimensões).');
    }

    try {
      return this.queenValidator.validate(intent, state);
    } catch (err: any) {
      const message = err?.message || '';
      // Adapta a mensagem geométrica da rainha para o contexto do Rei
      if (message.includes('Rainha')) {
        throw new Error('O Rei só pode se mover em linhas retas ou diagonais de 1 casa.');
      }
      throw err;
    }
  }
}