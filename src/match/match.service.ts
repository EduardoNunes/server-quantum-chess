// src/match/match.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // Ajuste o caminho se necessário

@Injectable()
export class MatchService {
  constructor(private readonly prisma: PrismaService) { }

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
          if (y === 1) return { id: `w-pawn-${x}-z${z}`, type: 'PAWN', color: 'WHITE' };
          if (y === 6) return { id: `b-pawn-${x}-z${z}`, type: 'PAWN', color: 'BLACK' };

          // Inicializa peças maiores nas fileiras traseiras 0 e 7
          if (y === 0) return { id: `w-${BACK_ROW_TYPES[x].toLowerCase()}-${x}-z${z}`, type: BACK_ROW_TYPES[x], color: 'WHITE' };
          if (y === 7) return { id: `b-${BACK_ROW_TYPES[x].toLowerCase()}-${x}-z${z}`, type: BACK_ROW_TYPES[x], color: 'BLACK' };

          return null;
        }),
      ),
    }));

    // Acopla o novo grid limpo preservando a limpeza dos Reis Master (retorno ao Turno 0)
    const resetedGameState = {
      ...baseCleanState,
      dimensions: freshDimensions,
    };

    return resetedGameState;
  }
}