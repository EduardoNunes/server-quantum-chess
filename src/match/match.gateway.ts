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
  @WebSocketServer() server!: Server;

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
    @MessageBody() data: { matchId: string; from: any; to: any; promotionType?: string }
  ) {
    const userId = client.handshake.auth.userId;
    console.log(`♟️ [GATEWAY] Tentativa de movimento de ${userId} na partida ${data.matchId}`);

    try {
      // 1. Delega TODA a regra de negócio para o Service
      const result = await this.matchService.executePlayerMove(userId, data);

      // 2. Emite o novo estado para a sala
      this.server.to(data.matchId).emit('match_updated', {
        gameState: result.gameState,
        events: result.events
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
      this.server.to(match.id).emit('match_updated', { gameState, events: [] });

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
      this.server.to(match.id).emit('match_updated', { gameState, events: [{ type: 'MATE', payload: {} }] });

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
      this.server.to(match.id).emit('match_updated', { gameState, events: [{ type: 'RESIGN', payload: { loserId: userId } }] });

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
      this.server.to(match.id).emit('match_updated', { gameState, events: [] });

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
    this.server.to(match.id).emit('match_updated', { gameState: resetedState, events: [] });
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
      modality: 'CLASSIC' | 'DYNAMIC';
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

    this.server.to(data.matchId).emit('match_updated', { gameState: newGameState, events: [] });

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
      this.server.to(match.id).emit('match_updated', { gameState, events: [{ type: 'DRAW', payload: { reason: data.reason } }] });

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
}