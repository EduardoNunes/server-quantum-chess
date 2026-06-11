import { GameState, MoveIntent, Vector3D, Piece, Color } from './types';
import { ValidatorFactory } from './validators/ValidatorFactory';

export class GameEngine {
  private state: GameState;

  constructor(initialStateJson: any) {
    // Inicializa ou faz o parse do estado vindo do Prisma (PostgreSQL JSONB)
    this.state = typeof initialStateJson === 'string'
      ? JSON.parse(initialStateJson)
      : initialStateJson;
  }

  /**
   * Retorna o estado atual do jogo (para ser salvo no banco ou enviado via socket)
   */
  public getState(): GameState {
    return this.state;
  }

  /**
   * Valida se o jogador que enviou o comando é o dono da vez
   */
  public validatePlayerTurn(userId: string, whitePlayerId: string, blackPlayerId: string): void {
    const expectedPlayerId = this.state.turn === 'WHITE' ? whitePlayerId : blackPlayerId;
    if (userId !== expectedPlayerId) {
      throw new Error('Não é o seu turno de jogar.');
    }
  }

  /**
   * Orquestrador Principal do Movimento (Pipeline Autoritativo)
   */
  public executeMove(intent: MoveIntent): { type: string; payload: any }[] {
    const events: { type: string; payload: any }[] = [];
    const { from, to, piece } = intent;

    // 1. Validações básicas de contorno (Grid 8x8x4)
    this.validateBounds(from);
    this.validateBounds(to);

    // 2. Garante que a dimensão de destino está ativa (Rei Secundário vivo)
    const targetDimension = this.state.dimensions[to.z];
    if (!targetDimension.isActive && piece.type !== 'PAWN') {
      throw new Error('Esta dimensão está inativa devido a um xeque-mate secundário.');
    }

    // 2. Validação da Peça (Chama a fábrica de validadores que criamos)
    const validator = ValidatorFactory.getValidator(piece.type);
    if (validator) {
      validator.validate(intent, this.state);
    }

    // 3. Verifica se o caminho tridimensional está bloqueado (para peças de passo contínuo)
    if (piece.type !== 'KNIGHT' && piece.type !== 'PAWN') {
      this.checkPathCollision(from, to);
    }

    // 4. PROCESSA O DESTINO (Colapso Amigo vs Captura Inimiga)
    const targetPiece = this.getPieceAt(to);

    if (targetPiece) {
      if (targetPiece.color === piece.color) {
        // --- REGRA DO COLAPSO QUÂNTICO (Peças da mesma cor) ---
        this.handleQuantumCollapse(intent, targetPiece, events);
      } else {
        // --- CAPTURA TRADICIONAL (Peças de cores opostas no mesmo x,y,z) ---
        this.handleClassicCapture(targetPiece, events);
      }
    } else {
      // Regra especial para Peões movendo para dimensões vazias (Regra de aproximação)
      if (piece.type === 'PAWN' && from.z !== to.z) {
        this.handlePawnDimensionCollapse(to, piece.color, events);
      }
    }

    // 5. EFETIVA O MOVIMENTO NA MATRIZ
    this.setPieceAt(from, null);
    this.setPieceAt(to, piece);

    // 6. PROCESSA REGRAS DE REIS E FIM DE JOGO
    this.evaluateKingRules(to, piece, events);

    // 7. PROMOÇÃO DE PEÃO (Eixo Y ou Eixo Z)
    this.handlePawnPromotion(to, piece, events);

    // 8. GERENCIA PASSAGEM DE TURNO (Sistema de 2 Ações Globais)
    this.state.actionsRemaining--;
    if (this.state.actionsRemaining === 0) {
      this.state.turn = this.state.turn === 'WHITE' ? 'BLACK' : 'WHITE';
      this.state.actionsRemaining = 2; // Reseta para o próximo jogador
    }

    // Retorna o log de eventos visuais para o Frontend (efeitos de fumaça, desintegração, som)
    return events;
  }

  /**
   * Gerencia a Desintegração por Colapso (Mesma cor)
   */
  private handleQuantumCollapse(intent: MoveIntent, targetPiece: Piece, events: any[]): void {
    const { piece, to } = intent;

    // Regra dos Reis: O Rei Master sempre colapsa o Secundário. Secundário colapsa se tentar invadir o Master.
    if (piece.type === 'KING' && targetPiece.type === 'KING') {
      if (targetPiece.isMasterKing) {
        // Peça que estava movendo (Secundária) colapsa e some antes de entrar
        events.push({ type: 'COLLAPSE', payload: { piece: piece, coord: intent.from } });
        this.setPieceAt(intent.from, null);
        throw new Error('Movimento suicida: Um Rei secundário colapsou ao tentar invadir a dimensão do Master.');
      } else {
        // Peça antiga (Secundária) colapsa, dando lugar à nova
        events.push({ type: 'COLLAPSE', payload: { piece: targetPiece, coord: to } });
        this.removePieceFromState(targetPiece.id);
        return;
      }
    }

    // Regra Geral: Se for exatamente a mesma peça (ex: Bispo de casas brancas)
    if (piece.type === targetPiece.type) {
      events.push({ type: 'COLLAPSE', payload: { piece: targetPiece, coord: to } });
      this.removePieceFromState(targetPiece.id); // Remove a peça antiga do jogo
    } else {
      throw new Error('Movimento inválido: Uma peça sua diferente já ocupa esta casa nesta dimensão.');
    }
  }

