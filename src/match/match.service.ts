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
    return this.prisma.match.findUnique({
      where: {
        id: matchId,
      },
      // Opcional: Se você quiser trazer os dados dos jogadores juntos, descomente abaixo:
      // include: {
      //   whitePlayer: true,
      //   blackPlayer: true,
      // },
    });
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
  async updateMatchState(matchId: string, updatedState: any) {
    return this.prisma.match.update({
      where: {
        id: matchId,
      },
      data: {
        gameState: updatedState,
        status: updatedState.status,
        winnerId: updatedState.winnerId,
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
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });

    if (!match) throw new Error('Partida não encontrada joinmatch.');

    let { whitePlayerId, blackPlayerId, status } = match;
    const gameState = match.gameState as any;

    // Se o jogador já está na partida (reconexão)
    if (whitePlayerId === userId || blackPlayerId === userId) {
      return match;
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

      return await this.prisma.match.update({
        where: { id: matchId },
        data: {
          whitePlayerId,
          blackPlayerId,
          status,
          gameState,
        },
      });
    }

    // Se a partida não estiver mais aguardando oponente, permite a entrada como espectador
    return match;
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

  async executePlayerMove(
    userId: string,
    data: { matchId: string; from: any; to: any; promotionType?: string }
  ) {
    const match = await this.findMatchById(data.matchId); // Ajuste se seu método tiver outro nome internamente
    if (!match) throw new Error('Partida não encontrada.');

    const gameState = match.gameState as any;
    const originalTurn = gameState.turn;

    const isWhite = String(userId).trim() === String(match.whitePlayerId).trim();
    const isBlack = String(userId).trim() === String(match.blackPlayerId).trim();

    // --- BLOCO 1: VALIDAÇÕES DE ACESSO E TURNO ---
    if (!isWhite && !isBlack) {
      throw new Error('Bloqueio Quântico: Espectadores não podem alterar a linha do tempo.');
    }

    // 🚨 TRAVA DO TURNO 0
    if (!gameState.whiteMasterKing || !gameState.blackMasterKing) {
      throw new Error('Bloqueio Quântico: A partida não pode começar antes que ambos os jogadores consagrem seus Reis Master.');
    }

    const movingPiece = gameState.dimensions[data.from.z]?.grid[data.from.y]?.[data.from.x];

    if (!movingPiece) {
      throw new Error('Peça não encontrada na origem.');
    }

    if (gameState.turn !== movingPiece.color) {
      throw new Error('Bloqueio Quântico: Não é o turno dessa cor.');
    }

    if ((isWhite && movingPiece.color !== 'WHITE') || (isBlack && movingPiece.color !== 'BLACK')) {
      throw new Error('Bloqueio Quântico: Você só pode controlar o seu próprio exército.');
    }

    // --- BLOCO 2: VALIDAÇÕES DIMENSIONAIS E DINÂMICAS ---
    // 🚨 TRAVA DE DIMENSÃO INATIVA
    const fromDimActive = gameState.dimensions[data.from.z]?.grid.some((row: any[]) => row.some((p: any) => p && p.type === 'KING' && p.color === movingPiece.color));
    if (!fromDimActive) {
      throw new Error('Bloqueio Quântico: Você não pode mover peças de uma dimensão inativa.');
    }

    const toDimActive = gameState.dimensions[data.to.z]?.grid.some((row: any[]) => row.some((p: any) => p && p.type === 'KING' && p.color === movingPiece.color));

    const isPawnPromotionJump = movingPiece.type === 'PAWN' && data.to.z > data.from.z && (
      (movingPiece.color === 'WHITE' && data.to.y === 7) ||
      (movingPiece.color === 'BLACK' && data.to.y === 0)
    );

    if (!toDimActive && movingPiece.type !== 'KING' && !isPawnPromotionJump) {
      throw new Error('Bloqueio Quântico: Apenas o Rei (ou Peão em promoção a Rei via salto) pode saltar para uma dimensão inativa para reativá-la.');
    }

    // 🚨 TRAVA DE DIMENSÃO VAZIA PARA O REI
    if (movingPiece.type === 'KING' && data.to.z !== data.from.z) {
      const targetDimHasPieces = gameState.dimensions[data.to.z]?.grid.some((row: any[]) => row.some((p: any) => p && p.color === movingPiece.color));
      if (!targetDimHasPieces) {
        throw new Error('Bloqueio Quântico: O Rei não pode saltar para uma dimensão onde o seu exército não possui peças.');
      }
    }

    // 🚨 TRAVA DE DIMENSÃO DINÂMICA
    if (gameState.modality === 'DYNAMIC' && gameState.activeDimensionIndex !== undefined) {
      const masterKingPos = this.engineService.getMasterKingPosition(gameState, gameState.turn);
      const checkData = this.engineService.getCheckData(gameState, gameState.turn);
      const isMasterKingInCheck = checkData && masterKingPos && checkData.kingsInCheck.some(k =>
        k.x === masterKingPos.x && k.y === masterKingPos.y && k.z === masterKingPos.z
      );

      if (isMasterKingInCheck) {
        const hasKingInDimension = gameState.dimensions[data.from.z]?.grid.some((row: any[]) =>
          row.some((p: any) => p && p.type === 'KING' && p.color === gameState.turn)
        );
        if (!hasKingInDimension) {
          throw new Error(`Bloqueio Quântico: Seu Rei Master está em xeque! Você só pode mover de dimensões que possuem um Rei. A dimensão ${data.from.z + 1} não possui Reis do seu exército.`);
        }
      } else {
        if (data.from.z !== gameState.activeDimensionIndex) {
          throw new Error(`Bloqueio Quântico: Na Modalidade Dinâmica, a sua jogada atual deve ser realizada obrigatoriamente na Dimensão ${gameState.activeDimensionIndex + 1}.`);
        }
      }
    }

    // Verifica se o trajeto multidimensional passa por alguma dimensão inativa
    if (movingPiece.type !== 'KNIGHT' && movingPiece.type !== 'KING') {
      const dx = data.to.x - data.from.x;
      const dy = data.to.y - data.from.y;
      const dz = data.to.z - data.from.z;
      const stepZ = dz === 0 ? 0 : (dz > 0 ? 1 : -1);

      if (stepZ !== 0) {
        const totalSteps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
        let cz = data.from.z + stepZ;
        for (let i = 1; i < totalSteps; i++) {
          const isIntermediateDimActive = gameState.dimensions[cz]?.grid.some((row: any[]) => row.some((p: any) => p && p.type === 'KING' && p.color === movingPiece.color));
          if (!isIntermediateDimActive) {
            throw new Error('Bloqueio Quântico: O trajeto está bloqueado por uma dimensão inativa para o seu exército.');
          }
          cz += stepZ;
        }
      }
    }

    // --- BLOCO 3: PREPARAÇÃO E FLAGS PARA O MOTOR ---
    const wMk = gameState.whiteMasterKing;
    const matchesWhiteCoords = wMk &&
      Number(wMk.x) === Number(data.from.x) &&
      Number(wMk.y) === Number(data.from.y) &&
      Number(wMk.z) === Number(data.from.z);

    const bMk = gameState.blackMasterKing;
    const matchesBlackCoords = bMk &&
      Number(bMk.x) === Number(data.from.x) &&
      Number(bMk.y) === Number(data.from.y) &&
      Number(bMk.z) === Number(data.from.z);

    const isWhiteMasterMoving = movingPiece && movingPiece.type === 'KING' && movingPiece.color === 'WHITE' &&
      (movingPiece.isMasterKing === true || matchesWhiteCoords || (data as any).piece?.isMasterKing === true);

    const isBlackMasterMoving = movingPiece && movingPiece.type === 'KING' && movingPiece.color === 'BLACK' &&
      (movingPiece.isMasterKing === true || matchesBlackCoords || (data as any).piece?.isMasterKing === true);

    const targetPiece = gameState.dimensions[data.to.z]?.grid[data.to.y]?.[data.to.x];
    const isCastling = movingPiece && movingPiece.type === 'KING' && Math.abs(data.to.x - data.from.x) === 2 && data.from.y === data.to.y && data.from.z === data.to.z;
    const isDimensionalCastling = movingPiece?.type === 'KING' &&
      targetPiece?.type === 'KING' &&
      movingPiece.color === targetPiece.color &&
      data.from.x === data.to.x &&
      data.from.y === data.to.y &&
      Math.abs(data.from.z - data.to.z) > 0;

    if (isDimensionalCastling && Math.abs(data.from.z - data.to.z) !== 1) {
      throw new Error('Roque Temporal inválido: O Rei só pode trocar de lugar com um Rei de uma dimensão vizinha.');
    }

    const matchesWhiteCoordsTarget = wMk &&
      Number(wMk.x) === Number(data.to.x) &&
      Number(wMk.y) === Number(data.to.y) &&
      Number(wMk.z) === Number(data.to.z);
    const isTargetWhiteMaster = targetPiece && targetPiece.type === 'KING' && targetPiece.color === 'WHITE' &&
      (targetPiece.isMasterKing === true || matchesWhiteCoordsTarget || (data as any).targetPiece?.isMasterKing === true);

    const matchesBlackCoordsTarget = bMk &&
      Number(bMk.x) === Number(data.to.x) &&
      Number(bMk.y) === Number(data.to.y) &&
      Number(bMk.z) === Number(data.to.z);
    const isTargetBlackMaster = targetPiece && targetPiece.type === 'KING' && targetPiece.color === 'BLACK' &&
      (targetPiece.isMasterKing === true || matchesBlackCoordsTarget || (data as any).targetPiece?.isMasterKing === true);

    const isEnPassant = movingPiece?.type === 'PAWN' &&
      targetPiece === null &&
      Math.abs(data.to.x - data.from.x) === 1 &&
      Math.abs(data.to.y - data.from.y) === 1;
    const capturedEnPassantPiecePos = isEnPassant && gameState.moveHistory?.length > 0
      ? gameState.moveHistory[gameState.moveHistory.length - 1].to
      : null;

    // --- BLOCO 4: PROCESSAMENTO DO MOVIMENTO (ENGINE) ---
    const result = await this.engineService.processMove(match.id, userId, data.from, data.to);

    // INICIALIZA CEMITÉRIO
    result.updatedState.eliminatedPieces = gameState.eliminatedPieces ? [...gameState.eliminatedPieces] : [];

    // --- BLOCO 5: GARANTIA DE STATUS DOS REIS MASTER ---
    if (isDimensionalCastling && isTargetWhiteMaster) {
      result.updatedState.whiteMasterKing = data.from;
    } else if (isWhiteMasterMoving) {
      result.updatedState.whiteMasterKing = data.to;
    } else {
      result.updatedState.whiteMasterKing = gameState.whiteMasterKing;
    }

    if (isDimensionalCastling && isTargetBlackMaster) {
      result.updatedState.blackMasterKing = data.from;
    } else if (isBlackMasterMoving) {
      result.updatedState.blackMasterKing = data.to;
    } else {
      result.updatedState.blackMasterKing = gameState.blackMasterKing;
    }

    // RESTAURAÇÃO DE SEGURANÇA DAS FLAGS
    result.updatedState.dimensions.forEach((dim: any) => {
      if (!dim.isActive) return;
      dim.grid.forEach((row: any[]) => {
        row.forEach((p: any) => {
          if (p && p.type === 'KING') {
            p.isMasterKing = false;
          }
        });
      });
    });

    if (result.updatedState.whiteMasterKing) {
      const { x, y, z } = result.updatedState.whiteMasterKing;
      if (z !== undefined) {
        const wPiece = result.updatedState.dimensions[z]?.grid[y]?.[x];
        if (wPiece && wPiece.type === 'KING' && wPiece.color === 'WHITE') {
          wPiece.isMasterKing = true;
        }
      }
    }

    if (result.updatedState.blackMasterKing) {
      const { x, y, z } = result.updatedState.blackMasterKing;
      if (z !== undefined) {
        const bPiece = result.updatedState.dimensions[z]?.grid[y]?.[x];
        if (bPiece && bPiece.type === 'KING' && bPiece.color === 'BLACK') {
          bPiece.isMasterKing = true;
        }
      }
    }

    // --- BLOCO 6: REGRAS ESPECIAIS PÓS-MOVIMENTO ---
    // Roque Clássico
    if (isCastling) {
      const isKingside = data.to.x > data.from.x;
      const rookFromX = isKingside ? 7 : 0;
      const rookToX = isKingside ? 5 : 3;
      const z = data.to.z;
      const y = data.to.y;

      const dim = result.updatedState.dimensions[z];
      const rookPiece = dim.grid[y][rookFromX];
      if (rookPiece && rookPiece.type === 'ROOK') {
        dim.grid[y][rookFromX] = null;
        dim.grid[y][rookToX] = { ...rookPiece, hasMoved: true };
      }
    }

    // Roque Dimensional
    if (isDimensionalCastling) {
      if (targetPiece) {
        result.updatedState.dimensions[data.from.z].grid[data.from.y][data.from.x] = { ...targetPiece, hasMoved: true };
      }
    } else if (targetPiece) {
      result.updatedState.eliminatedPieces.push(targetPiece);
    }

    const pieceAtDest = result.updatedState.dimensions[data.to.z]?.grid[data.to.y]?.[data.to.x];
    if (pieceAtDest) {
      pieceAtDest.hasMoved = true;
    }

    // En Passant
    if (isEnPassant && capturedEnPassantPiecePos) {
      const capturedPawn = gameState.dimensions[capturedEnPassantPiecePos.z].grid[capturedEnPassantPiecePos.y][capturedEnPassantPiecePos.x];
      if (capturedPawn) {
        result.updatedState.eliminatedPieces.push(capturedPawn);
      }
      result.updatedState.dimensions[capturedEnPassantPiecePos.z].grid[capturedEnPassantPiecePos.y][capturedEnPassantPiecePos.x] = null;
    }

    // Promoção
    let promotedToKing = false;
    if (pieceAtDest && pieceAtDest.type === 'PAWN') {
      const isLastRank = (pieceAtDest.color === 'WHITE' && data.to.y === 7) || (pieceAtDest.color === 'BLACK' && data.to.y === 0);
      if (isLastRank) {
        const isDimensionalJump = data.to.z > data.from.z;
        if (isDimensionalJump) {
          pieceAtDest.type = 'KING';
          promotedToKing = true;
          (result.events as any[]).push({ type: 'PROMOTION', payload: { piece: pieceAtDest, coord: data.to, newType: 'KING' } });
        } else {
          const requestedType = data.promotionType || 'QUEEN';
          const validTypes = ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT'];
          pieceAtDest.type = validTypes.includes(requestedType) ? (requestedType as 'QUEEN' | 'ROOK' | 'BISHOP' | 'KNIGHT') : 'QUEEN';
          (result.events as any[]).push({ type: 'PROMOTION', payload: { piece: pieceAtDest, coord: data.to, newType: pieceAtDest.type } });
        }
      }
    }

    // --- BLOCO 7: PARADOXOS QUÂNTICOS ---
    // PARADOXO DE REIS
    if ((movingPiece.type === 'KING' && data.from.z !== data.to.z && !isDimensionalCastling) || promotedToKing) {
      let residentKingPos: any = null;
      let residentKingPiece: any = null;

      const dim = result.updatedState.dimensions[data.to.z];
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          if (x === data.to.x && y === data.to.y) continue;
          const p = dim.grid[y][x];
          if (p && p.type === 'KING' && p.color === movingPiece.color) {
            residentKingPos = { x, y, z: data.to.z };
            residentKingPiece = p;
            break;
          }
        }
        if (residentKingPos) break;
      }

      if (residentKingPos && residentKingPiece) {
        const isResidentMaster = residentKingPiece.isMasterKing === true ||
          (residentKingPiece.color === 'WHITE' && result.updatedState.whiteMasterKing?.x === residentKingPos.x && result.updatedState.whiteMasterKing?.y === residentKingPos.y && result.updatedState.whiteMasterKing?.z === residentKingPos.z) ||
          (residentKingPiece.color === 'BLACK' && result.updatedState.blackMasterKing?.x === residentKingPos.x && result.updatedState.blackMasterKing?.y === residentKingPos.y && result.updatedState.blackMasterKing?.z === residentKingPos.z);

        if (isResidentMaster) {
          result.updatedState.dimensions[data.to.z].grid[data.to.y][data.to.x] = null;
          if (pieceAtDest) {
            result.updatedState.eliminatedPieces.push(pieceAtDest);
            (result.events as any[]).push({ type: 'COLLAPSE', payload: { piece: pieceAtDest, coord: data.to } });
          }
        } else {
          result.updatedState.dimensions[data.to.z].grid[residentKingPos.y][residentKingPos.x] = null;
          result.updatedState.eliminatedPieces.push(residentKingPiece);
          (result.events as any[]).push({ type: 'COLLAPSE', payload: { piece: residentKingPiece, coord: residentKingPos } });
        }
      }
    }

    // PARADOXO DE RAINHAS
    if (movingPiece.type === 'QUEEN' && data.from.z !== data.to.z) {
      let residentQueens: { pos: any, piece: any }[] = [];
      const dim = result.updatedState.dimensions[data.to.z];
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          if (x === data.to.x && y === data.to.y) continue;
          const p = dim.grid[y][x];
          if (p && p.type === 'QUEEN' && p.color === movingPiece.color) {
            residentQueens.push({ pos: { x, y, z: data.to.z }, piece: p });
          }
        }
      }

      if (residentQueens.length >= 1) {
        let closestDist = Infinity;
        let closestQueen: any = null;
        for (const rq of residentQueens) {
          const dist = Math.pow(rq.pos.x - data.to.x, 2) + Math.pow(rq.pos.y - data.to.y, 2);
          if (dist < closestDist) {
            closestDist = dist;
            closestQueen = rq;
          }
        }
        if (closestQueen) {
          result.updatedState.dimensions[data.to.z].grid[closestQueen.pos.y][closestQueen.pos.x] = null;
          result.updatedState.eliminatedPieces.push(closestQueen.piece);
          (result.events as any[]).push({ type: 'COLLAPSE', payload: { piece: closestQueen.piece, coord: closestQueen.pos } });
        }
      }
    }

    // PARADOXO DE TORRES
    if (movingPiece.type === 'ROOK' && data.from.z !== data.to.z) {
      let residentRooks: { pos: any, piece: any }[] = [];
      const dim = result.updatedState.dimensions[data.to.z];
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          if (x === data.to.x && y === data.to.y) continue;
          const p = dim.grid[y][x];
          if (p && p.type === 'ROOK' && p.color === movingPiece.color) {
            residentRooks.push({ pos: { x, y, z: data.to.z }, piece: p });
          }
        }
      }

      if (residentRooks.length >= 2) {
        let closestDist = Infinity;
        let closestRook: any = null;
        for (const rr of residentRooks) {
          const dist = Math.pow(rr.pos.x - data.to.x, 2) + Math.pow(rr.pos.y - data.to.y, 2);
          if (dist < closestDist) {
            closestDist = dist;
            closestRook = rr;
          }
        }
        if (closestRook) {
          result.updatedState.dimensions[data.to.z].grid[closestRook.pos.y][closestRook.pos.x] = null;
          result.updatedState.eliminatedPieces.push(closestRook.piece);
          (result.events as any[]).push({ type: 'COLLAPSE', payload: { piece: closestRook.piece, coord: closestRook.pos } });
        }
      }
    }

    // PARADOXO DE CAVALOS
    if (movingPiece.type === 'KNIGHT' && data.from.z !== data.to.z) {
      let residentKnights: { pos: any, piece: any }[] = [];
      const dim = result.updatedState.dimensions[data.to.z];
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          if (x === data.to.x && y === data.to.y) continue;
          const p = dim.grid[y][x];
          if (p && p.type === 'KNIGHT' && p.color === movingPiece.color) {
            residentKnights.push({ pos: { x, y, z: data.to.z }, piece: p });
          }
        }
      }

      if (residentKnights.length >= 2) {
        let closestDist = Infinity;
        let closestKnight: any = null;
        for (const rk of residentKnights) {
          const dist = Math.pow(rk.pos.x - data.to.x, 2) + Math.pow(rk.pos.y - data.to.y, 2);
          if (dist < closestDist) {
            closestDist = dist;
            closestKnight = rk;
          }
        }
        if (closestKnight) {
          result.updatedState.dimensions[data.to.z].grid[closestKnight.pos.y][closestKnight.pos.x] = null;
          result.updatedState.eliminatedPieces.push(closestKnight.piece);
          (result.events as any[]).push({ type: 'COLLAPSE', payload: { piece: closestKnight.piece, coord: closestKnight.pos } });
        }
      }
    }

    // PARADOXO DE PEÕES
    if (movingPiece.type === 'PAWN' && data.from.z !== data.to.z && !promotedToKing) {
      let residentPawns: { pos: any, piece: any }[] = [];
      const dim = result.updatedState.dimensions[data.to.z];
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          if (x === data.to.x && y === data.to.y) continue;
          const p = dim.grid[y][x];
          if (p && p.type === 'PAWN' && p.color === movingPiece.color) {
            residentPawns.push({ pos: { x, y, z: data.to.z }, piece: p });
          }
        }
      }

      if (residentPawns.length >= 8) {
        let closestDist = Infinity;
        let closestPawn: any = null;
        for (const rp of residentPawns) {
          const dist = Math.pow(rp.pos.x - data.to.x, 2) + Math.pow(rp.pos.y - data.to.y, 2);
          if (dist < closestDist) {
            closestDist = dist;
            closestPawn = rp;
          }
        }
        if (closestPawn) {
          result.updatedState.dimensions[data.to.z].grid[closestPawn.pos.y][closestPawn.pos.x] = null;
          result.updatedState.eliminatedPieces.push(closestPawn.piece);
          (result.events as any[]).push({ type: 'COLLAPSE', payload: { piece: closestPawn.piece, coord: closestPawn.pos } });
        }
      }
    }

    // PARADOXO DE BISPOS
    if (movingPiece.type === 'BISHOP' && data.from.z !== data.to.z) {
      const isTargetLightSquare = (data.to.x + data.to.y) % 2 === 0;
      let residentBishops: { pos: any, piece: any }[] = [];
      const dim = result.updatedState.dimensions[data.to.z];
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          if (x === data.to.x && y === data.to.y) continue;
          const p = dim.grid[y][x];
          if (p && p.type === 'BISHOP' && p.color === movingPiece.color) {
            const isResidentLightSquare = (x + y) % 2 === 0;
            if (isTargetLightSquare === isResidentLightSquare) {
              residentBishops.push({ pos: { x, y, z: data.to.z }, piece: p });
            }
          }
        }
      }

      if (residentBishops.length >= 1) {
        let closestDist = Infinity;
        let closestBishop: any = null;
        for (const rb of residentBishops) {
          const dist = Math.pow(rb.pos.x - data.to.x, 2) + Math.pow(rb.pos.y - data.to.y, 2);
          if (dist < closestDist) {
            closestDist = dist;
            closestBishop = rb;
          }
        }
        if (closestBishop) {
          result.updatedState.dimensions[data.to.z].grid[closestBishop.pos.y][closestBishop.pos.x] = null;
          result.updatedState.eliminatedPieces.push(closestBishop.piece);
          (result.events as any[]).push({ type: 'COLLAPSE', payload: { piece: closestBishop.piece, coord: closestBishop.pos } });
        }
      }
    }

    // --- BLOCO 8: HASHES E EMPATES ---
    const isCapture = targetPiece !== null || isEnPassant;
    const isPawnMove = movingPiece.type === 'PAWN';
    const paradoxOccurred = (result.events as any[]).some((e: any) => e.type === 'COLLAPSE');

    let currentHalfMoveClock = gameState.halfMoveClock || 0;
    let currentStateHashes = gameState.stateHashes || {};

    if (isCapture || isPawnMove || paradoxOccurred || promotedToKing) {
      currentHalfMoveClock = 0;
      currentStateHashes = {};
    } else {
      currentHalfMoveClock++;
    }

    result.updatedState.halfMoveClock = currentHalfMoveClock;
    result.updatedState.stateHashes = currentStateHashes;

    let stateHash = `${result.updatedState.turn}|`;
    result.updatedState.dimensions.forEach((dim: any) => {
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
    result.updatedState.stateHashes[stateHash] = (result.updatedState.stateHashes[stateHash] || 0) + 1;

    // --- BLOCO 9: VALIDAÇÃO FINAL DE XEQUE ---
    if (gameState.modality === 'DYNAMIC') {
      const masterKingBefore = this.engineService.getMasterKingPosition(gameState, gameState.turn);
      const checkDataBefore = this.engineService.getCheckData(gameState, gameState.turn);
      const wasMasterKingInCheckBefore = checkDataBefore && masterKingBefore && checkDataBefore.kingsInCheck.some(k =>
        k.x === masterKingBefore.x && k.y === masterKingBefore.y && k.z === masterKingBefore.z
      );

      if (wasMasterKingInCheckBefore) {
        const masterKingAfter = this.engineService.getMasterKingPosition(result.updatedState, gameState.turn);
        const checkDataAfter = this.engineService.getCheckData(result.updatedState, gameState.turn);
        const isMasterKingInCheckAfter = checkDataAfter && masterKingAfter && checkDataAfter.kingsInCheck.some(k =>
          k.x === masterKingAfter.x && k.y === masterKingAfter.y && k.z === masterKingAfter.z
        );

        if (isMasterKingInCheckAfter) {
          throw new Error('Bloqueio Quântico: O movimento não resolve o xeque do seu Rei Master! Você é obrigado a sair do xeque quando está nessa situação.');
        }
      }
    }

    // --- BLOCO 10: PROGRESSÃO DO TURNO ---
    const nextTurnColor = result.updatedState.modality === 'CLASSIC' || (result.updatedState.modality === 'DYNAMIC' && (result.updatedState.actionsRemaining - 1 <= 0))
      ? (originalTurn === 'WHITE' ? 'BLACK' : 'WHITE')
      : originalTurn;

    const checkDataForNextPlayer = this.engineService.getCheckData(result.updatedState, nextTurnColor);
    const nextMasterKingPos = this.engineService.getMasterKingPosition(result.updatedState, nextTurnColor);
    const isNextMasterKingInCheck = checkDataForNextPlayer && nextMasterKingPos && checkDataForNextPlayer.kingsInCheck.some(k => k.x === nextMasterKingPos.x && k.y === nextMasterKingPos.y && k.z === nextMasterKingPos.z);

    if (result.updatedState.status !== 'COMPLETED') {
      const isClassic = result.updatedState.modality === 'CLASSIC';

      if (isClassic) {
        result.updatedState.turn = originalTurn === 'WHITE' ? 'BLACK' : 'WHITE';
        result.updatedState.actionsRemaining = 1;
      } else {
        result.updatedState.actionsRemaining = (result.updatedState.actionsRemaining || 1) - 1;

        let nextTurn = originalTurn;
        let startZ = data.from.z + 1;

        if (result.updatedState.actionsRemaining <= 0 && isNextMasterKingInCheck) {
          nextTurn = nextTurnColor;
          result.updatedState.activeDimensionIndex = nextMasterKingPos.z;
          result.updatedState.forcedMasterKingSave = true;
        } else {
          result.updatedState.forcedMasterKingSave = false;
          let found = false;

          if (result.updatedState.actionsRemaining > 0) {
            for (let z = startZ; z < result.updatedState.dimensions.length; z++) {
              const dimActive = result.updatedState.dimensions[z].grid.some((row: any[]) => row.some((p: any) => p && p.type === 'KING' && p.color === nextTurn));
              if (dimActive) {
                result.updatedState.activeDimensionIndex = z;
                found = true;
                break;
              }
            }
          }

          if (!found || result.updatedState.actionsRemaining <= 0) {
            nextTurn = originalTurn === 'WHITE' ? 'BLACK' : 'WHITE';
            const masterKingBefore = this.engineService.getMasterKingPosition(gameState, originalTurn);
            const checkDataBefore = this.engineService.getCheckData(gameState, originalTurn);
            const wasInCheckBefore = checkDataBefore && masterKingBefore && checkDataBefore.kingsInCheck.some(k =>
              k.x === masterKingBefore.x && k.y === masterKingBefore.y && k.z === masterKingBefore.z
            );

            let excludedDim: number | undefined = undefined;
            if (wasInCheckBefore) {
              excludedDim = data.from.z;
            }

            const nextDim = this.engineService.getNextValidDimension(result.updatedState, nextTurn, excludedDim);
            if (nextDim !== null) {
              result.updatedState.activeDimensionIndex = nextDim;
              found = true;
            } else {
              result.updatedState.activeDimensionIndex = 0;
            }
          }
        }

        result.updatedState.turn = nextTurn;

        let actionsCount = 0;
        for (let z = 0; z < result.updatedState.dimensions.length; z++) {
          const dimActive = result.updatedState.dimensions[z].isActive && result.updatedState.dimensions[z].grid.some((row: any[]) => row.some((p: any) => p && p.type === 'KING' && p.color === nextTurn));
          if (dimActive) actionsCount++;
        }
        result.updatedState.actionsRemaining = actionsCount;
      }
    }

    // --- BLOCO 11: SALVAMENTO E RETORNO ---
    await this.updateMatchState(match.id, result.updatedState); // Usa o método já existente no seu Service

    return {
      gameState: result.updatedState,
      events: result.events
    };
  }
}