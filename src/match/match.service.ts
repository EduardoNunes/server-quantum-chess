// src/match/match.service.ts
import { Injectable } from '@nestjs/common';
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
   * Atualiza o estado do jogo (gameState) no banco de dados
   */
  async updateMatchState(matchId: string, updatedState: any) {
    return this.prisma.match.update({
      where: {
        id: matchId,
      },
      data: {
        gameState: updatedState,
        // Se a engine detectou um vencedor, você pode mudar o status aqui também:
        status: updatedState.winnerId ? 'FINISHED' : 'ONGOING',
        winnerId: updatedState.winnerId,
      },
    });
  }
}