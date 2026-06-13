// src/match/engine/core/validators/PawnValidator.ts
import { MoveValidator } from './MoveValidator';
import { GameState, MoveIntent } from '../types';

export class PawnValidator implements MoveValidator {
  validate(intent: MoveIntent, state: GameState): boolean {
    const { from, to, piece } = intent;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;

    // --- DIRETRIZES FÍSICAS DE COR ---
    // Eixo Y: Brancas sobem (+1), Pretas descem (-1)
    const directionY = piece.color === 'WHITE' ? 1 : -1;
    const startingRow = piece.color === 'WHITE' ? 1 : 6;
    const enemyDirY = piece.color === 'WHITE' ? -1 : 1;

    // Eixo Z Quântico: Todos os peões apenas sobem as dimensões (+1)
    const directionZ = 1;

    // Validação de limite de existência da dimensão de destino
    if (to.z < 0 || to.z >= state.dimensions.length) {
      throw new Error('O Peão tentou se deslocar para uma realidade inexistente.');
    }

    // Captura de forma segura a peça alvo no tabuleiro de destino
    const targetPiece = state.dimensions[to.z].grid[to.y][to.x];
    const isDestinationEmpty = targetPiece === null;

    // Último movimento registrado no histórico (útil para En Passant)
    const lastMove = state.moveHistory && state.moveHistory.length > 0 
      ? state.moveHistory[state.moveHistory.length - 1] 
      : null;

    // --- CENÁRIO A: MOVIMENTO TRADICIONAL (Mesma Dimensão / dz === 0) ---
    if (dz === 0) {
      // 1. Passo simples para frente
      if (dx === 0 && dy === directionY && isDestinationEmpty) {
        return true;
      }

      // 2. Passo duplo inicial
      if (dx === 0 && from.y === startingRow && dy === 2 * directionY && isDestinationEmpty) {
        const intermediateY = from.y + directionY;
        // Garante que a casa imediatamente à frente no tabuleiro local também está vazia
        if (state.dimensions[from.z].grid[intermediateY][from.x] === null) {
          return true;
        }
      }

      // 3. Captura clássica na diagonal 2D
      if (Math.abs(dx) === 1 && dy === directionY && !isDestinationEmpty && targetPiece.color !== piece.color) {
        return true;
      }

      // 4. Captura En Passant Tradicional (2D)
      if (Math.abs(dx) === 1 && dy === directionY && isDestinationEmpty) {
        if (lastMove && lastMove.to.x === to.x && lastMove.to.z === to.z) {
          // O peão inimigo fez um passo duplo na mesma dimensão
          if (lastMove.from.y === to.y - enemyDirY && lastMove.to.y === to.y + enemyDirY) {
            const enemyPiece = state.dimensions[lastMove.to.z].grid[lastMove.to.y][lastMove.to.x];
            if (enemyPiece && enemyPiece.type === 'PAWN' && enemyPiece.color !== piece.color) {
              return true; // En Passant Tradicional Válido
            }
          }
        }
      }
    }

    // --- CENÁRIO B: MOVIMENTO MULTIDIMENSIONAL (Mudança de Dimensão / dz !== 0) ---
    else {
      const isSingleDimensionalJump = dz === directionZ;
      const isDoubleDimensionalJump = dz === 2 * directionZ && from.y === startingRow;

      if (!isSingleDimensionalJump && !isDoubleDimensionalJump) {
        throw new Error('O Peão Quântico só pode avançar 1 dimensão (ou 2 dimensões no seu movimento inicial) para cima.');
      }

      if (isSingleDimensionalJump) {
        // 1. Passo Simples Dimensional (Avança no eixo Z e no eixo Y simultaneamente, mantém X estático)
        if (dx === 0 && dy === directionY && isDestinationEmpty) {
          return true;
        }

        // 2. Captura Diagonal Multidimensional
        const isDiagonalFrontalQuantumCapture = Math.abs(dx) === 1 && dy === directionY;

        if (isDiagonalFrontalQuantumCapture) {
          if (!isDestinationEmpty && targetPiece.color !== piece.color) {
            return true;
          }

          // 3. Captura En Passant Dimensional (Hiperdimensão)
          if (isDestinationEmpty && lastMove && lastMove.to.x === to.x) {
            if (lastMove.from.y === to.y - enemyDirY && lastMove.to.y === to.y + enemyDirY) {
              // Verifica se o peão inimigo estava na mesma dimensão de destino (passo duplo 2D na dimensão alvo)
              const isEnemyDouble2DInTargetDim = lastMove.from.z === to.z && lastMove.to.z === to.z;
              
              // Ou se o peão inimigo fez um salto dimensional duplo (passando pela dimensão alvo)
              const isEnemyDouble3D = lastMove.from.z === to.z - directionZ && lastMove.to.z === to.z + directionZ;

              if (isEnemyDouble2DInTargetDim || isEnemyDouble3D) {
                const enemyPiece = state.dimensions[lastMove.to.z].grid[lastMove.to.y][lastMove.to.x];
                if (enemyPiece && enemyPiece.type === 'PAWN' && enemyPiece.color !== piece.color) {
                  return true; // En Passant Dimensional Válido
                }
              }
            }
          }

          throw new Error('O Peão só pode mover-se em diagonal multidimensional para capturar uma peça inimiga.');
        }
      } else if (isDoubleDimensionalJump) {
        // 3. Passo Duplo Dimensional (Avança 2 no eixo Z e 2 no eixo Y simultaneamente)
        if (dx === 0 && dy === 2 * directionY && isDestinationEmpty) {
          const intermediateY = from.y + directionY;
          const intermediateZ = from.z + directionZ;
          const intermediateDimension = state.dimensions[intermediateZ];
          
          if (!intermediateDimension || !intermediateDimension.isActive) {
            throw new Error('A dimensão intermediária colapsou ou não existe.');
          }
          
          if (intermediateDimension.grid[intermediateY][from.x] === null) {
            return true;
          } else {
            throw new Error('O caminho para o salto dimensional duplo está obstruído por outra peça.');
          }
        }
      }
    }

    throw new Error('Movimento inválido para as regras do Peão Quântico.');
  }
}