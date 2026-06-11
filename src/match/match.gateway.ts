// src/match/match.gateway.ts
import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket,
  MessageBody
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MatchService } from './match.service';
import { QuantumEngineService } from './engine/quantum-engine.service';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:5173', // Removida a barra opcional no final para evitar incompatibilidade de CORS
    credentials: true,
  },
  namespace: 'match'
})
export class MatchGateway {
  @WebSocketServer() server!: Server;

  constructor(
    private readonly matchService: MatchService,
    private readonly engineService: QuantumEngineService
  ) { }

  /**
   * Conecta o jogador à sala da partida e envia o estado inicial do tabuleiro
   */
  @SubscribeMessage('join_match')
  async handleJoinMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string }
  ) {
    console.log(`📬 [GATEWAY] Usuário solicitou entrar na partida com ID: "${data.matchId}"`);
    client.join(data.matchId);

    try {
      const match = await this.matchService.findMatchById(data.matchId);

      if (match) {
        console.log(`🎯 [PRISMA] Partida encontrada com sucesso! Enviando tabuleiro...`);
        client.emit('match_updated', {
          gameState: match.gameState,
          events: []
        });
      } else {
        console.warn(`❌ [PRISMA] Alerta: Nenhuma partida foi encontrada no banco com o ID: "${data.matchId}"`);
        client.emit('move_rejected', { message: 'Partida não encontrada no banco.' });
      }
    } catch (error: any) {
      console.error('Erro ao buscar partida:', error.message);
    }
  }

  /**
   * Processa a intenção de movimento de um jogador, valida na engine e transmite o resultado
   */
  @SubscribeMessage('player_move')
  async handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; from: any; to: any }
  ) {
    const userId = client.handshake.auth.userId;

    try {
      // 1. Processa o movimento na engine e retorna o novo estado + eventos
      const { updatedState, events } = await this.engineService.processMove(data.matchId, userId, data.from, data.to);

      // 2. Salva o novo estado de forma assíncrona no banco via Prisma (Usando 2 argumentos)
      await this.matchService.updateMatchState(data.matchId, updatedState);

      // 3. Transmite o novo estado e os eventos visuais para TODOS os jogadores conectados nesta partida
      this.server.to(data.matchId).emit('match_updated', { gameState: updatedState, events });

    } catch (error: any) {
      client.emit('move_rejected', { message: error.message });
    }
  }

  /**
   * Reseta a partida para o estado inicial com todas as peças no tabuleiro
   */
  @SubscribeMessage('reset_match')
  async handleResetMatch(@MessageBody() data: { matchId: string }) {
    console.log(`🔄 [GATEWAY] Solicitação de Reset recebida para a partida: "${data.matchId}"`);

    // Array auxiliar para reconstruir as fileiras traseiras das 4 dimensões
    const BACK_ROW_TYPES = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];

    // Montagem dinâmica do estado limpo com todas as peças posicionadas (idêntico ao injector.js)
    const cleanState = {
      dimensions: Array.from({ length: 4 }, (_, z) => ({
        level: z,
        isActive: true,
        grid: Array.from({ length: 8 }, (_, y) =>
          Array.from({ length: 8 }, (_, x) => {
            // --- Peças Brancas ---
            if (y === 0) return { id: `w-${BACK_ROW_TYPES[x].toLowerCase()}-${x}-z${z}`, type: BACK_ROW_TYPES[x], color: 'WHITE' };
            if (y === 1) return { id: `w-pawn-${x}-z${z}`, type: 'PAWN', color: 'WHITE' };

            // --- Peças Pretas ---
            if (y === 6) return { id: `b-pawn-${x}-z${z}`, type: 'PAWN', color: 'BLACK' };
            if (y === 7) return { id: `b-${BACK_ROW_TYPES[x].toLowerCase()}-${x}-z${z}`, type: BACK_ROW_TYPES[x], color: 'BLACK' };

            return null;
          })
        )
      })),
      turn: 'WHITE',
      actionsRemaining: 2,
      winnerId: null,
      moveHistory: [] // Limpa completamente o painel de histórico lateral
    };

    try {
      await this.matchService.updateMatchState(data.matchId, cleanState);

      // Transmite para todas as abas abertas o tabuleiro resetado em tempo real
      this.server.to(data.matchId).emit('match_updated', { gameState: cleanState, events: [] });
      console.log(`✅ [GATEWAY] Partida resetada com sucesso no PostgreSQL e atualizada no Front!`);
    } catch (error: any) {
      console.error('❌ Erro ao resetar a partida no banco:', error.message);
    }
  }

  @SubscribeMessage('configure_and_reset_match')
  async handleConfigureAndReset(
    @MessageBody() data: {
      matchId: string;
      whitePlayerId: string;
      blackPlayerId: string;
      maxActionsPerTurn: number;
      totalDimensions: number;
    }
  ) {
    const BACK_ROW_TYPES = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];

    const customConfigState = {
      // ADICIONE ESSAS DUAS LINHAS AQUI NA RAIZ DO OBJETO:
      whitePlayerId: data.whitePlayerId,
      blackPlayerId: data.blackPlayerId,

      dimensions: Array.from({ length: data.totalDimensions }, (_, z) => ({
        level: z,
        isActive: true,
        grid: Array.from({ length: 8 }, (_, y) =>
          Array.from({ length: 8 }, (_, x) => {
            if (y === 0) return { id: `w-${BACK_ROW_TYPES[x].toLowerCase()}-${x}-z${z}`, type: BACK_ROW_TYPES[x], color: 'WHITE' };
            if (y === 1) return { id: `w-pawn-${x}-z${z}`, type: 'PAWN', color: 'WHITE' };
            if (y === 6) return { id: `b-pawn-${x}-z${z}`, type: 'PAWN', color: 'BLACK' };
            if (y === 7) return { id: `b-${BACK_ROW_TYPES[x].toLowerCase()}-${x}-z${z}`, type: BACK_ROW_TYPES[x], color: 'BLACK' };
            return null;
          })
        )
      })),
      turn: 'WHITE',
      actionsRemaining: data.maxActionsPerTurn,
      maxActionsPerTurn: data.maxActionsPerTurn,
      winnerId: null,
      moveHistory: []
    };

    await this.matchService.updateMatchState(data.matchId, customConfigState);
    this.server.to(data.matchId).emit('match_updated', { gameState: customConfigState, events: [] });
  }
}