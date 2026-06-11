// injector.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Array auxiliar para posicionar as peças pesadas na ordem correta do xadrez nas pontas
const BACK_ROW_TYPES = ['ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING', 'BISHOP', 'KNIGHT', 'ROOK'];

// APENAS UMA DECLARAÇÃO: Nova estrutura com o exército completo mapeado
const mockInitialState = {
  dimensions: Array.from({ length: 4 }, (_, z) => ({
    level: z,
    isActive: true,
    grid: Array.from({ length: 8 }, (_, y) =>
      Array.from({ length: 8 }, (_, x) => {
        // --- PEÇAS BRANCAS ---
        // Fileira de trás (Torres, Cavalos, Bispos, Rainha e Rei)
        if (y === 0) {
          return { id: `w-${BACK_ROW_TYPES[x].toLowerCase()}-${x}-z${z}`, type: BACK_ROW_TYPES[x], color: 'WHITE' };
        }
        // Fileira da frente (Peões)
        if (y === 1) {
          return { id: `w-pawn-${x}-z${z}`, type: 'PAWN', color: 'WHITE' };
        }

        // --- PEÇAS PRETAS ---
        // Fileira da frente (Peões)
        if (y === 6) {
          return { id: `b-pawn-${x}-z${z}`, type: 'PAWN', color: 'BLACK' };
        }
        // Fileira de trás (Torres, Cavalos, Bispos, Rainha e Rei)
        if (y === 7) {
          return { id: `b-${BACK_ROW_TYPES[x].toLowerCase()}-${x}-z${z}`, type: BACK_ROW_TYPES[x], color: 'BLACK' };
        }

        // Espaço vazio
        return null;
      })
    )
  })),
  turn: 'WHITE',
  actionsRemaining: 2,
  winnerId: null
};

async function run() {
  console.log('Injetando dados via Prisma Client oficial...');

  try {
    // 1. Garante que os usuários de teste existem
    await prisma.user.upsert({
      where: { username: 'eduardo_white' },
      update: {},
      create: { id: 'usuario-eduardo-123', username: 'eduardo_white', elo: 1200 }
    });

    await prisma.user.upsert({
      where: { username: 'player_black' },
      update: {},
      create: { id: 'usuario-adversario-456', username: 'player_black', elo: 1200 }
    });

    // 2. Cria ou atualiza a partida quântica com o ID que o front busca
    await prisma.match.upsert({
      where: { id: 'ID_DA_PARTIDA_ATUAL' },
      update: { gameState: mockInitialState },
      create: {
        id: 'ID_DA_PARTIDA_ATUAL',
        whitePlayerId: 'usuario-eduardo-123',
        blackPlayerId: 'usuario-adversario-456',
        status: 'ONGOING',
        gameState: mockInitialState,
        moveHistory: []
      }
    });

    console.log('✅ Partida e peças completas injetadas com sucesso no PostgreSQL!');
  } catch (error) {
    console.error('❌ Erro na injeção:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();