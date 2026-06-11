// src/match/engine/quantum-engine.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { MatchService } from '../match.service';

// Importações corretas da sua arquitetura existente:
import { PawnValidator } from './core/validators/PawnValidator';
import { RookValidator } from './core/validators/RookValidator';
import { MoveIntent, GameState } from './core/types'; // Ajuste o path conforme seu projeto
import { BishopValidator } from './core/validators/BishopValidator';
import { KingValidator, QueenValidator } from './core/validators/KingAndQueenValidator';
import { KnightValidator } from './core/validators/KnightValidator';

@Injectable()
export class QuantumEngineService {
  constructor(private readonly matchService: MatchService) { }

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