// src/match/engine/core/types.ts

/**
 * Cores clássicas das peças do xadrez
 */
export type Color = 'WHITE' | 'BLACK';

/**
 * Tipos de peças válidas no ecossistema quântico
 */
export type PieceType = 'PAWN' | 'ROOK' | 'KNIGHT' | 'BISHOP' | 'QUEEN' | 'KING';

/**
 * Tipos de eventos gerados após a execução de um movimento bem-sucedido.
 * Usados pelo Frontend para disparar efeitos sonoros e animações na tela.
 */
export type GameEventType = 
  | 'COLLAPSE' 
  | 'CAPTURE' 
  | 'PROMOTION' 
  | 'DIMENSION_REACTIVATED' 
  | 'CHECK' 
  | 'MATE';

/**
 * Vetor de Coordenadas Tridimensionais Espaciais (Posicionamento Global)
 * x: Colunas (0 a 7 -> Equivalente a de 'a' até 'h')
 * y: Fileiras (0 a 7 -> Equivalente a de '1' até '8')
 * z: Dimensões (0 a 3 -> Representa os 4 tabuleiros ativos)
 */
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Representação atômica de uma Peça no Estado do Jogo
 */
export interface Piece {
  id: string;               // Identificador único (Ex: 'w-pawn-3' ou UUID)
  type: PieceType;          // Tipo atual da peça (pode mudar dinamicamente na promoção)
  color: Color;             // Aliança da peça (Brancas ou Pretas)
  isMasterKing?: boolean;   // Flag oculta: TRUE se for o Rei Master (omitido para o oponente)
}

/**
 * Estrutura de uma Dimensão (Tabuleiro Isolado)
 * O grid é uma matriz 8x8 que pode conter uma Peça ou null se a casa estiver vazia.
 */
export interface Dimension {
  level: number;            // O índice do eixo Z (0 a 3)
  isActive: boolean;        // FALSE se o Rei Secundário desta dimensão tomou mate
  grid: (Piece | null)[][]; // Matriz estrita indexada por [y][x]
}

/**
 * O Estado Absoluto de uma Partida Ativa (Snapshot do Banco de Dados)
 */
export interface GameState {
  dimensions: Dimension[];  // Array contendo o estado das 4 dimensões
  turn: Color;              // De quem é a vez de jogar ('WHITE' ou 'BLACK')
  actionsRemaining: number; // Contador de ações globais restantes no turno atual (Máximo: 2)
  winnerId: string | null;  // ID do usuário vencedor se o Rei Master inimigo cair
}

/**
 * A Intenção de Movimento enviada pelo Jogador via Cliente (React)
 */
export interface MoveIntent {
  piece: Piece;             // A cópia da peça que o jogador quer mover
  from: Vector3D;           // Coordenada de origem (x, y, z)
  to: Vector3D;             // Coordenada de destino pretendida (x, y, z)
}

/**
 * Registro de Eventos de Saída (Log de Feedback)
 */
export interface GameEvent {
  type: GameEventType;
  payload: {
    piece?: Piece;          // A peça afetada pelo evento (capturada, colapsada)
    coord?: Vector3D;       // Onde o evento aconteceu graficamente
    dimension?: number;     // Qual dimensão sofreu alteração de estado (se aplicável)
    newType?: PieceType;    // Para qual peça o peão se transformou na promoção
  };
}