  /**
   * Captura clássica de peças inimigas
   */
  private handleClassicCapture(targetPiece: Piece, events: any[]): void {
    events.push({ type: 'CAPTURE', payload: { piece: targetPiece } });
    this.removePieceFromState(targetPiece.id);
  }

  /**
   * Colapso de Peões por limite de lotação (O mais próximo sofre colapso)
   */
  private handlePawnDimensionCollapse(to: Vector3D, color: Color, events: any[]): void {
    const activePawns = this.getAllPawnsInDimension(to.z, color);

    // Se a dimensão já atingiu o limite de 8 peões daquela cor
    if (activePawns.length >= 8) {
      let closestPawn: { piece: Piece; coord: Vector3D } | null = null;
      let minDistance = Infinity;

      for (const pawn of activePawns) {
        // Distância Euclidiana no plano 2D da dimensão alvo
        const dist = Math.sqrt(Math.pow(to.x - pawn.coord.x, 2) + Math.pow(to.y - pawn.coord.y, 2));
        if (dist < minDistance) {
          minDistance = dist;
          closestPawn = pawn;
        }
      }

      if (closestPawn) {
        events.push({ type: 'COLLAPSE', payload: { piece: closestPawn.piece, coord: closestPawn.coord } });
        this.setPieceAt(closestPawn.coord, null);
        this.removePieceFromState(closestPawn.piece.id);
      }
    }
  }

  /**
   * Avalia as condições de xeque, reis secundários e mate do Rei Master
   */
  private evaluateKingRules(to: Vector3D, piece: Piece, events: any[]): void {
    // Aqui dispara o algoritmo de varredura tridimensional em busca de xeques
    // Se o Rei Master adversário for pego em xeque sem saídas válidas em nenhuma dimensão -> FIM DE JOGO
    // Se um Rei Secundário for pego em mate -> Desativa a dimensão: this.state.dimensions[z].isActive = false
  }

  /**
   * Processa a promoção de peões e ressurreição de dimensões inativas
   */
  private handlePawnPromotion(to: Vector3D, piece: Piece, events: any[]): void {
    if (piece.type !== 'PAWN') return;

    const reachedClassicEnd = (piece.color === 'WHITE' && to.y === 7) || (piece.color === 'BLACK' && to.y === 0);
    const reachedQuantumEnd = (to.z === 3); // Chegou na última fileira dimensional (Z=3 / Dimensão 4)

    if (reachedQuantumEnd) {
      const targetDim = this.state.dimensions[to.z];

      // Se a dimensão destino estava desativada por mate no Rei Secundário antigo
      if (!targetDim.isActive) {
        const oldKing = this.findKingInDimension(to.z, piece.color);
        if (oldKing) {
          events.push({ type: 'COLLAPSE', payload: { piece: oldKing.piece, coord: oldKing.coord } });
          this.setPieceAt(oldKing.coord, null); // Expulsa o Rei antigo em mate
        }

        // Transforma o peão no novo Rei Secundário
        piece.type = 'KING';
        piece.isMasterKing = false;

        // Ativa a dimensão de volta (Cura o tabuleiro)
        targetDim.isActive = true;
        events.push({ type: 'DIMENSION_REACTIVATED', payload: { dimension: to.z } });
      }
    } else if (reachedClassicEnd) {
      // Promoção clássica automática para Rainha
      piece.type = 'QUEEN';
      events.push({ type: 'PROMOTION', payload: { to, newType: 'QUEEN' } });
    }
  }

  // ==========================================
  // MÉTODOS UTILITÁRIOS DE MATRIZ E CONVERSÃO
  // ==========================================

  private getPieceAt(coord: Vector3D): Piece | null {
    return this.state.dimensions[coord.z].grid[coord.y][coord.x];
  }

  private setPieceAt(coord: Vector3D, piece: Piece | null): void {
    this.state.dimensions[coord.z].grid[coord.y][coord.x] = piece;
  }

  private validateBounds(coord: Vector3D): void {
    if (coord.x < 0 || coord.x > 7 || coord.y < 0 || coord.y > 7 || coord.z < 0 || coord.z > 3) {
      throw new Error('Coordenadas fora do espaço quântico permitido.');
    }
  }

  private checkPathCollision(from: Vector3D, to: Vector3D): void {
    // Calcula os passos em X, Y e Z para verificar se existem peças obstruindo a trajetória.
    // Como o jogo é 3D, o laço incrementa simultaneamente dx, dy e dz do ponto de origem ao destino.
  }

  private getAllPawnsInDimension(z: number, color: Color): { piece: Piece; coord: Vector3D }[] {
    const pawns: { piece: Piece; coord: Vector3D }[] = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const p = this.state.dimensions[z].grid[y][x];
        if (p && p.type === 'PAWN' && p.color === color) {
          pawns.push({ piece: p, coord: { x, y, z } });
        }
      }
    }
    return pawns;
  }

  private findKingInDimension(z: number, color: Color) {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const p = this.state.dimensions[z].grid[y][x];
        if (p && p.type === 'KING' && p.color === color) {
          return { piece: p, coord: { x, y, z } };
        }
      }
    }
    return null;
  }

  private removePieceFromState(id: string): void {
    // Varre e deleta referências complementares se necessário
  }
}