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
  private queenValidator = new QueenValidator();

  validate(intent: MoveIntent, state: GameState): boolean {
    const { from, to, piece } = intent;

    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    const dz = Math.abs(to.z - from.z);

    // --- IDENTIFICAÇÃO DO REI MASTER (TURNO 0) ---
    // Cruzamos a cor da peça com as coordenadas gravadas de forma autoritativa no banco
    const isMasterKing = piece.color === 'WHITE'
      ? (state as any).whiteMasterKing &&
      (state as any).whiteMasterKing.x === from.x &&
      (state as any).whiteMasterKing.y === from.y &&
      (state as any).whiteMasterKing.z === from.z
      : (state as any).blackMasterKing &&
      (state as any).blackMasterKing.x === from.x &&
      (state as any).blackMasterKing.y === from.y &&
      (state as any).blackMasterKing.z === from.z;

    if (isMasterKing) {
      // --- MODIFICADOR DE HABILIDADE: REI MASTER ---
      // O Rei consagrado ganha a física quântica superior da Rainha (linhas retas e diagonais infinitas)
      console.log(`👑 [RULE ENGINE] Movimento de longo alcance autorizado para o Rei Master (${piece.color})`);

      try {
        return this.queenValidator.validate(intent, state);
      } catch (err: any) {
        const message = err?.message || '';
        // Adapta a mensagem de erro da rainha para o contexto do Rei Master
        if (message.includes('Rainha')) {
          throw new Error('O Rei Master só pode se mover em linhas retas ou diagonais livres por todo o multiverso.');
        }
        throw err;
      }
    } else {
      // --- REGRA CLÁSSICA: REI COMUM ---
      // Os reis não batizados ficam restritos à física tradicional de andar apenas 1 casa para qualquer direção do hipercubo
      if (dx > 1 || dy > 1 || dz > 1) {
        throw new Error('O Rei comum está limitado a mover-se apenas 1 casa por vez (inclusive entre dimensões).');
      }
      
      if (dx === 0 && dy === 0 && dz > 0) {
        throw new Error('O Rei não pode pular para a exata casa de cima ou de baixo.');
      }

      // Estando em um raio de até 1, o movimento já é geometricamente válido.
      return true;
    }
  }
}