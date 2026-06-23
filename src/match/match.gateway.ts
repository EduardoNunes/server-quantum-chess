// src/match/match.gateway.ts
import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket,
  MessageBody
} from '@nestjs/websockets';
import { Namespace, Server, Socket } from 'socket.io';
import { MatchService } from './match.service';
import { QuantumEngineService } from './engine/quantum-engine.service';
import { Match } from '@prisma/client';

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:5173',
      'https://multimensional-chess.netlify.app',
      'https://www.multimensional-chess.netlify.app'
    ],
    credentials: true,
  },
  namespace: 'match'
})
export class MatchGateway {
  @WebSocketServer() server!: Namespace;

  constructor(
    private readonly matchService: MatchService,
    private readonly engineService: QuantumEngineService
  ) {
  }

  /**
   * Conecta o jogador à sala da partida e envia o estado inicial do tabuleiro
   */
  @SubscribeMessage('join_match')
  async handleJoinMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string }
  ) {
    client.join(data.matchId);
    const userId = client.handshake.auth.userId;

    try {
      const match = await this.matchService.joinMatch(data.matchId, userId);

      // Proteção defensiva: garante que o estado vindo do banco seja tratado como objeto
      const parsedGameState = typeof match.gameState === 'string'
        ? JSON.parse(match.gameState)
        : match.gameState;

      // Injeta os nomes com segurança
      const gameStateComNomes = {
        ...(parsedGameState as any),
        whitePlayerName: match.whitePlayer?.username || null,
        blackPlayerName: match.blackPlayer?.username || null,
      };

      this.server.to(data.matchId).emit('match_updated', {
        gameState: gameStateComNomes,
        moveHistory: match.moveHistory,
        events: []
      });

      const matches = await this.matchService.getActiveMatches();
      this.server.emit('lobby_matches', matches);
      this.broadcastSpectatorCount(data.matchId);

    } catch (err: any) {
      client.emit('move_rejected', { message: err.message });
    }
  }

  // Hook nativo de desconexão
  handleDisconnect(client: Socket) {
    // O Socket.io remove o cliente das salas automaticamente,
    // mas precisamos saber qual sala ele estava para atualizar os outros
    const rooms = Array.from(client.rooms);
    rooms.forEach(roomId => {
      // roomId é igual ao matchId, assumindo que você não usa o ID do socket como sala
      if (roomId !== client.id) {
        this.broadcastSpectatorCount(roomId);
      }
    });
  }

  /**
   * Processa a intenção de movimento tradicional de um jogador (Bloqueado no Turno 0)
   */
  @SubscribeMessage('player_move')
  async handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; from: any; to: any; promotionType?: string }
  ) {
    const userId = client.handshake.auth.userId;
    console.log(`♟️ [GATEWAY] Tentativa de movimento de ${userId} na partida ${data.matchId}`);

    try {
      // 1. Delega TODA a regra de negócio para o Service
      const result = await this.matchService.executePlayerMove(userId, data);
      const updatedMatch = await this.matchService.findMatchById(data.matchId);

      // 2. Emite o novo estado para a sala
      this.server.to(data.matchId).emit('match_updated', {
        gameState: result.gameState,
        events: result.events,
        moveHistory: updatedMatch?.moveHistory
      });

    } catch (err: any) {
      console.warn(`❌ [GATEWAY] Movimento Rejeitado: ${err.message}`);
      // 3. Devolve o erro apenas para quem tentou jogar
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

      // Registra a coordenada do Rei Master baseado no jogador correspondente e marca a peça
      if (isWhite) {
        if (gameState.whiteMasterKing) throw new Error('Seu Rei Master já foi consagrado nesta linha temporal.');
        gameState.whiteMasterKing = data.coord;
        piece.isMasterKing = true;
        console.log(`✨ Rei Master Branco fixado em: (${data.coord.x}, ${data.coord.y}, Dimensão: ${data.coord.z + 1})`);
      } else {
        if (gameState.blackMasterKing) throw new Error('Seu Rei Master já foi consagrado nesta linha temporal.');
        gameState.blackMasterKing = data.coord;
        piece.isMasterKing = true;
        console.log(`✨ Rei Master Preto fixado em: (${data.coord.x}, ${data.coord.y}, Dimensão: ${data.coord.z + 1})`);
      }

      if (gameState.whiteMasterKing && gameState.blackMasterKing) {
        if (gameState.modality === 'DYNAMIC') {
          let found = false;
          let actionsCount = 0;
          for (let z = 0; z < gameState.dimensions.length; z++) {
            const dimActive = gameState.dimensions[z].grid.some((row: any[]) => row.some((p: any) => p && p.type === 'KING' && p.color === 'WHITE'));
            if (dimActive) {
              if (!found) {
                gameState.activeDimensionIndex = z;
                found = true;
              }
              actionsCount++;
            }
          }
          if (!found) gameState.activeDimensionIndex = 0;
          gameState.actionsRemaining = actionsCount;
        } else {
          gameState.actionsRemaining = 1;
        }
      }

      // Atualiza o banco e repassa o estado modificado para travar/destravar a tela no front
      await this.matchService.updateMatchState(match.id, gameState);
      this.server.to(match.id).emit('match_updated', { gameState, events: [], moveHistory: match.moveHistory });

    } catch (err: any) {
      console.error(`❌ [GATEWAY ERROR] Falha na consagração: ${err.message}`);
      client.emit('move_rejected', { message: err.message });
    }
  }

  /**
   * NOVO EVENTO: Declaração de Xeque-Mate
   */
  @SubscribeMessage('checkmate')
  async handleCheckmate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; winnerId: string | null }
  ) {
    console.log(`👑☠️ [GATEWAY] Xeque-Mate reportado na partida ${data.matchId}. Vencedor: ${data.winnerId}`);
    try {
      const match = await this.matchService.findMatchById(data.matchId);
      if (!match) throw new Error('Partida não encontrada.');

      const gameState = match.gameState as any;
      if (gameState.status === 'COMPLETED') return; // Evita processamento duplicado

      gameState.status = 'COMPLETED';
      gameState.winnerId = data.winnerId;

      await this.matchService.updateMatchState(match.id, gameState);
      this.server.to(match.id).emit('match_updated', { gameState, events: [{ type: 'MATE', payload: {} }], moveHistory: match.moveHistory });

      const matches = await this.matchService.getActiveMatches();
      this.server.emit('lobby_matches', matches);
    } catch (err: any) {
      console.error(`❌ [GATEWAY ERROR] Falha ao processar Xeque-Mate: ${err.message}`);
    }
  }

  /**
   * NOVO EVENTO: Desistência da Partida
   */
  @SubscribeMessage('resign_match')
  async handleResign(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string }
  ) {
    const userId = client.handshake.auth.userId;
    console.log(`🏳️ [GATEWAY] Jogador ${userId} desistiu da partida ${data.matchId}.`);

    try {
      const match = await this.matchService.findMatchById(data.matchId);
      if (!match) throw new Error('Partida não encontrada.');

      const gameState = match.gameState as any;
      if (gameState.status === 'COMPLETED') return;

      const isWhite = String(userId).trim() === String(match.whitePlayerId).trim();
      const isBlack = String(userId).trim() === String(match.blackPlayerId).trim();

      if (!isWhite && !isBlack) {
        throw new Error('Você não faz parte desta partida para desistir.');
      }

      gameState.status = 'COMPLETED';
      gameState.winnerId = isWhite ? match.blackPlayerId : match.whitePlayerId;
      gameState.reason = 'RESIGNATION';

      await this.matchService.updateMatchState(match.id, gameState);
      this.server.to(match.id).emit('match_updated', { gameState, events: [{ type: 'RESIGN', payload: { loserId: userId } }], moveHistory: match.moveHistory });

      const matches = await this.matchService.getActiveMatches();
      this.server.emit('lobby_matches', matches);
    } catch (err: any) {
      console.error(`❌ [GATEWAY ERROR] Falha ao processar desistência: ${err.message}`);
    }
  }

  /**
   * NOVO EVENTO: Cancelar partida
   */
  @SubscribeMessage('cancel_match')
  async handleCancelMatch(@MessageBody() data: { matchId: string }) {
    console.log(`❌ [GATEWAY] Cancelando partida: "${data.matchId}"`);
    try {
      const match = await this.matchService.findMatchById(data.matchId);
      if (!match) return;

      const gameState = match.gameState as any;
      gameState.status = 'COMPLETED';
      gameState.reason = 'CANCELLED';

      await this.matchService.updateMatchState(match.id, gameState);
      this.server.to(match.id).emit('match_updated', { gameState, events: [], moveHistory: match.moveHistory });

      const matches = await this.matchService.getActiveMatches();
      this.server.emit('lobby_matches', matches);
    } catch (err: any) {
      console.error(`❌ [GATEWAY ERROR] Falha ao cancelar partida: ${err.message}`);
    }
  }

  /**
   * Reseta a partida para o estado inicial com todas as peças no tabuleiro
   */
  @SubscribeMessage('request_reset')
  async handleRequestReset(
    @MessageBody() data: { matchId: string },
    @ConnectedSocket() client: Socket
  ) {
    const match = await this.matchService.findMatchById(data.matchId);
    if (!match) return;

    const userId = client.handshake.auth.userId;
    const isPlayer = match.whitePlayerId === userId || match.blackPlayerId === userId;

    // 1. Bloqueia visitantes
    if (!isPlayer) {
      console.warn(`🛑 Visitante ${userId} tentou solicitar reset na partida ${data.matchId}.`);
      return;
    }

    console.log(`🔄 [GATEWAY] Jogador ${userId} solicitou o reset da partida: "${data.matchId}"`);

    // 2. Avisa a sala (ou o adversário) que um reset foi solicitado
    // O frontend deve escutar esse evento para mostrar um modal de "Aceitar/Recusar" para o adversário
    this.server.to(match.id).emit('reset_requested', { requestedBy: userId });
  }

  @SubscribeMessage('accept_reset')
  async handleAcceptReset(
    @MessageBody() data: { matchId: string },
    @ConnectedSocket() client: Socket
  ) {
    const match = await this.matchService.findMatchById(data.matchId);
    if (!match) return;

    const userId = client.handshake.auth.userId;
    const isPlayer = match.whitePlayerId === userId || match.blackPlayerId === userId;

    // 1. Bloqueia visitantes (garante que um visitante não forje o evento de aceite)
    if (!isPlayer) {
      console.warn(`🛑 Visitante ${userId} tentou forçar o aceite do reset na partida ${data.matchId}.`);
      return;
    }

    console.log(`✅ [GATEWAY] Reset aceito na partida: "${data.matchId}". Reiniciando tabuleiro...`);

    // 2. Executa a lógica original de reset
    const gameState = match.gameState as any;
    const currentDimensionsCount = gameState.dimensions?.length || 4;

    gameState.whiteMasterKing = currentDimensionsCount === 1 ? { x: 4, y: 0, z: 0 } : null;
    gameState.blackMasterKing = currentDimensionsCount === 1 ? { x: 4, y: 7, z: 0 } : null;
    gameState.turn = 'WHITE';
    gameState.actionsRemaining = gameState.modality === 'CLASSIC' ? 1 : currentDimensionsCount;
    if (gameState.modality === 'DYNAMIC') gameState.activeDimensionIndex = 0;
    gameState.moveHistory = [];
    gameState.eliminatedPieces = [];
    gameState.halfMoveClock = 0;
    gameState.stateHashes = {};

    const resetedState = await this.matchService.executeGridReset(match.id, gameState);

    await this.matchService.updateMatchState(match.id, resetedState);

    // 3. Emite o novo estado para todos e limpa os alertas de reset no frontend
    this.server.to(match.id).emit('match_updated', { gameState: resetedState, events: [], moveHistory: resetedState.moveHistory });
    this.server.to(match.id).emit('reset_completed');
  }

  @SubscribeMessage('decline_reset')
  async handleDeclineReset(
    @MessageBody() data: { matchId: string },
    @ConnectedSocket() client: Socket
  ) {
    const match = await this.matchService.findMatchById(data.matchId);
    if (!match) return;

    const userId = client.handshake.auth.userId;
    const isPlayer = match.whitePlayerId === userId || match.blackPlayerId === userId;

    if (!isPlayer) return;

    console.log(`❌ [GATEWAY] Reset recusado na partida: "${data.matchId}"`);

    // Avisa a sala que o pedido foi cancelado (frontend fecha os modais de aguardando/aceitar)
    this.server.to(match.id).emit('reset_declined');
  }

  /**
   * Configuração inicial e geração do Universo Multidimensional
   */
  @SubscribeMessage('configure_and_reset_match')
  async handleConfigureAndReset(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      matchId: string;
      whitePlayerId: string | null;
      blackPlayerId: string | null;
      whitePlayerName?: string;
      blackPlayerName?: string;
      modality: 'TRADITIONAL' | 'CLASSIC' | 'DYNAMIC';
      totalDimensions: number;
    }
  ) {
    console.log(`🌌 [GATEWAY] Colapsando e Configurando Novo Universo para a partida: "${data.matchId}"`);

    const existingMatch = await this.matchService.findMatchById(data.matchId);
    if (existingMatch && existingMatch.status !== 'WAITING_FOR_OPPONENT') {
      console.warn(`⚠️ [GATEWAY] Tentativa de reconfigurar partida já em andamento rejeitada: ${data.matchId}`);
      return;
    }

    const BACK_ROW_TYPES = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];

    // 💡 NOTA TÁTICA DE INICIALIZAÇÃO: Toda partida recém-gerada obrigatoriamente inicia com as variáveis em NULL
    const newGameState = {
      turn: 'WHITE',
      modality: data.modality || 'CLASSIC',
      activeDimensionIndex: data.modality === 'DYNAMIC' ? 0 : undefined,
      actionsRemaining: data.modality === 'CLASSIC' ? 1 : data.totalDimensions,
      status: (!data.whitePlayerId || !data.blackPlayerId) ? 'WAITING_FOR_OPPONENT' : 'ONGOING',
      whitePlayerId: data.whitePlayerId,
      blackPlayerId: data.blackPlayerId,
      whiteMasterKing: data.totalDimensions === 1 ? { x: 4, y: 0, z: 0 } : null,
      blackMasterKing: data.totalDimensions === 1 ? { x: 4, y: 7, z: 0 } : null,
      moveHistory: [],
      eliminatedPieces: [],
      halfMoveClock: 0,
      stateHashes: {},
      dimensions: Array.from({ length: data.totalDimensions }).map((_, z) => ({
        level: z,
        isActive: true,
        grid: Array.from({ length: 8 }).map((_, y) =>
          Array.from({ length: 8 }).map((__, x) => {
            // Inicializa Peões nas fileiras 1 e 6 com ID único
            if (y === 1) return { id: `pawn-white-z${z}-x${x}`, type: 'PAWN', color: 'WHITE', hasMoved: false };
            if (y === 6) return { id: `pawn-black-z${z}-x${x}`, type: 'PAWN', color: 'BLACK', hasMoved: false };

            // Inicializa peças maiores nas fileiras traseiras 0 e 7 com ID único
            if (y === 0) return { id: `${BACK_ROW_TYPES[x].toLowerCase()}-white-z${z}-x${x}`, type: BACK_ROW_TYPES[x], color: 'WHITE', hasMoved: false, isMasterKing: BACK_ROW_TYPES[x] === 'KING' && data.totalDimensions === 1 };
            if (y === 7) return { id: `${BACK_ROW_TYPES[x].toLowerCase()}-black-z${z}-x${x}`, type: BACK_ROW_TYPES[x], color: 'BLACK', hasMoved: false, isMasterKing: BACK_ROW_TYPES[x] === 'KING' && data.totalDimensions === 1 };

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

    // Conecta o criador automaticamente à sala no backend para receber as atualizações sem gerar race conditions
    client.join(data.matchId);

    this.server.to(data.matchId).emit('match_updated', { gameState: newGameState, events: [], moveHistory: newGameState.moveHistory });

    const matches = await this.matchService.getActiveMatches();
    this.server.emit('lobby_matches', matches);
  }

  /**
   * NOVO EVENTO: Declaração de Empate por Material Insuficiente
   */
  @SubscribeMessage('draw_match')
  async handleDraw(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; reason: string }
  ) {
    console.log(`🤝 [GATEWAY] Empate reportado na partida ${data.matchId}. Motivo: ${data.reason}`);
    try {
      const match = await this.matchService.findMatchById(data.matchId);
      if (!match) throw new Error('Partida não encontrada.');

      const gameState = match.gameState as any;
      if (gameState.status === 'COMPLETED') return; // Evita processamento duplicado

      gameState.status = 'COMPLETED';
      gameState.winnerId = null;
      gameState.reason = data.reason;

      await this.matchService.updateMatchState(match.id, gameState);
      this.server.to(match.id).emit('match_updated', { gameState, events: [{ type: 'DRAW', payload: { reason: data.reason } }], moveHistory: match.moveHistory });

      const matches = await this.matchService.getActiveMatches();
      this.server.emit('lobby_matches', matches);
    } catch (err: any) {
      console.error(`❌ [GATEWAY ERROR] Falha ao processar Empate: ${err.message}`);
    }
  }

  /**
   * Solicita a listagem de partidas para exibir no Lobby / Setup
   */
  @SubscribeMessage('request_lobby_matches')
  async handleRequestLobbyMatches(@ConnectedSocket() client: Socket) {
    const matches = await this.matchService.getActiveMatches();
    client.emit('lobby_matches', matches);
  }

  @SubscribeMessage('send_chat_message')
  handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { matchId: string; message: any },
  ) {
    // Validação básica de segurança
    if (!data.matchId || !data.message) return;

    // O método `client.to(room).emit()` transmite o evento para todos os sockets 
    // inscritos na sala (matchId), EXCETO para o socket que enviou a mensagem original.
    // Isso é perfeito porque o nosso front-end já fez a atualização otimista localmente.
    client.to(data.matchId).emit('chat_message', data.message);
  }

  private async broadcastSpectatorCount(matchId: string) {
    const room = this.server.adapter.rooms.get(matchId);
    if (!room) return;

    // A contagem total na sala (jogadores + espectadores)
    const totalClients = room.size;

    // Opcional: Se quiser a contagem EXATA de apenas espectadores, 
    // você precisaria subtrair 2 (se a partida estiver em andamento e ambos conectados).
    // Mas, manter "Espectadores + Jogadores" é o padrão comum em plataformas de xadrez.

    this.server.to(matchId).emit('spectator_count_updated', { count: totalClients });
  }

  // Hook nativo de conexão
  async handleConnection(client: Socket) {
    const matchId = client.handshake.query.matchId as string;
    if (matchId) {
      client.join(matchId);

      // Pequeno atraso para garantir que o adaptador do socket.io reconheça a sala
      setTimeout(() => {
        this.broadcastSpectatorCount(matchId);
      }, 500);
    }
  }

  @SubscribeMessage('request_analysis_data')
  async handleRequestAnalysis(@MessageBody() data: { matchId: string }) {
    // Gera todos os estados de uma vez só
    const historyStates = await this.matchService.generateReplayStates(data.matchId);
    // Envia para o front-end
    this.server.to(data.matchId).emit('analysis_data', historyStates);
  }
}