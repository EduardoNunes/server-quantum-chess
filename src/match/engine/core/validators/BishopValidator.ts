// src/match/engine/core/validators/BishopValidator.ts
import { MoveValidator } from './MoveValidator';
import { GameState, MoveIntent } from '../types';

export class BishopValidator implements MoveValidator {
  validate(intent: MoveIntent, state: GameState): boolean {
    const { from, to } = intent;

    // --- TRAVA DE SEGURANÇA MÁXIMA DE DIMENSÕES ---
    // O limite absoluto do tabuleiro quântico é de 8 dimensões (índices de 0 a 7)
    if (to.z < 0 || to.z >= 8) {
      throw new Error('Anomalia Espacial: O Bispo tentou ultrapassar o limite máximo de 8 dimensões do multiverso.');
    }

    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    const dz = Math.abs(to.z - from.z);

    // Diagonal clássica 2D (mesmo tabuleiro)
    const isClassicDiagonal = dx === dy && dz === 0 && dx > 0;

    // Hiperdiagonal espacial pura (muda x, y e z na mesmíssima proporção ao mesmo tempo)
    // Permite saltar múltiplas dimensões de uma vez (ex: z:0 para z:3, desde que ande 3 em X e 3 em Y)
    const isHyperDiagonal = dx === dy && dy === dz && dx > 0;

    if (!isClassicDiagonal && !isHyperDiagonal) {
      throw new Error('O Bispo só pode se mover em diagonais puras (2D ou Hiperdiagonal Quântica de longo alcance).');
    }

    // --- VARREDURA DE OBSTRUÇÃO NO HIPERESPAÇO MÚLTIPLO ---
    // Direção unitária do vetor de passo (-1, 0 ou 1)
    const stepX = to.x === from.x ? 0 : (to.x > from.x ? 1 : -1);
    const stepY = to.y === from.y ? 0 : (to.y > from.y ? 1 : -1);
    const stepZ = to.z === from.z ? 0 : (to.z > from.z ? 1 : -1);

    // O limite do laço é ditado pelo maior delta (como dx === dy === dz no salto puro, qualquer um serve)
    const totalSteps = Math.max(dx, dy, dz);

    let currentX = from.x + stepX;
    let currentY = from.y + stepY;
    let currentZ = from.z + stepZ;

    // Varre todas as dimensões e casas intermediárias pelas quais o Bispo vai cruzar
    for (let i = 1; i < totalSteps; i++) {
      const dimension = state.dimensions[currentZ];

      // Valida se a realidade pela qual o Bispo está cruzando existe e está ativa
      if (!dimension || !dimension.isActive) {
        throw new Error(`O trajeto do Bispo colapsou ao tentar cruzar a Dimensão ${currentZ + 1}, que está inativa.`);
      }

      // Valida se alguma peça está flutuando na coordenada correspondente daquela dimensão do meio
      if (dimension.grid[currentY][currentX] !== null) {
        throw new Error(`Caminho obstruído: O Bispo colidiu com uma peça na Dimensão ${currentZ + 1} (posição: ${currentX},${currentY}).`);
      }

      // Incrementa os três eixos simultaneamente em direção ao destino
      currentX += stepX;
      currentY += stepY;
      currentZ += stepZ;
    }

    return true;
  }
}