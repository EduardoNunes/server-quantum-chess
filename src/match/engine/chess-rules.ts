// src/match/engine/chess-rules.ts

export interface Coord2D { x: number; y: number; }

/**
 * Valida se o movimento do Peão é legal no xadrez clássico
 */
export function isValidPawnMove(
  from: Coord2D,
  to: Coord2D,
  color: 'WHITE' | 'BLACK',
  targetPiece: any | null
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  // No nosso tabuleiro invertido, Brancas sobem (Y aumenta) e Pretas descem (Y diminui)
  const direction = color === 'WHITE' ? 1 : -1;
  const startRow = color === 'WHITE' ? 1 : 6;

  // 1. Movimento estrito para frente (Sem captura)
  if (dx === 0 && !targetPiece) {
    // Avanço simples de 1 casa
    if (dy === direction) return true;
    // Avanço duplo da fileira inicial (precisa pular 2 casas)
    if (from.y === startRow && dy === 2 * direction) return true;
  }

  // 2. Captura na diagonal (Apenas se houver uma peça inimiga no destino)
  if (Math.abs(dx) === 1 && dy === direction && targetPiece) {
    return targetPiece.color !== color;
  }

  return false;
}

/**
 * Valida se o movimento da Torre é linear e verifica se há peças obstruindo o caminho
 */
export function isValidRookMove(
  from: Coord2D,
  to: Coord2D,
  grid: any[][]
): boolean {
  // A torre só se move se alterar apenas X ou apenas Y
  if (from.x !== to.x && from.y !== to.y) return false;

  const startX = Math.min(from.x, to.x);
  const endX = Math.max(from.x, to.x);
  const startY = Math.min(from.y, to.y);
  const endY = Math.max(from.y, to.y);

  // Verificação de colisão/obstrução ao longo do caminho horizontal
  if (from.y === to.y) {
    for (let x = startX + 1; x < endX; x++) {
      if (grid[from.y][x] !== null) return false; // Caminho bloqueado!
    }
  }
  // Verificação de colisão ao longo do caminho vertical
  else {
    for (let y = startY + 1; y < endY; y++) {
      if (grid[y][from.x] !== null) return false; // Caminho bloqueado!
    }
  }

  return true;
}