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
    origin: 'http://localhost:5173', // Sem a barra no final para evitar conflitos estritos de CORS
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

    const userId = client.handshake.auth.userId;

    try {
      // Aciona o Service para Ingressar na partida, preencher a vaga livre e alterar status para ONGOING
      const match = await this.matchService.joinMatch(data.matchId, userId);

      // Emite o estado atualizado PARA TODOS DA SALA (o que destrava o fluxo para o Turno 0 simultaneamente)
      this.server.to(data.matchId).emit('match_updated', { gameState: match.gameState, events: [] });

      // Atualiza o Lobby
      const matches = await this.matchService.getActiveMatches();
      this.server.emit('lobby_matches', matches);
    } catch (err: any) {
      console.error(`❌ [GATEWAY ERROR] Erro no join_match: ${err.message}`);
      client.emit('move_rejected', { message: err.message });
    }
  }

  /**
   * Processa a intenção de movimento tradicional de um jogador (Bloqueado no Turno 0)
   */
  @SubscribeMessage('player_move')
  async handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; from: any; to: any }
  ) {
    const userId = client.handshake.auth.userId;
    console.log(`... [GATEWAY] Tentativa de movimento de ${userId} na partida ${data.matchId}`);

    try {
      const match = await this.matchService.findMatchById(data.matchId);
      if (!match) throw new Error('Partida não encontrada.');

      const gameState = match.gameState as any;

      // 🚨 TRAVA DO TURNO 0: Impede qualquer movimento se os Reis Master não foram escolhidos
      if (!gameState.whiteMasterKing || !gameState.blackMasterKing) {
        throw new Error('Bloqueio Quântico: A partida não pode começar antes que ambos os jogadores consagrem seus Reis Master.');
      }

      // Executa a movimentação delegando à Engine Service Autoritativa
      // CORREÇÃO: Passando o ID da partida (string) e não o objeto match inteiro
      const result = await this.engineService.processMove(match.id, userId, data.from, data.to);

      // Salva o novo estado gerado e sincroniza com a sala inteira
      await this.matchService.updateMatchState(match.id, result.updatedState);
      this.server.to(match.id).emit('match_updated', {
        gameState: result.updatedState,
        events: result.events
      });

    } catch (err: any) {
      console.error(`❌ [GATEWAY ERROR] Movimento Rejeitado: ${err.message}`);
      client.emit('move_rejected', { message: err.message });
    }
  }

  /**
   * NOVO EVENTO: Seleção e Consagração do Rei Master (Turno 0)
   */
  @SubscribeMessage('select_master_king')
  async handleSelectMasterKing(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; coord: { x: number; y: number; z: number } }
  ) {
    const userId = client.handshake.auth.userId;
    console.log(`👑 [GATEWAY] Solicitação de consagração de Rei recebida de ${userId} na coordenada:`, data.coord);

    try {
      const match = await this.matchService.findMatchById(data.matchId);
      if (!match) throw new Error('Partida não encontrada.');

      const gameState = match.gameState as any;
      const isWhite = String(userId).trim() === String(match.whitePlayerId).trim();
      const isBlack = String(userId).trim() === String(match.blackPlayerId).trim();

      if (!isWhite && !isBlack) {
        throw new Error('Você não faz parte desta partida para consagrar um Rei.');
      }

      // Valida se o espaço existe na dimensão alvo
      const targetDimension = gameState.dimensions[data.coord.z];
      const piece = targetDimension?.grid[data.coord.y][data.coord.x];

      // Garante que o clique foi exatamente em cima de um Rei da cor do jogador local
      if (!piece || piece.type !== 'KING') {
        throw new Error('Alvo inválido. Você deve selecionar um de seus REIS.');
      }

      if ((isWhite && piece.color !== 'WHITE') || (isBlack && piece.color !== 'BLACK')) {
        throw new Error('Alvo inválido. Você só pode consagrar um Rei do seu próprio exército.');
      }

      // Registra a coordenada imutável do Rei Master baseado no jogador correspondente
      if (isWhite) {
        if (gameState.whiteMasterKing) throw new Error('Seu Rei Master já foi consagrado nesta linha temporal.');
        gameState.whiteMasterKing = data.coord;
        console.log(`✨ Rei Master Branco fixado em: (${data.coord.x}, ${data.coord.y}, Dimensão: ${data.coord.z + 1})`);
      } else {
        if (gameState.blackMasterKing) throw new Error('Seu Rei Master já foi consagrado nesta linha temporal.');
        gameState.blackMasterKing = data.coord;
        console.log(`✨ Rei Master Preto fixado em: (${data.coord.x}, ${data.coord.y}, Dimensão: ${data.coord.z + 1})`);
      }

      // Atualiza o banco e repassa o estado modificado para travar/destravar a tela no front
      await this.matchService.updateMatchState(match.id, gameState);
      this.server.to(match.id).emit('match_updated', { gameState, events: [] });

    } catch (err: any) {
      console.error(`❌ [GATEWAY ERROR] Falha na consagração: ${err.message}`);
      client.emit('move_rejected', { message: err.message });
    }
  }

  /**
   * Reseta a partida para o estado inicial com todas as peças no tabuleiro
   */
  @SubscribeMessage('reset_match')
  async handleResetMatch(@MessageBody() data: { matchId: string }) {
    console.log(`🔄 [GATEWAY] Solicitação de Reset recebida para a partida: "${data.matchId}"`);

    const match = await this.matchService.findMatchById(data.matchId);
    if (!match) return;

    const gameState = match.gameState as any;

    // 💡 NOTA TÁTICA DE LIMPEZA: Força o retorno ao Turno 0 ao limpar os registros de Reis consagrados
    gameState.whiteMasterKing = null;
    gameState.blackMasterKing = null;
    gameState.turn = 'WHITE';
    gameState.actionsRemaining = (match as any).maxActionsPerTurn || 3;
    gameState.moveHistory = [];

    // O método interno do seu service cuidará de realocar as peças clássicas nas dimensões ativas
    const resetedState = await this.matchService.executeGridReset(match.id, gameState);

    await this.matchService.updateMatchState(match.id, resetedState);
    this.server.to(match.id).emit('match_updated', { gameState: resetedState, events: [] });
  }

  /**
   * Configuração inicial e geração do Universo Multidimensional
   */
  @SubscribeMessage('configure_and_reset_match')
  async handleConfigureAndReset(
    @MessageBody() data: {
      matchId: string;
      whitePlayerId: string | null;
      blackPlayerId: string | null;
      maxActionsPerTurn: number;
      totalDimensions: number;
    }
  ) {
    console.log(`🌌 [GATEWAY] Colapsando e Configurando Novo Universo para a partida: "${data.matchId}"`);

    const BACK_ROW_TYPES = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];

    // 💡 NOTA TÁTICA DE INICIALIZAÇÃO: Toda partida recém-gerada obrigatoriamente inicia com as variáveis em NULL
    const newGameState = {
      turn: 'WHITE',
      actionsRemaining: data.maxActionsPerTurn,
      maxActionsPerTurn: data.maxActionsPerTurn,
      status: (!data.whitePlayerId || !data.blackPlayerId) ? 'WAITING_FOR_OPPONENT' : 'ONGOING',
      whitePlayerId: data.whitePlayerId,
      blackPlayerId: data.blackPlayerId,
      whiteMasterKing: null,
      blackMasterKing: null,
      moveHistory: [],
      dimensions: Array.from({ length: data.totalDimensions }).map((_, z) => ({
        level: z,
        isActive: true,
        grid: Array.from({ length: 8 }).map((_, y) =>
          Array.from({ length: 8 }).map((__, x) => {
            // Inicializa Peões nas fileiras 1 e 6
            if (y === 1) return { type: 'PAWN', color: 'WHITE' };
            if (y === 6) return { type: 'PAWN', color: 'BLACK' };

            // Inicializa peças maiores nas fileiras traseiras 0 e 7
            if (y === 0) return { type: BACK_ROW_TYPES[x], color: 'WHITE' };
            if (y === 7) return { type: BACK_ROW_TYPES[x], color: 'BLACK' };

            return null;
          })
        )
      }))
    };

    const whitePlayerId = data.whitePlayerId || null;
    const blackPlayerId = data.blackPlayerId || null;

    await this.matchService.updateMatchAndPlayers(
      data.matchId,
      whitePlayerId,
      blackPlayerId,
      newGameState
    );

    this.server.to(data.matchId).emit('match_updated', { gameState: newGameState, events: [] });
  }

  /**
   * Solicita a listagem de partidas para exibir no Lobby / Setup
   */
  @SubscribeMessage('request_lobby_matches')
  async handleRequestLobbyMatches(@ConnectedSocket() client: Socket) {
    const matches = await this.matchService.getActiveMatches();
    client.emit('lobby_matches', matches);
  }
}