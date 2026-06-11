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

    // Eixo Z Quântico: Brancas sobem as dimensões (+1), Pretas descem as dimensões (-1)
    const directionZ = piece.color === 'WHITE' ? 1 : -1;

    // Validação de limite de existência da dimensão de destino
    if (to.z < 0 || to.z >= state.dimensions.length) {
      throw new Error('O Peão tentou se deslocar para uma realidade inexistente.');
    }

    // Captura de forma segura a peça alvo no tabuleiro de destino
    const targetPiece = state.dimensions[to.z].grid[to.y][to.x];
    const isDestinationEmpty = targetPiece === null;

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
    }

    // --- CENÁRIO B: MOVIMENTO MULTIDIMENSIONAL (Mudança de Dimensão / dz !== 0) ---
    else {
      // Correção do avanço quântico simétrico para ambas as cores
      if (dz !== directionZ) {
        throw new Error(`O Peão Quântico só pode avançar para a dimensão imediatamente vizinha no sentido do seu exército.`);
      }

      // 1. Passo Simples Dimensional (Avança no eixo Z, mantém X e Y estáticos)
      if (dx === 0 && dy === 0 && isDestinationEmpty) {
        return true;
      }

      // 2. Captura Diagonal Multidimensional
      // Caso Lateral: Anda 1 no Z, mantém Y estático, desloca 1 para o lado em X
      const isLateralQuantumCapture = Math.abs(dx) === 1 && dy === 0;
      // Caso Frontal: Anda 1 no Z e avança 1 para frente em Y, mantendo o X estático
      const isFrontalQuantumCapture = dx === 0 && dy === directionY;

      if (isLateralQuantumCapture || isFrontalQuantumCapture) {
        if (!isDestinationEmpty && targetPiece.color !== piece.color) {
          return true;
        }
        throw new Error('O Peão só pode mover-se em diagonal multidimensional para capturar uma peça inimiga.');
      }
    }

    throw new Error('Movimento inválido para as regras do Peão Quântico.');
  }
}