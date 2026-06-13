import { GameState, Dimension, Piece, Color, PieceType } from './types';

// Helper para gerar o ID e a estrutura de uma peça
const createPiece = (type: PieceType, color: Color, id: string, isMaster = false): Piece => ({
  id: `${color.toLowerCase()}-${type.toLowerCase()}-${id}`,
  type,
  color,
  isMasterKing: type === 'KING' ? isMaster : undefined
});

// Gera a fileira de peças pesadas (Torre, Cavalo, Bispo, Rainha, Rei)
const generateBackRow = (color: Color, z: number): (Piece | null)[] => {
  const isWhite = color === 'WHITE';
  // IMPORTANTE: No início, definimos a Dimensão 1 (z=0) como o Rei Master padrão. 
  // O jogador poderá mudar isso na tela de Lobby em segredo antes do jogo começar.
  const isMasterKing = (z === 0);

  return [
    createPiece('ROOK', color, `R1-z${z}`),
    createPiece('KNIGHT', color, `N1-z${z}`),
    createPiece('BISHOP', color, `B1-z${z}`),
    isWhite ? createPiece('QUEEN', color, `Q-z${z}`) : createPiece('KING', color, `K-z${z}`, isMasterKing),
    isWhite ? createPiece('KING', color, `K-z${z}`, isMasterKing) : createPiece('QUEEN', color, `Q-z${z}`),
    createPiece('BISHOP', color, `B2-z${z}`),
    createPiece('KNIGHT', color, `N2-z${z}`),
    createPiece('ROOK', color, `R2-z${z}`),
  ];
};

// Gera as 4 dimensões idênticas
export const generateInitialState = (): GameState => {
  const dimensions: Dimension[] = [];

  for (let z = 0; z < 4; z++) {
    const grid: (Piece | null)[][] = [];

    // Linha 0 (Fileira 1 das Brancas)
    grid.push(generateBackRow('WHITE', z));
    // Linha 1 (Peões das Brancas)
    grid.push(Array.from({ length: 8 }, (_, x) => createPiece('PAWN', 'WHITE', `P${x + 1}-z${z}`)));

    // Linhas 2, 3, 4, 5 (Espaço Vazio)
    for (let y = 2; y <= 5; y++) {
      grid.push(Array.from({ length: 8 }, () => null));
    }

    // Linha 6 (Peões das Pretas)
    grid.push(Array.from({ length: 8 }, (_, x) => createPiece('PAWN', 'BLACK', `P${x + 1}-z${z}`)));
    // Linha 7 (Fileira 8 das Pretas)
    grid.push(generateBackRow('BLACK', z));

    dimensions.push({
      level: z,
      isActive: true,
      grid
    });
  }

  return {
    dimensions,
    turn: 'WHITE',
    actionsRemaining: 2,
    winnerId: null,
    isCheck: false,
    moveHistory: []
  };
};