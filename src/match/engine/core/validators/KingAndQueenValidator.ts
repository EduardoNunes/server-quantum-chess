// src/match/engine/core/validators/QueenAndKingValidator.ts
import { MoveValidator } from './MoveValidator';
import { GameState, MoveIntent } from '../types';

export class QueenValidator implements MoveValidator {
  validate(intent: MoveIntent, state: GameState): boolean {
    const { from, to } = intent;
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    const dz = Math.abs(to.z - from.z);

    // Validação Geométrica Suprema (Retas e TODAS as Diagonais Dimensionais)
    const isRookMove = (dx > 0 && dy === 0 && dz === 0) || (dx === 0 && dy > 0 && dz === 0);
    const isXYDiag = dx === dy && dz === 0 && dx > 0;
    const isXZDiag = dx === dz && dy === 0 && dx > 0;
    const isYZDiag = dy === dz && dx === 0 && dy > 0;
    const isXYZDiag = dx === dy && dy === dz && dx > 0;

    if (!(isRookMove || isXYDiag || isXZDiag || isYZDiag || isXYZDiag)) {
      throw new Error('A Rainha só pode se mover em linhas retas ou diagonais (2D ou multidimensionais livres).');
    }

    // Verificando a Obstrução do Caminho e Status das Dimensões
    const stepX = to.x === from.x ? 0 : (to.x > from.x ? 1 : -1);
    const stepY = to.y === from.y ? 0 : (to.y > from.y ? 1 : -1);
    const stepZ = to.z === from.z ? 0 : (to.z > from.z ? 1 : -1);
    
    const totalSteps = Math.max(dx, dy, dz);
    let cx = from.x + stepX;
    let cy = from.y + stepY;
    let cz = from.z + stepZ;
    
    for (let i = 1; i < totalSteps; i++) {
      const dim = state.dimensions[cz];
      if (!dim || !dim.isActive) throw new Error('O trajeto da Rainha colapsou: uma dimensão intermediária está inativa.');
      if (dim.grid[cy][cx] !== null) throw new Error('O caminho da Rainha está obstruído por outra peça.');
      
      cx += stepX;
      cy += stepY;
      cz += stepZ;
    }

    return true;
  }
}

export class KingValidator implements MoveValidator {
  validate(intent: MoveIntent, state: GameState): boolean {
    const { from, to } = intent;

    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    const dz = Math.abs(to.z - from.z);

    // Validação de Fim de Jogo: Se a partida já está finalizada (Rei Master encurralado), rejeita a nível de engine
    if ((state as any).status === 'COMPLETED') {
      throw new Error('A partida já foi encerrada. O Rei Master foi totalmente encurralado.');
    }

    const piece = state.dimensions[from.z]?.grid[from.y]?.[from.x];

    // Validação do Roque Dimensional (Hook Temporal)
    if (dx === 0 && dy === 0 && dz > 0) {
      const targetPiece = state.dimensions[to.z]?.grid[to.y]?.[to.x];
      // Verifica se é um rei se movendo para a casa de outro rei da mesma cor
      if (targetPiece && targetPiece.type === 'KING' && targetPiece.color === piece?.color) {
        if (!piece || piece.hasMoved || targetPiece.hasMoved) {
          throw new Error('Roque Dimensional inválido: Um ou ambos os Reis já se moveram.');
        }
        // Permite o movimento para que o gateway possa realizar a troca.
        // A engine processará isso como uma "captura" de peça aliada, que o gateway irá corrigir.
        return true;
      }
    }

    // Validação da manobra de Roque (Hook tradicional)
    if (dx === 2 && dy === 0 && dz === 0) {
      if (piece && piece.hasMoved) {
        throw new Error('Roque inválido: O Rei já foi movido nesta partida.');
      }
      
      const isMasterKing = piece && piece.type === 'KING' && piece.isMasterKing;
      if (state.isCheck && isMasterKing) {
        throw new Error('Roque inválido: O Rei Master não pode fazer roque enquanto estiver em xeque.');
      }

      const isKingside = to.x > from.x;
      const rookX = isKingside ? 7 : 0;
      const dimension = state.dimensions[from.z];
      const rookPiece = dimension?.grid[from.y][rookX];

      if (!piece || !rookPiece || rookPiece.type !== 'ROOK' || rookPiece.color !== piece.color) {
        throw new Error('Roque inválido: Torre não encontrada na posição esperada.');
      }

      if (rookPiece.hasMoved) {
        throw new Error('Roque inválido: A Torre já foi movida nesta partida.');
      }

      const step = isKingside ? 1 : -1;
      for (let currX = from.x + step; currX !== rookX; currX += step) {
        if (dimension.grid[from.y][currX] !== null) {
          throw new Error('Roque inválido: O caminho entre o Rei e a Torre deve estar livre.');
        }
      }

      return true;
    }

    // O Rei (Master ou não) anda apenas 1 casa para qualquer direção do hipercubo
    if (dx > 1 || dy > 1 || dz > 1) {
      throw new Error('O Rei está limitado a mover-se apenas 1 casa por vez (inclusive entre dimensões).');
    }
    
    if (dx === 0 && dy === 0 && dz > 0) {
      throw new Error('O Rei não pode pular para a exata casa de cima ou de baixo.');
    }

    // REGRA: O Rei Master em xeque não pode saltar de dimensão
    const isMasterKing = piece && piece.type === 'KING' && piece.isMasterKing;
    
    if (dz > 0 && state.isCheck && isMasterKing) {
      throw new Error('O Rei Master não pode realizar salto dimensional enquanto estiver em xeque.');
    }

    // REGRA: O Rei não pode saltar para uma dimensão onde o jogador não tem mais peças
    if (dz > 0 && piece) {
      const targetDimHasPieces = state.dimensions[to.z]?.grid.some(row => row.some(p => p && p.color === piece.color));
      if (!targetDimHasPieces) {
        throw new Error('O Rei não pode saltar para uma dimensão onde o seu exército não possui peças.');
      }
    }

    return true;
  }
}