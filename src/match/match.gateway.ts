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
    @MessageBody() data: { matchId: string; from: any; to: any; promotionType?: string }
  ) {
    const userId = client.handshake.auth.userId;
    console.log(`... [GATEWAY] Tentativa de movimento de ${userId} na partida ${data.matchId}`);

    try {
      const match = await this.matchService.findMatchById(data.matchId);
      if (!match) throw new Error('Partida não encontrada.');

      const gameState = match.gameState as any;
      const originalTurn = gameState.turn;

      const isWhite = String(userId).trim() === String(match.whitePlayerId).trim();
      const isBlack = String(userId).trim() === String(match.blackPlayerId).trim();

      if (!isWhite && !isBlack) {
        throw new Error('Bloqueio Quântico: Espectadores não podem alterar a linha do tempo.');
      }

      // 🚨 TRAVA DO TURNO 0: Impede qualquer movimento se os Reis Master não foram escolhidos
      if (!gameState.whiteMasterKing || !gameState.blackMasterKing) {
        throw new Error('Bloqueio Quântico: A partida não pode começar antes que ambos os jogadores consagrem seus Reis Master.');
      }

      // 1. Verifica a peça na origem de forma autoritativa no tabuleiro ANTES do motor processar
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
        if (data.from.z !== gameState.activeDimensionIndex) {
          throw new Error(`Bloqueio Quântico: Na Modalidade Dinâmica, a sua jogada atual deve ser realizada obrigatoriamente na Dimensão ${gameState.activeDimensionIndex + 1}.`);
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

      // 2. Comparações permissivas para evitar falhas por tipagem (string vs number) no Socket
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

      // 3. Validação Tripla Blindada: Checa a flag na peça local OU o ponteiro global OU a declaração do cliente
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

      // Identifica intenção de En Passant ANTES do movimento para remover a peça capturada
      const isEnPassant = movingPiece?.type === 'PAWN' &&
        targetPiece === null &&
        Math.abs(data.to.x - data.from.x) === 1 &&
        Math.abs(data.to.y - data.from.y) === 1;
      const capturedEnPassantPiecePos = isEnPassant && gameState.moveHistory?.length > 0
        ? gameState.moveHistory[gameState.moveHistory.length - 1].to
        : null;

      // Executa a movimentação delegando à Engine Service Autoritativa
      // NOTA: Para o Roque Dimensional, a engine irá processar como uma "captura" da peça aliada, que o gateway irá corrigir.
      // CORREÇÃO: Passando o ID da partida (string) e não o objeto match inteiro
      const result = await this.engineService.processMove(match.id, userId, data.from, data.to);

      // GARANTIA DE STATUS: Atualiza o ponteiro de coordenada caso o Rei Master tenha se movido
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

      // RESTAURAÇÃO DE SEGURANÇA: Garante que ambos os Reis Masters mantenham suas flags na matriz para salvar no DB
      // Limpeza preventiva de flags duplicadas devido ao Roque Dimensional
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

      // Roque: Movimenta a torre correspondente automaticamente
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

      // Roque Dimensional: Troca a posição dos dois reis
      if (isDimensionalCastling) {
        // O motor moveu o rei de 'from' para 'to', "capturando" o rei alvo.
        // Agora, colocamos o rei que estava no alvo (targetPiece) na posição 'from' original.
        if (targetPiece) {
          result.updatedState.dimensions[data.from.z].grid[data.from.y][data.from.x] = { ...targetPiece, hasMoved: true };
        }
      }

      // Marca a peça movida como alterada para impedir que faça o Roque posteriormente
      const pieceAtDest = result.updatedState.dimensions[data.to.z]?.grid[data.to.y]?.[data.to.x];
      if (pieceAtDest) {
        pieceAtDest.hasMoved = true;
      }

      // Remove a peça capturada do tabuleiro no caso de En Passant
      if (isEnPassant && capturedEnPassantPiecePos) {
        result.updatedState.dimensions[capturedEnPassantPiecePos.z].grid[capturedEnPassantPiecePos.y][capturedEnPassantPiecePos.x] = null;
      }

      // Efetiva a Promoção do Peão
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

      // PARADOXO DE REIS
      if ((movingPiece.type === 'KING' && data.from.z !== data.to.z && !isDimensionalCastling) || promotedToKing) {
        let residentKingPos: any = null;
        let residentKingPiece: any = null;

        const dim = result.updatedState.dimensions[data.to.z];
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            if (x === data.to.x && y === data.to.y) continue; // Pula a casa de destino para não contar o rei que acabou de chegar
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
            // O Rei Master é Soberano: O Rei (secundário) que saltou colapsa!
            result.updatedState.dimensions[data.to.z].grid[data.to.y][data.to.x] = null;
            (result.events as any[]).push({ type: 'COLLAPSE', payload: { piece: pieceAtDest, coord: data.to } });
          } else {
            // O Rei recém-chegado vence o conflito de continuidade: Rei residente colapsa
            result.updatedState.dimensions[data.to.z].grid[residentKingPos.y][residentKingPos.x] = null;
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

        if (residentQueens.length >= 1) { // Limite Dimensional de Rainhas Atingido
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

        if (residentRooks.length >= 2) { // Limite Dimensional de Torres Atingido
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

        if (residentKnights.length >= 2) { // Limite Dimensional de Cavalos Atingido
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

        if (residentPawns.length >= 8) { // Limite Dimensional de Peões Atingido
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

        if (residentBishops.length >= 1) { // Limite Dimensional de Bispos por cor Atingido
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
            (result.events as any[]).push({ type: 'COLLAPSE', payload: { piece: closestBishop.piece, coord: closestBishop.pos } });
          }
        }
      }

      // RASTREAMENTO DE EMPATES: Regra dos 50 Movimentos e Tríplice Repetição
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

      // PROGRESSÃO DO TURNO (Dinâmico x Clássico)
      if (result.updatedState.status !== 'COMPLETED') {
        const isClassic = result.updatedState.modality === 'CLASSIC';

        if (isClassic) {
          result.updatedState.turn = originalTurn === 'WHITE' ? 'BLACK' : 'WHITE';
          result.updatedState.actionsRemaining = 1;
        } else {
          // DYNAMIC
          let startZ = data.from.z + 1; // Próxima dimensão
          let found = false;
          let nextTurn = originalTurn;

          for (let z = startZ; z < result.updatedState.dimensions.length; z++) {
            const dimActive = result.updatedState.dimensions[z].grid.some((row: any[]) => row.some((p: any) => p && p.type === 'KING' && p.color === nextTurn));
            if (dimActive) {
              result.updatedState.activeDimensionIndex = z;
              found = true;
              break;
            }
          }

          if (!found) {
            nextTurn = originalTurn === 'WHITE' ? 'BLACK' : 'WHITE';
            for (let z = 0; z < result.updatedState.dimensions.length; z++) {
              const dimActive = result.updatedState.dimensions[z].grid.some((row: any[]) => row.some((p: any) => p && p.type === 'KING' && p.color === nextTurn));
              if (dimActive) {
                result.updatedState.activeDimensionIndex = z;
                found = true;
                break;
              }
            }
            if (!found) result.updatedState.activeDimensionIndex = 0;
          }

          result.updatedState.turn = nextTurn;

          let actionsCount = 0;
          const startActiveDimIndex = result.updatedState.activeDimensionIndex ?? 0;
          for (let z = startActiveDimIndex; z < result.updatedState.dimensions.length; z++) {
            const dimActive = result.updatedState.dimensions[z].grid.some((row: any[]) => row.some((p: any) => p && p.type === 'KING' && p.color === nextTurn));
            if (dimActive) actionsCount++;
          }
          result.updatedState.actionsRemaining = actionsCount;
        }
      }

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
    gameState.actionsRemaining = gameState.modality === 'CLASSIC' ? 1 : 0;
    if (gameState.modality === 'DYNAMIC') gameState.activeDimensionIndex = 0;
    gameState.moveHistory = [];
    gameState.halfMoveClock = 0;
    gameState.stateHashes = {};

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
      actionsRemaining: data.modality === 'CLASSIC' ? 1 : 0,
      status: (!data.whitePlayerId || !data.blackPlayerId) ? 'WAITING_FOR_OPPONENT' : 'ONGOING',
      whitePlayerId: data.whitePlayerId,
      blackPlayerId: data.blackPlayerId,
      whiteMasterKing: null,
      blackMasterKing: null,
      moveHistory: [],
      halfMoveClock: 0,
      stateHashes: {},
      dimensions: Array.from({ length: data.totalDimensions }).map((_, z) => ({
        level: z,
        isActive: true,
        grid: Array.from({ length: 8 }).map((_, y) =>
          Array.from({ length: 8 }).map((__, x) => {
            // Inicializa Peões nas fileiras 1 e 6
            if (y === 1) return { type: 'PAWN', color: 'WHITE', hasMoved: false };
            if (y === 6) return { type: 'PAWN', color: 'BLACK', hasMoved: false };

            // Inicializa peças maiores nas fileiras traseiras 0 e 7
            if (y === 0) return { type: BACK_ROW_TYPES[x], color: 'WHITE', hasMoved: false };
            if (y === 7) return { type: BACK_ROW_TYPES[x], color: 'BLACK', hasMoved: false };

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
}