// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import { generateInitialState } from 'src/match/engine/core/InitialState';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando carga de dados de teste...');

  // 1. Cria dois usuários mockados para a partida
  const player1 = await prisma.user.upsert({
    where: { username: 'eduardo_white' },
    update: {},
    create: { id: 'usuario-eduardo-123', username: 'eduardo_white', elo: 1200 }
  });

  const player2 = await prisma.user.upsert({
    where: { username: 'player_black' },
    update: {},
    create: { id: 'usuario-adversario-456', username: 'player_black', elo: 1200 }
  });

  // 2. Cria a partida quântica com o ID exato que o Frontend está buscando
  const initialState = generateInitialState();

  await prisma.match.upsert({
    where: { id: 'ID_DA_PARTIDA_ATUAL' },
    update: {},
    create: {
      id: 'ID_DA_PARTIDA_ATUAL',
      whitePlayerId: player1.id,
      blackPlayerId: player2.id,
      status: 'ONGOING',
      gameState: initialState as any, // Força o JSON do tabuleiro inicial para o PostgreSQL
      moveHistory: []
    }
  });

  console.log('✅ Banco populado! Partida "ID_DA_PARTIDA_ATUAL" pronta para jogar.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
