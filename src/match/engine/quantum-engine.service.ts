// src/match/engine/quantum-engine.service.ts
import { Injectable, BadRequestException, Inject, forwardRef } from '@nestjs/common'
import { MatchService } from '../match.service';

// Importações corretas da sua arquitetura existente:
import { PawnValidator } from './core/validators/PawnValidator';
import { RookValidator } from './core/validators/RookValidator';
import { MoveIntent, GameState } from './core/types';
import { BishopValidator } from './core/validators/BishopValidator';
import { KingValidator, QueenValidator } from './core/validators/KingAndQueenValidator';
import { KnightValidator } from './core/validators/KnightValidator';

@Injectable()
export class QuantumEngineService {
  constructor(
    @Inject(forwardRef(() => MatchService))
    private readonly matchService: MatchService
  ) { }

  /**
   * Busca a posição do Rei Master varrendo o tabuleiro
   * Se não encontrar (Turno 0), faz fallback para a coordenada armazenada no gameState
   */
  getMasterKingPosition(gameState: GameState, color: 'WHITE' | 'BLACK'): { x: number; y: number; z: number } | null {
    for (let z = 0; z < gameState.dimensions.length; z++) {
      const dim = gameState.dimensions[z];
      if (!dim.isActive) continue;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const piece = dim.grid[y][x];
          if (piece && piece.type === 'KING' && piece.color === color && piece.isMasterKing) {
            return { x, y, z };
          }
        }
      }
    }
    return color === 'WHITE' ? (gameState as any).whiteMasterKing : (gameState as any).blackMasterKing;
  }

  /**
   * Calcula a próxima dimensão válida (modo DYNAMIC)
   * Encontra a dimensão mais baixa que tem um Rei, excluindo uma específica
   */
  getNextValidDimension(gameState: GameState, color: 'WHITE' | 'BLACK', excludeDimension?: number): number | null {
    // Se excludeDimension não foi fornecido, começa do índice 0
    if (excludeDimension === undefined) {
      for (let z = 0; z < gameState.dimensions.length; z++) {
        const dim = gameState.dimensions[z];
        if (!dim.isActive) continue;
        
        // Verifica se há algum Rei desta cor na dimensão
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            const piece = dim.grid[y][x];
            if (piece && piece.type === 'KING' && piece.color === color) {
              return z;
            }
          }
        }
      }
      return null;
    }

    // Se excludeDimension foi fornecido, cicla na sequência: (excludeDimension + 1) % length
    // Isso garante que em 4 dimensões: 0→1→2→3→0, não retorna sempre o índice mais baixo
    for (let offset = 1; offset < gameState.dimensions.length; offset++) {
      const z = (excludeDimension + offset) % gameState.dimensions.length;
      const dim = gameState.dimensions[z];
      if (!dim.isActive) continue;
      
      // Verifica se há algum Rei desta cor na dimensão
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const piece = dim.grid[y][x];
          if (piece && piece.type === 'KING' && piece.color === color) {
            return z;
          }
        }
      }
    }
    return null;
  }

  /**
   * Helper: Verifica se uma peça em uma posição pode atacar uma posição alvo
   */
  private canPieceAttackPosition(
    gameState: GameState,
    attackerPos: { x: number; y: number; z: number },
    piece: any,
    targetPos: { x: number; y: number; z: number }
  ): boolean {
    const intent: MoveIntent = { 
      from: attackerPos, 
      to: targetPos, 
      piece 
    };

    try {
      // Usa o validador apropriado para a peça
      if (piece.type === 'PAWN') {
        const validator = new PawnValidator();
        validator.validate(intent, gameState);
      } else if (piece.type === 'BISHOP') {
        const validator = new BishopValidator();
        validator.validate(intent, gameState);
      } else if (piece.type === 'ROOK') {
        const validator = new RookValidator();
        validator.validate(intent, gameState);
      } else if (piece.type === 'QUEEN') {
        const validator = new QueenValidator();
        validator.validate(intent, gameState);
      } else if (piece.type === 'KING') {
        const validator = new KingValidator();
        validator.validate(intent, gameState);
      } else if (piece.type === 'KNIGHT') {
        const validator = new KnightValidator();
        validator.validate(intent, gameState);
      }
      // Se nenhum erro foi lançado, o movimento é válido
      return true;
    } catch (error: any) {
      // O validador lançou um erro, portanto o movimento não é válido
      return false;
    }
  }

  /**
   * Verifica se algum rei de uma determinada cor está em xeque
   */
  getCheckData(
    gameState: GameState,
    kingColor: 'WHITE' | 'BLACK'
  ): { kingsInCheck: { x: number; y: number; z: number }[]; attackers: { x: number; y: number; z: number }[] } | null {
    if (!gameState) return null;

    const opponentColor = kingColor === 'WHITE' ? 'BLACK' : 'WHITE';
    const kingPositions: { x: number; y: number; z: number }[] = [];

    // 1. Encontra todas as posições dos reis da cor em questão
    gameState.dimensions.forEach((dim, z) => {
      if (!dim.isActive) return;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const piece = dim.grid[y][x];
          if (piece && piece.type === 'KING' && piece.color === kingColor) {
            kingPositions.push({ x, y, z });
          }
        }
      }
    });

    if (kingPositions.length === 0) return null;

    const kingsInCheck: { x: number; y: number; z: number }[] = [];
    const attackers: { x: number; y: number; z: number }[] = [];

    // 2. Varre todas as peças do oponente para ver se alguma pode atacar um dos reis
    for (let z = 0; z < gameState.dimensions.length; z++) {
      const dim = gameState.dimensions[z];
      if (!dim.isActive) continue;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const piece = dim.grid[y][x];
          if (piece && piece.color === opponentColor) {
            const from = { x, y, z };
            // Verifica se esta peça pode atacar algum dos reis
            const canAttack = kingPositions.some(kingPos => 
              this.canPieceAttackPosition(gameState, from, piece, kingPos)
            );
            
            if (canAttack) {
              // Encontra qual(is) rei(s) esta peça pode atacar
              kingPositions.forEach(kingPos => {
                if (this.canPieceAttackPosition(gameState, from, piece, kingPos)) {
                  if (!kingsInCheck.some(k => k.x === kingPos.x && k.y === kingPos.y && k.z === kingPos.z)) {
                    kingsInCheck.push(kingPos);
                  }
                }
              });
              attackers.push(from);
            }
          }
        }
      }
    }

    if (kingsInCheck.length > 0) {
      return { kingsInCheck, attackers };
    }

    return null;
  }

  async processMove(
    matchId: string,
    userId: string,
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number }
  ) {
    const match = await this.matchService.findMatchById(matchId);
    if (!match) throw new BadRequestException('Partida não encontrada.');

    // Tratamos o estado do banco conforme sua tipagem
    const gameState = match.gameState as unknown as GameState;

    const currentDimension = gameState.dimensions[from.z];
    if (!currentDimension || !currentDimension.isActive) {
      throw new BadRequestException('Esta dimensão está inativa ou colapsada.');
    }

    const piece = currentDimension.grid[from.y][from.x];
    if (!piece) throw new BadRequestException('Nenhuma peça na casa de origem.');

    // Monta a intenção de movimento no padrão que seus Validators esperam
    const intent: MoveIntent = { from, to, piece };

    try {
      // --- SISTEMA AUTORITATIVO DE VALIDADORES (A sua estrutura real!) ---
      if (piece.type === 'PAWN') {
        const pawnValidator = new PawnValidator();
        pawnValidator.validate(intent, gameState);
      }
      else if (piece.type === 'BISHOP') {
        const bishopValidator = new BishopValidator();
        bishopValidator.validate(intent, gameState);
      }
      else if (piece.type === 'ROOK') {
        const rookValidator = new RookValidator();
        rookValidator.validate(intent, gameState);
      }
      else if (piece.type === 'QUEEN') {
        const rookValidator = new QueenValidator();
        rookValidator.validate(intent, gameState);
      }
      else if (piece.type === 'KING') {
        const rookValidator = new KingValidator();
        rookValidator.validate(intent, gameState);
      }
      else if (piece.type === 'KNIGHT') {
        const rookValidator = new KnightValidator();
        rookValidator.validate(intent, gameState);
      }
      // Outras peças continuam passando direto até você criar os arquivos .ts delas

    } catch (error: any) {
      // Captura o "throw new Error" lançado dentro dos seus validadores
      // e transforma na BadRequestException que o NestJS usa para enviar pro Front
      throw new BadRequestException(error.message);
    }

    // --- EXECUÇÃO DO MOVIMENTO (Apenas se o validador não jogou um erro) ---
    currentDimension.grid[from.y][from.x] = null;
    gameState.dimensions[to.z].grid[to.y][to.x] = piece;

    // Gerenciamento de histórico e turnos...
    if (!(gameState as any).moveHistory) (gameState as any).moveHistory = [];
    (gameState as any).moveHistory.push({ color: piece.color, piece: piece.type, from, to });

    gameState.actionsRemaining -= 1;
    if (gameState.actionsRemaining <= 0) {
      gameState.turn = gameState.turn === 'WHITE' ? 'BLACK' : 'WHITE';
      gameState.actionsRemaining = (gameState as any).maxActionsPerTurn || 2;
    }

    return { updatedState: gameState, events: [{ type: 'MOVE', piece: piece.type, from, to }] };
  }
}