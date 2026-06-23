// src/match/match.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // Ajuste o caminho se necessário
import { QuantumEngineService } from './engine/quantum-engine.service';

@Injectable()
export class MatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engineService: QuantumEngineService
  ) { }

  /**
   * Busca uma partida pelo ID no banco de dados
   */
  async findMatchById(matchId: string) {
    return await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        whitePlayer: true, // Traz os dados do usuário das brancas
        blackPlayer: true  // Traz os dados do usuário das pretas
      }
    });
  }

  private createInitialGameState(modality: string, totalDimensions: number) {
    const BACK_ROW_TYPES = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];

    return {
      turn: 'WHITE',
      modality: modality || 'CLASSIC',
      activeDimensionIndex: modality === 'DYNAMIC' ? 0 : undefined,
      actionsRemaining: modality === 'CLASSIC' ? 1 : totalDimensions,
      status: 'ONGOING',
      whiteMasterKing: totalDimensions === 1 ? { x: 4, y: 0, z: 0 } : null,
      blackMasterKing: totalDimensions === 1 ? { x: 4, y: 7, z: 0 } : null,

      // 👇 A CORREÇÃO ESTÁ NESTAS DUAS LINHAS 👇
      moveHistory: [] as any[],
      eliminatedPieces: [] as any[],

      halfMoveClock: 0,
      stateHashes: {},
      dimensions: Array.from({ length: totalDimensions }).map((_, z) => ({
        level: z,
        isActive: true,
        grid: Array.from({ length: 8 }).map((_, y) =>
          Array.from({ length: 8 }).map((__, x) => {
            if (y === 1) return { id: `pawn-white-z${z}-x${x}`, type: 'PAWN', color: 'WHITE', hasMoved: false };
            if (y === 6) return { id: `pawn-black-z${z}-x${x}`, type: 'PAWN', color: 'BLACK', hasMoved: false };
            if (y === 0) return { id: `${BACK_ROW_TYPES[x].toLowerCase()}-white-z${z}-x${x}`, type: BACK_ROW_TYPES[x], color: 'WHITE', hasMoved: false, isMasterKing: BACK_ROW_TYPES[x] === 'KING' && totalDimensions === 1 };
            if (y === 7) return { id: `${BACK_ROW_TYPES[x].toLowerCase()}-black-z${z}-x${x}`, type: BACK_ROW_TYPES[x], color: 'BLACK', hasMoved: false, isMasterKing: BACK_ROW_TYPES[x] === 'KING' && totalDimensions === 1 };
            return null;
          })
        )
      }))
    };
  }

  /**
   * Busca as partidas ativas (aguardando oponente ou em andamento) para listar no Lobby
   */
  async getActiveMatches() {
    return this.prisma.match.findMany({
      where: {
        status: { in: ['WAITING_FOR_OPPONENT', 'ONGOING'] }
      },
      include: {
        whitePlayer: true,
        blackPlayer: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  /**
   * Atualiza o estado do jogo (gameState) no banco de dados
   */
  async updateMatchState(matchId: string, updatedState: any, moveHistory?: any[]) {
    return this.prisma.match.update({
      where: { id: matchId },
      data: {
        gameState: updatedState,
        status: updatedState.status,
        winnerId: updatedState.winnerId,
        // Se moveHistory for uma relação, usamos 'set' para substituir o array inteiro
        moveHistory: moveHistory ? { set: moveHistory } : undefined
      },
    });
  } 

  /**
   * NOVO MÉTODO: Vincula os IDs dos jogadores sorteados e o gameState inicial no banco (GameSetup)
   */
  async updateMatchAndPlayers(
    matchId: string,
    whitePlayerId: string | null,
    blackPlayerId: string | null,
    initialGameState: any
  ) {
    try {
      // 1. Garante que os usuários existam no banco para evitar erro de Chave Estrangeira (Foreign Key)
      if (whitePlayerId) {
        await this.prisma.user.upsert({
          where: { id: whitePlayerId },
          update: {},
          create: { id: whitePlayerId, username: whitePlayerId },
        });
      }

      if (blackPlayerId) {
        await this.prisma.user.upsert({
          where: { id: blackPlayerId },
          update: {},
          create: { id: blackPlayerId, username: blackPlayerId },
        });
      }

      const currentStatus = (!whitePlayerId || !blackPlayerId) ? 'WAITING_FOR_OPPONENT' : 'ONGOING';

      // 2. Cria a partida caso seja um novo ID vindo da URL, ou a atualiza se o universo estiver sendo resetado
      return await this.prisma.match.upsert({
        where: { id: matchId },
        update: {
          whitePlayerId: whitePlayerId,
          blackPlayerId: blackPlayerId,
          status: currentStatus,
          gameState: initialGameState,
          moveHistory: [],
          winnerId: null,
        },
        create: {
          id: matchId,
          whitePlayerId: whitePlayerId,
          blackPlayerId: blackPlayerId,
          status: currentStatus,
          gameState: initialGameState,
          moveHistory: [],
        },
      });
    } catch (error: any) {
      throw new BadRequestException(`Erro ao configurar e inicializar partida: ${error.message}`);
    }
  }

  /**
   * NOVO MÉTODO: Processa a entrada de um jogador na sala, preenchendo a vaga faltante e ativando a partida.
   */
  async joinMatch(matchId: string, userId: string) {
    // 1. Busca inicial com INCLUSÃO dos dados dos jogadores
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        whitePlayer: true,
        blackPlayer: true,
      }
    });

    if (!match) throw new Error('Partida não encontrada joinmatch.');

    let { whitePlayerId, blackPlayerId, status } = match;
    const gameState = match.gameState as any;

    // Se o jogador já está na partida (reconexão)
    if (whitePlayerId === userId || blackPlayerId === userId) {
      return match; // Já retorna com os includes de whitePlayer e blackPlayer
    }

    if (status === 'WAITING_FOR_OPPONENT') {
      // Garante a existência do usuário para Foreign Key
      await this.prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, username: `Player-${userId.split('-')[0]}` },
      });

      if (!whitePlayerId) {
        whitePlayerId = userId;
        gameState.whitePlayerId = userId;
      } else if (!blackPlayerId) {
        blackPlayerId = userId;
        gameState.blackPlayerId = userId;
      }

      if (whitePlayerId && blackPlayerId) {
        status = 'ONGOING';
        gameState.status = 'ONGOING';
      }

      // 2. Atualiza a partida no banco e exige o INCLUDE no retorno
      return await this.prisma.match.update({
        where: { id: matchId },
        data: {
          whitePlayerId,
          blackPlayerId,
          status,
          gameState,
        },
        include: {
          whitePlayer: true,
          blackPlayer: true,
        }
      });
    }

    // Se a partida não estiver mais aguardando oponente, permite a entrada como espectador
    return match; // Retorna a partida já com os includes buscados na primeira linha
  }

  /**
   * NOVO MÉTODO: Limpa e força a reconstrução atômica do grid clássico mantendo as configurações de Turno 0
   */
  async executeGridReset(matchId: string, baseCleanState: any) {
    const BACK_ROW_TYPES = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];

    // Pega o número real de dimensões que a partida atual possui para não resetar com o tamanho errado
    const currentDimensionsCount = baseCleanState.dimensions?.length || 4;

    // Reconstrói as matrizes injetando as 128 peças em seus devidos lugares e IDs quânticos
    const freshDimensions = Array.from({ length: currentDimensionsCount }).map((_, z) => ({
      level: z,
      isActive: true,
      grid: Array.from({ length: 8 }).map((_, y) =>
        Array.from({ length: 8 }).map((__, x) => {
          // Inicializa Peões nas fileiras 1 e 6
          if (y === 1) return { id: `w-pawn-${x}-z${z}`, type: 'PAWN', color: 'WHITE', hasMoved: false };
          if (y === 6) return { id: `b-pawn-${x}-z${z}`, type: 'PAWN', color: 'BLACK', hasMoved: false };

          // Inicializa peças maiores nas fileiras traseiras 0 e 7
          if (y === 0) return { id: `w-${BACK_ROW_TYPES[x].toLowerCase()}-${x}-z${z}`, type: BACK_ROW_TYPES[x], color: 'WHITE', hasMoved: false, isMasterKing: BACK_ROW_TYPES[x] === 'KING' && currentDimensionsCount === 1 };
          if (y === 7) return { id: `b-${BACK_ROW_TYPES[x].toLowerCase()}-${x}-z${z}`, type: BACK_ROW_TYPES[x], color: 'BLACK', hasMoved: false, isMasterKing: BACK_ROW_TYPES[x] === 'KING' && currentDimensionsCount === 1 };

          return null;
        }),
      ),
    }));

    // Acopla o novo grid limpo preservando a limpeza dos Reis Master (retorno ao Turno 0)
    const resetedGameState = {
      ...baseCleanState,
      dimensions: freshDimensions,
    };

    // Auto-consagrar os Reis Master se houver apenas 1 dimensão (Xadrez Tradicional)
    if (currentDimensionsCount === 1) {
      resetedGameState.whiteMasterKing = { x: 4, y: 0, z: 0 };
      resetedGameState.blackMasterKing = { x: 4, y: 7, z: 0 };
      resetedGameState.actionsRemaining = 1;
    }

    return resetedGameState;
  }

  /**
   * Executa a intenção de movimento, valida regras multidimensionais,
   * resolve paradoxos e atualiza o estado da partida.
   */
  // src/match/match.service.ts

  /**
   * MÉTODO DE ENTRADA (O Porteiro): Valida banco de dados, permissões e salva o resultado.
   */
  /**
   * MÉTODO DE ENTRADA (O Porteiro): Valida banco de dados, permissões e salva o resultado.
   */
  /**
   * MÉTODO DE ENTRADA (O Porteiro): Valida banco de dados, permissões e salva o resultado.
   */
  async executePlayerMove(
    userId: string,
    data: { matchId: string; from: any; to: any; promotionType?: string }
  ) {
    const match = await this.findMatchById(data.matchId);
    if (!match) throw new Error('Partida não encontrada.');

    const gameState = match.gameState as any;

    // 1. Validações estritas de Banco/Segurança
    const isWhite = String(userId).trim() === String(match.whitePlayerId).trim();
    const isBlack = String(userId).trim() === String(match.blackPlayerId).trim();

    if (!isWhite && !isBlack) throw new Error('Bloqueio Quântico: Espectadores não podem alterar a linha do tempo.');
    if (!gameState.whiteMasterKing || !gameState.blackMasterKing) {
      throw new Error('Bloqueio Quântico: A partida não pode começar antes da consagração dos Reis Master.');
    }

    const movingPiece = gameState.dimensions[data.from.z]?.grid[data.from.y]?.[data.from.x];
    if (!movingPiece) throw new Error('Peça não encontrada na origem.');
    if (gameState.turn !== movingPiece.color) throw new Error('Bloqueio Quântico: Não é o turno dessa cor.');
    if ((isWhite && movingPiece.color !== 'WHITE') || (isBlack && movingPiece.color !== 'BLACK')) {

      throw new Error('Bloqueio Quântico: Você só pode controlar o seu próprio exército.');
    }

    // 2. Chama a função Pura que simula o tabuleiro na memória
    const { nextState, events } = await this.simulateStateTransition(gameState, data);

    // 3. CORREÇÃO CRÍTICA: Salva o objeto Piece completo ({id, type, color, hasMoved}) conforme exigido pelo motor
    const historyEntry = {
      piece: { ...movingPiece }, // 👈 Passa o objeto completo aqui!
      from: data.from,
      to: data.to,
      promotionType: data.promotionType || null
    };
    nextState.moveHistory = [...(gameState.moveHistory || []), historyEntry];

    // 4. Salva no banco de dados o Universo atualizado
    await this.updateMatchState(match.id, nextState);

    return {
      gameState: nextState,
      events: events
    };
  }

  /**
   * FUNÇÃO PURA (A Máquina do Tempo): Resolve regras, paradoxos e transições de estado NA MEMÓRIA.
   * Totalmente isolada do banco de dados (Prisma).
   */
  async simulateStateTransition(baseState: any, data: { from: any; to: any; promotionType?: string }) {
    // Deep clone para garantir pureza absoluta (não alteramos o objeto original em memória)
    const state = JSON.parse(JSON.stringify(baseState));
    const originalTurn = state.turn;
    const movingPiece = state.dimensions[data.from.z]?.grid[data.from.y]?.[data.from.x];

    if (!movingPiece) {
      throw new Error('Peça não encontrada na origem durante a simulação.');
    }

    // --- BLOCO 2: VALIDAÇÕES DIMENSIONAIS E DINÂMICAS ---
    const fromDimActive = state.dimensions[data.from.z]?.grid.some((row: any[]) => row.some((p: any) => p && p.type === 'KING' && p.color === movingPiece.color));
    if (!fromDimActive) {
      throw new Error('Bloqueio Quântico: Você não pode mover peças de uma dimensão inativa.');
    }

    const toDimActive = state.dimensions[data.to.z]?.grid.some((row: any[]) => row.some((p: any) => p && p.type === 'KING' && p.color === movingPiece.color));

    const isPawnPromotionJump = movingPiece.type === 'PAWN' && data.to.z > data.from.z && (
      (movingPiece.color === 'WHITE' && data.to.y === 7) ||
      (movingPiece.color === 'BLACK' && data.to.y === 0)
    );

    if (!toDimActive && movingPiece.type !== 'KING' && !isPawnPromotionJump) {
      throw new Error('Bloqueio Quântico: Apenas o Rei (ou Peão em promoção a Rei via salto) pode saltar para uma dimensão inativa para reativá-la.');
    }

    if (movingPiece.type === 'KING' && data.to.z !== data.from.z) {
      const targetDimHasPieces = state.dimensions[data.to.z]?.grid.some((row: any[]) => row.some((p: any) => p && p.color === movingPiece.color));
      if (!targetDimHasPieces) {
        throw new Error('Bloqueio Quântico: O Rei não pode saltar para uma dimensão onde o seu exército não possui peças.');
      }
    }

    if (state.modality === 'DYNAMIC' && state.activeDimensionIndex !== undefined) {
      const masterKingPos = this.engineService.getMasterKingPosition(state, state.turn);
      const checkData = this.engineService.getCheckData(state, state.turn);
      const isMasterKingInCheck = checkData && masterKingPos && checkData.kingsInCheck.some(k =>
        k.x === masterKingPos.x && k.y === masterKingPos.y && k.z === masterKingPos.z
      );

      if (isMasterKingInCheck) {
        const hasKingInDimension = state.dimensions[data.from.z]?.grid.some((row: any[]) =>
          row.some((p: any) => p && p.type === 'KING' && p.color === state.turn)
        );
        if (!hasKingInDimension) {
          throw new Error(`Bloqueio Quântico: Seu Rei Master está em xeque! Você só pode mover de dimensões que possuem um Rei. A dimensão ${data.from.z + 1} não possui Reis do seu exército.`);
        }
      } else {
        if (data.from.z !== state.activeDimensionIndex) {
          throw new Error(`Bloqueio Quântico: Na Modalidade Dinâmica, a sua jogada atual deve ser realizada obrigatoriamente na Dimensão ${state.activeDimensionIndex + 1}.`);
        }
      }
    }

    if (movingPiece.type !== 'KNIGHT' && movingPiece.type !== 'KING') {
      const dx = data.to.x - data.from.x;
      const dy = data.to.y - data.from.y;
      const dz = data.to.z - data.from.z;
      const stepZ = dz === 0 ? 0 : (dz > 0 ? 1 : -1);

      if (stepZ !== 0) {
        const totalSteps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
        let cz = data.from.z + stepZ;
        for (let i = 1; i < totalSteps; i++) {
          const isIntermediateDimActive = state.dimensions[cz]?.grid.some((row: any[]) => row.some((p: any) => p && p.type === 'KING' && p.color === movingPiece.color));
          if (!isIntermediateDimActive) {
            throw new Error('Bloqueio Quântico: O trajeto está bloqueado por uma dimensão inativa para o seu exército.');
          }
          cz += stepZ;
        }
      }
    }

    // --- BLOCO 3: PREPARAÇÃO E FLAGS PARA O MOTOR ---
    const wMk = state.whiteMasterKing;
    const matchesWhiteCoords = wMk && Number(wMk.x) === Number(data.from.x) && Number(wMk.y) === Number(data.from.y) && Number(wMk.z) === Number(data.from.z);

    const bMk = state.blackMasterKing;
    const matchesBlackCoords = bMk && Number(bMk.x) === Number(data.from.x) && Number(bMk.y) === Number(data.from.y) && Number(bMk.z) === Number(data.from.z);

    const isWhiteMasterMoving = movingPiece.type === 'KING' && movingPiece.color === 'WHITE' && (movingPiece.isMasterKing === true || matchesWhiteCoords || (data as any).piece?.isMasterKing === true);
    const isBlackMasterMoving = movingPiece.type === 'KING' && movingPiece.color === 'BLACK' && (movingPiece.isMasterKing === true || matchesBlackCoords || (data as any).piece?.isMasterKing === true);

    const targetPiece = state.dimensions[data.to.z]?.grid[data.to.y]?.[data.to.x];
    const isCastling = movingPiece.type === 'KING' && Math.abs(data.to.x - data.from.x) === 2 && data.from.y === data.to.y && data.from.z === data.to.z;
    const isDimensionalCastling = movingPiece.type === 'KING' && targetPiece?.type === 'KING' && movingPiece.color === targetPiece.color && data.from.x === data.to.x && data.from.y === data.to.y && Math.abs(data.from.z - data.to.z) > 0;

    if (isDimensionalCastling && Math.abs(data.from.z - data.to.z) !== 1) {
      throw new Error('Roque Temporal inválido: O Rei só pode trocar de lugar com um Rei de uma dimensão vizinha.');
    }

    const matchesWhiteCoordsTarget = wMk && Number(wMk.x) === Number(data.to.x) && Number(wMk.y) === Number(data.to.y) && Number(wMk.z) === Number(data.to.z);
    const isTargetWhiteMaster = targetPiece && targetPiece.type === 'KING' && targetPiece.color === 'WHITE' && (targetPiece.isMasterKing === true || matchesWhiteCoordsTarget || (data as any).targetPiece?.isMasterKing === true);

    const matchesBlackCoordsTarget = bMk && Number(bMk.x) === Number(data.to.x) && Number(bMk.y) === Number(data.to.y) && Number(bMk.z) === Number(data.to.z);
    const isTargetBlackMaster = targetPiece && targetPiece.type === 'KING' && targetPiece.color === 'BLACK' && (targetPiece.isMasterKing === true || matchesBlackCoordsTarget || (data as any).targetPiece?.isMasterKing === true);

    const isEnPassant = movingPiece.type === 'PAWN' && targetPiece === null && Math.abs(data.to.x - data.from.x) === 1 && Math.abs(data.to.y - data.from.y) === 1;
    const capturedEnPassantPiecePos = isEnPassant && state.moveHistory?.length > 0 ? state.moveHistory[state.moveHistory.length - 1].to : null;

    // --- BLOCO 4: PROCESSAMENTO DO MOVIMENTO (ENGINE) ---
    // 🚨 REQUISITO: Seu QuantumEngineService precisa ter este método que aceita o 'state' e retorna { updatedState, events }
    const engineResult = await this.engineService.processMoveInMemory(state, data.from, data.to);

    let updatedState = engineResult.updatedState;
    const events: any[] = [...engineResult.events];

    updatedState.eliminatedPieces = state.eliminatedPieces ? [...state.eliminatedPieces] : [];

    // --- BLOCO 5: GARANTIA DE STATUS DOS REIS MASTER ---
    if (isDimensionalCastling && isTargetWhiteMaster) updatedState.whiteMasterKing = data.from;
    else if (isWhiteMasterMoving) updatedState.whiteMasterKing = data.to;
    else updatedState.whiteMasterKing = state.whiteMasterKing;

    if (isDimensionalCastling && isTargetBlackMaster) updatedState.blackMasterKing = data.from;
    else if (isBlackMasterMoving) updatedState.blackMasterKing = data.to;
    else updatedState.blackMasterKing = state.blackMasterKing;

    updatedState.dimensions.forEach((dim: any) => {
      if (!dim.isActive) return;
      dim.grid.forEach((row: any[]) => {
        row.forEach((p: any) => { if (p && p.type === 'KING') p.isMasterKing = false; });
      });
    });

    if (updatedState.whiteMasterKing && updatedState.whiteMasterKing.z !== undefined) {
      const { x, y, z } = updatedState.whiteMasterKing;
      const wPiece = updatedState.dimensions[z]?.grid[y]?.[x];
      if (wPiece && wPiece.type === 'KING' && wPiece.color === 'WHITE') wPiece.isMasterKing = true;
    }

    if (updatedState.blackMasterKing && updatedState.blackMasterKing.z !== undefined) {
      const { x, y, z } = updatedState.blackMasterKing;
      const bPiece = updatedState.dimensions[z]?.grid[y]?.[x];
      if (bPiece && bPiece.type === 'KING' && bPiece.color === 'BLACK') bPiece.isMasterKing = true;
    }

    // --- BLOCO 6: REGRAS ESPECIAIS PÓS-MOVIMENTO ---
    if (isCastling) {
      const isKingside = data.to.x > data.from.x;
      const rookFromX = isKingside ? 7 : 0;
      const rookToX = isKingside ? 5 : 3;
      const rookPiece = updatedState.dimensions[data.to.z].grid[data.to.y][rookFromX];
      if (rookPiece && rookPiece.type === 'ROOK') {
        updatedState.dimensions[data.to.z].grid[data.to.y][rookFromX] = null;
        updatedState.dimensions[data.to.z].grid[data.to.y][rookToX] = { ...rookPiece, hasMoved: true };
      }
    }

    if (isDimensionalCastling) {
      if (targetPiece) updatedState.dimensions[data.from.z].grid[data.from.y][data.from.x] = { ...targetPiece, hasMoved: true };
    } else if (targetPiece) {
      updatedState.eliminatedPieces.push(targetPiece);
    }

    const pieceAtDest = updatedState.dimensions[data.to.z]?.grid[data.to.y]?.[data.to.x];
    if (pieceAtDest) pieceAtDest.hasMoved = true;

    if (isEnPassant && capturedEnPassantPiecePos) {
      const capturedPawn = state.dimensions[capturedEnPassantPiecePos.z].grid[capturedEnPassantPiecePos.y][capturedEnPassantPiecePos.x];
      if (capturedPawn) updatedState.eliminatedPieces.push(capturedPawn);
      updatedState.dimensions[capturedEnPassantPiecePos.z].grid[capturedEnPassantPiecePos.y][capturedEnPassantPiecePos.x] = null;
    }

    let promotedToKing = false;
    if (pieceAtDest && pieceAtDest.type === 'PAWN') {
      const isLastRank = (pieceAtDest.color === 'WHITE' && data.to.y === 7) || (pieceAtDest.color === 'BLACK' && data.to.y === 0);
      if (isLastRank) {
        const isDimensionalJump = data.to.z > data.from.z;
        if (isDimensionalJump) {
          pieceAtDest.type = 'KING';
          promotedToKing = true;
          events.push({ type: 'PROMOTION', payload: { piece: pieceAtDest, coord: data.to, newType: 'KING' } });
        } else {
          const requestedType = data.promotionType || 'QUEEN';
          const validTypes = ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT'];
          pieceAtDest.type = validTypes.includes(requestedType) ? requestedType : 'QUEEN';
          events.push({ type: 'PROMOTION', payload: { piece: pieceAtDest, coord: data.to, newType: pieceAtDest.type } });
        }
      }
    }

    // --- BLOCO 7: PARADOXOS QUÂNTICOS ---
    if ((movingPiece.type === 'KING' && data.from.z !== data.to.z && !isDimensionalCastling) || promotedToKing) {
      let residentKingPos: any = null;
      let residentKingPiece: any = null;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          if (x === data.to.x && y === data.to.y) continue;
          const p = updatedState.dimensions[data.to.z].grid[y][x];
          if (p && p.type === 'KING' && p.color === movingPiece.color) {
            residentKingPos = { x, y, z: data.to.z };
            residentKingPiece = p;
            break;
          }
        }
      }
      if (residentKingPos && residentKingPiece) {
        const isResidentMaster = residentKingPiece.isMasterKing === true ||
          (residentKingPiece.color === 'WHITE' && updatedState.whiteMasterKing?.x === residentKingPos.x && updatedState.whiteMasterKing?.y === residentKingPos.y && updatedState.whiteMasterKing?.z === residentKingPos.z) ||
          (residentKingPiece.color === 'BLACK' && updatedState.blackMasterKing?.x === residentKingPos.x && updatedState.blackMasterKing?.y === residentKingPos.y && updatedState.blackMasterKing?.z === residentKingPos.z);

        if (isResidentMaster) {
          updatedState.dimensions[data.to.z].grid[data.to.y][data.to.x] = null;
          if (pieceAtDest) {
            updatedState.eliminatedPieces.push(pieceAtDest);
            events.push({ type: 'COLLAPSE', payload: { piece: pieceAtDest, coord: data.to } });
          }
        } else {
          updatedState.dimensions[data.to.z].grid[residentKingPos.y][residentKingPos.x] = null;
          updatedState.eliminatedPieces.push(residentKingPiece);
          events.push({ type: 'COLLAPSE', payload: { piece: residentKingPiece, coord: residentKingPos } });
        }
      }
    }

    if (movingPiece.type === 'QUEEN' && data.from.z !== data.to.z) {
      let residentQueens: { pos: any, piece: any }[] = [];
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          if (x === data.to.x && y === data.to.y) continue;
          const p = updatedState.dimensions[data.to.z].grid[y][x];
          if (p && p.type === 'QUEEN' && p.color === movingPiece.color) residentQueens.push({ pos: { x, y, z: data.to.z }, piece: p });
        }
      }
      if (residentQueens.length >= 1) {
        let closestQueen = residentQueens.reduce((prev, curr) =>
          (Math.pow(prev.pos.x - data.to.x, 2) + Math.pow(prev.pos.y - data.to.y, 2)) < (Math.pow(curr.pos.x - data.to.x, 2) + Math.pow(curr.pos.y - data.to.y, 2)) ? prev : curr
        );
        updatedState.dimensions[data.to.z].grid[closestQueen.pos.y][closestQueen.pos.x] = null;
        updatedState.eliminatedPieces.push(closestQueen.piece);
        events.push({ type: 'COLLAPSE', payload: { piece: closestQueen.piece, coord: closestQueen.pos } });
      }
    }

    if (movingPiece.type === 'ROOK' && data.from.z !== data.to.z) {
      let residentRooks: { pos: any, piece: any }[] = [];
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          if (x === data.to.x && y === data.to.y) continue;
          const p = updatedState.dimensions[data.to.z].grid[y][x];
          if (p && p.type === 'ROOK' && p.color === movingPiece.color) residentRooks.push({ pos: { x, y, z: data.to.z }, piece: p });
        }
      }
      if (residentRooks.length >= 2) {
        let closestRook = residentRooks.reduce((prev, curr) =>
          (Math.pow(prev.pos.x - data.to.x, 2) + Math.pow(prev.pos.y - data.to.y, 2)) < (Math.pow(curr.pos.x - data.to.x, 2) + Math.pow(curr.pos.y - data.to.y, 2)) ? prev : curr
        );
        updatedState.dimensions[data.to.z].grid[closestRook.pos.y][closestRook.pos.x] = null;
        updatedState.eliminatedPieces.push(closestRook.piece);
        events.push({ type: 'COLLAPSE', payload: { piece: closestRook.piece, coord: closestRook.pos } });
      }
    }

    if (movingPiece.type === 'KNIGHT' && data.from.z !== data.to.z) {
      let residentKnights: { pos: any, piece: any }[] = [];
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          if (x === data.to.x && y === data.to.y) continue;
          const p = updatedState.dimensions[data.to.z].grid[y][x];
          if (p && p.type === 'KNIGHT' && p.color === movingPiece.color) residentKnights.push({ pos: { x, y, z: data.to.z }, piece: p });
        }
      }
      if (residentKnights.length >= 2) {
        let closestKnight = residentKnights.reduce((prev, curr) =>
          (Math.pow(prev.pos.x - data.to.x, 2) + Math.pow(prev.pos.y - data.to.y, 2)) < (Math.pow(curr.pos.x - data.to.x, 2) + Math.pow(curr.pos.y - data.to.y, 2)) ? prev : curr
        );
        updatedState.dimensions[data.to.z].grid[closestKnight.pos.y][closestKnight.pos.x] = null;
        updatedState.eliminatedPieces.push(closestKnight.piece);
        events.push({ type: 'COLLAPSE', payload: { piece: closestKnight.piece, coord: closestKnight.pos } });
      }
    }

    if (movingPiece.type === 'PAWN' && data.from.z !== data.to.z && !promotedToKing) {
      let residentPawns: { pos: any, piece: any }[] = [];
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          if (x === data.to.x && y === data.to.y) continue;
          const p = updatedState.dimensions[data.to.z].grid[y][x];
          if (p && p.type === 'PAWN' && p.color === movingPiece.color) residentPawns.push({ pos: { x, y, z: data.to.z }, piece: p });
        }
      }
      if (residentPawns.length >= 8) {
        let closestPawn = residentPawns.reduce((prev, curr) =>
          (Math.pow(prev.pos.x - data.to.x, 2) + Math.pow(prev.pos.y - data.to.y, 2)) < (Math.pow(curr.pos.x - data.to.x, 2) + Math.pow(curr.pos.y - data.to.y, 2)) ? prev : curr
        );
        updatedState.dimensions[data.to.z].grid[closestPawn.pos.y][closestPawn.pos.x] = null;
        updatedState.eliminatedPieces.push(closestPawn.piece);
        events.push({ type: 'COLLAPSE', payload: { piece: closestPawn.piece, coord: closestPawn.pos } });
      }
    }

    if (movingPiece.type === 'BISHOP' && data.from.z !== data.to.z) {
      const isTargetLightSquare = (data.to.x + data.to.y) % 2 === 0;
      let residentBishops: { pos: any, piece: any }[] = [];
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          if (x === data.to.x && y === data.to.y) continue;
          const p = updatedState.dimensions[data.to.z].grid[y][x];
          if (p && p.type === 'BISHOP' && p.color === movingPiece.color) {
            if (isTargetLightSquare === ((x + y) % 2 === 0)) residentBishops.push({ pos: { x, y, z: data.to.z }, piece: p });
          }
        }
      }
      if (residentBishops.length >= 1) {
        let closestBishop = residentBishops.reduce((prev, curr) =>
          (Math.pow(prev.pos.x - data.to.x, 2) + Math.pow(prev.pos.y - data.to.y, 2)) < (Math.pow(curr.pos.x - data.to.x, 2) + Math.pow(curr.pos.y - data.to.y, 2)) ? prev : curr
        );
        updatedState.dimensions[data.to.z].grid[closestBishop.pos.y][closestBishop.pos.x] = null;
        updatedState.eliminatedPieces.push(closestBishop.piece);
        events.push({ type: 'COLLAPSE', payload: { piece: closestBishop.piece, coord: closestBishop.pos } });
      }
    }

    // --- BLOCO 8: HASHES E EMPATES ---
    const isCapture = targetPiece !== null || isEnPassant;
    const isPawnMove = movingPiece.type === 'PAWN';
    const paradoxOccurred = events.some((e: any) => e.type === 'COLLAPSE');

    let currentHalfMoveClock = state.halfMoveClock || 0;
    let currentStateHashes = state.stateHashes || {};

    if (isCapture || isPawnMove || paradoxOccurred || promotedToKing) {
      currentHalfMoveClock = 0;
      currentStateHashes = {};
    } else {
      currentHalfMoveClock++;
    }

    updatedState.halfMoveClock = currentHalfMoveClock;
    updatedState.stateHashes = currentStateHashes;

    let stateHash = `${updatedState.turn}|`;
    updatedState.dimensions.forEach((dim: any) => {
      if (!dim.isActive) {
        stateHash += 'X|';
      } else {
        dim.grid.forEach((row: any[]) => {
          row.forEach((p: any) => {
            if (!p) stateHash += '.';
            else stateHash += `${p.color[0]}${p.type[0]}${p.hasMoved ? '1' : '0'}${p.isMasterKing ? 'M' : ''}`;
          });
        });
        stateHash += '|';
      }
    });
    updatedState.stateHashes[stateHash] = (updatedState.stateHashes[stateHash] || 0) + 1;

    // --- BLOCO 9: VALIDAÇÃO FINAL DE XEQUE ---
    if (state.modality === 'DYNAMIC') {
      const masterKingBefore = this.engineService.getMasterKingPosition(state, state.turn);
      const checkDataBefore = this.engineService.getCheckData(state, state.turn);
      const wasMasterKingInCheckBefore = checkDataBefore && masterKingBefore && checkDataBefore.kingsInCheck.some(k =>
        k.x === masterKingBefore.x && k.y === masterKingBefore.y && k.z === masterKingBefore.z
      );

      if (wasMasterKingInCheckBefore) {
        const masterKingAfter = this.engineService.getMasterKingPosition(updatedState, state.turn);
        const checkDataAfter = this.engineService.getCheckData(updatedState, state.turn);
        const isMasterKingInCheckAfter = checkDataAfter && masterKingAfter && checkDataAfter.kingsInCheck.some(k =>
          k.x === masterKingAfter.x && k.y === masterKingAfter.y && k.z === masterKingAfter.z
        );

        if (isMasterKingInCheckAfter) {
          throw new Error('Bloqueio Quântico: O movimento não resolve o xeque do seu Rei Master!');
        }
      }
    }

    // --- BLOCO 10: PROGRESSÃO DO TURNO ---
    const nextTurnColor = updatedState.modality === 'CLASSIC' || (updatedState.modality === 'DYNAMIC' && (updatedState.actionsRemaining - 1 <= 0))
      ? (originalTurn === 'WHITE' ? 'BLACK' : 'WHITE')
      : originalTurn;

    const checkDataForNextPlayer = this.engineService.getCheckData(updatedState, nextTurnColor);
    const nextMasterKingPos = this.engineService.getMasterKingPosition(updatedState, nextTurnColor);
    const isNextMasterKingInCheck = checkDataForNextPlayer && nextMasterKingPos && checkDataForNextPlayer.kingsInCheck.some(k => k.x === nextMasterKingPos.x && k.y === nextMasterKingPos.y && k.z === nextMasterKingPos.z);

    if (updatedState.status !== 'COMPLETED') {
      if (updatedState.modality === 'CLASSIC') {
        updatedState.turn = originalTurn === 'WHITE' ? 'BLACK' : 'WHITE';
        updatedState.actionsRemaining = 1;
      } else {
        updatedState.actionsRemaining = (updatedState.actionsRemaining || 1) - 1;
        let nextTurn = originalTurn;
        let startZ = data.from.z + 1;

        if (updatedState.actionsRemaining <= 0 && isNextMasterKingInCheck) {
          nextTurn = nextTurnColor;
          updatedState.activeDimensionIndex = nextMasterKingPos.z;
          updatedState.forcedMasterKingSave = true;
        } else {
          updatedState.forcedMasterKingSave = false;
          let found = false;

          if (updatedState.actionsRemaining > 0) {
            for (let z = startZ; z < updatedState.dimensions.length; z++) {
              const dimActive = updatedState.dimensions[z].grid.some((row: any[]) => row.some((p: any) => p && p.type === 'KING' && p.color === nextTurn));
              if (dimActive) {
                updatedState.activeDimensionIndex = z;
                found = true;
                break;
              }
            }
          }

          if (!found || updatedState.actionsRemaining <= 0) {
            nextTurn = originalTurn === 'WHITE' ? 'BLACK' : 'WHITE';
            const masterKingBefore = this.engineService.getMasterKingPosition(state, originalTurn);
            const checkDataBefore = this.engineService.getCheckData(state, originalTurn);
            const wasInCheckBefore = checkDataBefore && masterKingBefore && checkDataBefore.kingsInCheck.some(k =>
              k.x === masterKingBefore.x && k.y === masterKingBefore.y && k.z === masterKingBefore.z
            );

            let excludedDim: number | undefined = undefined;
            if (wasInCheckBefore) excludedDim = data.from.z;

            const nextDim = this.engineService.getNextValidDimension(updatedState, nextTurn, excludedDim);
            if (nextDim !== null) {
              updatedState.activeDimensionIndex = nextDim;
              found = true;
            } else {
              updatedState.activeDimensionIndex = 0;
            }
          }
        }

        updatedState.turn = nextTurn;
        let actionsCount = 0;
        for (let z = 0; z < updatedState.dimensions.length; z++) {
          const dimActive = updatedState.dimensions[z].isActive && updatedState.dimensions[z].grid.some((row: any[]) => row.some((p: any) => p && p.type === 'KING' && p.color === nextTurn));
          if (dimActive) actionsCount++;
        }
        updatedState.actionsRemaining = actionsCount;
      }
    }

    return { nextState: updatedState, events };
  }

  /**
   * RECRIADOR DE UNIVERSOS: Reconstrói a fita do tempo usando o histórico.
   */
  async generateReplayStates(matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match) throw new Error('Partida não encontrada para replay.');

    const finalGameState = match.gameState as any;
    const totalDimensions = finalGameState.dimensions.length;
    const moveHistory = finalGameState.moveHistory || [];

    let currentState = this.createInitialGameState(finalGameState.modality, totalDimensions);

    if (totalDimensions > 1) {
      currentState.whiteMasterKing = finalGameState.whiteMasterKing;
      currentState.blackMasterKing = finalGameState.blackMasterKing;

      if (currentState.whiteMasterKing) {
        const { x, y, z } = currentState.whiteMasterKing;
        if (currentState.dimensions[z]?.grid[y]?.[x]) currentState.dimensions[z].grid[y][x].isMasterKing = true;
      }
      if (currentState.blackMasterKing) {
        const { x, y, z } = currentState.blackMasterKing;
        if (currentState.dimensions[z]?.grid[y]?.[x]) currentState.dimensions[z].grid[y][x].isMasterKing = true;
      }
    }

    // 👇 A CORREÇÃO É AQUI: Adicione ': any[]' à declaração da variável
    const historyStates: any[] = [];

    historyStates.push(JSON.parse(JSON.stringify(currentState)));

    for (const moveIntent of moveHistory) {
      const { nextState } = await this.simulateStateTransition(currentState, moveIntent);
      currentState = nextState;
      historyStates.push(JSON.parse(JSON.stringify(currentState)));
    }

    return historyStates;
  }
}