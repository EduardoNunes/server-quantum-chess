// src/match/engine/core/types.ts

export type GameModality = 'CLASSIC' | 'DYNAMIC';

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
  | 'MATE'
  | 'DRAW'
  | 'RESIGN';

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
  hasMoved?: boolean;       // Flag para validar movimentos especiais como o Roque
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
  modality: GameModality;   // O estilo de progressão de turnos
  activeDimensionIndex?: number; // Para modalidade dinâmica, indica a dimensão da jogada atual
  actionsRemaining: number; // Contador de ações globais restantes no turno atual (Máximo: 2)
  winnerId: string | null;  // ID do usuário vencedor se o Rei Master inimigo cair
  isCheck: boolean;         // TRUE se o Rei Master do jogador atual estiver em xeque
  whiteMasterKing?: Vector3D | null; // Coordenadas do Rei Master Branco (se ativo)
  blackMasterKing?: Vector3D | null; // Coordenadas do Rei Master Preto (se ativo)
  moveHistory: MoveIntent[]; // Histórico completo de movimentos para validação de regras como En Passant
  status: 'ONGOING' | 'CHECKMATE' | 'STALEMATE' | 'COMPLETED' | 'WAITING_FOR_OPPONENT'; // Status atual da partida
  halfMoveClock: number; // Contador de meio-movimentos para a regra dos 50 movimentos
  stateHashes: string[]; // Array de hashes do estado para detectar repetições (Threefold Repetition)
  eliminatedPieces: Piece[]; // Lista de peças capturadas para feedback visual e validação de empate por material insuficiente
  forcedMasterKingSave?: boolean; // Flag para indicar se o jogador deve salvar seu Rei Master (apenas na modalidade dinâmica)

  // --- ADIÇÕES DE GERENCIAMENTO DE JOGADORES ---
  whitePlayerId: string | null; // Referência direta para simplificar validações no Frontend
  blackPlayerId: string | null;
  reason?: string; // Armazena motivos de encerramento, ex: 'RESIGNATION', 'CANCELLED', 'INSUFFICIENT_MATERIAL'
}

/**
 * A Intenção de Movimento enviada pelo Jogador via Cliente (React)
 */
export interface MoveIntent {
  piece: Piece;             // A cópia da peça que o jogador quer mover
  from: Vector3D;           // Coordenada de origem (x, y, z)
  to: Vector3D;             // Coordenada de destino pretendida (x, y, z)
  promotionType?: PieceType;// Tipo de peça desejado na promoção (se aplicável)
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
    reason?: string;        // Motivo em eventos de empate/desistência
    loserId?: string;       // ID de quem desistiu
  };
}

/**
 * Representação mínima de um Usuário/Jogador do Banco de Dados
 * (Usado para popular os nomes no Frontend caso seja feito o 'include')
 */
export interface UserPayload {
  id: string;
  name?: string;
  username?: string;
}

export type MatchStatus = 'WAITING_FOR_OPPONENT' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';

/**
 * Tipagem estrita da Entidade de Partida gerada pelo Prisma/Banco de Dados.
 * Resolve o erro ts(2551) de propriedades inexistentes.
 */
export interface Match {
  id: string;
  whitePlayerId: string | null;
  blackPlayerId: string | null;
  status: MatchStatus;
  winnerId: string | null;
  gameState: GameState | any; // 'any' permite flexibilidade com o JsonValue do Prisma, mas na aplicação deve ser tratado como GameState
  moveHistory: string[];
  createdAt: Date;
  updatedAt: Date;

  // Propriedades Relacionais Opcionais (Preenchidas apenas se o Prisma usar 'include: { whitePlayer: true }')
  whitePlayer?: UserPayload | null;
  blackPlayer?: UserPayload | null;
}