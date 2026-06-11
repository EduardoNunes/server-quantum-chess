// src/match/engine/core/validators/ValidatorFactory.ts
import { PieceType } from '../types';
import { MoveValidator } from './MoveValidator';
import { KnightValidator } from './KnightValidator';
import { RookValidator } from './RookValidator';
import { BishopValidator } from './BishopValidator';
import { QueenValidator, KingValidator } from './KingAndQueenValidator';
import { PawnValidator } from './PawnValidator';

export class ValidatorFactory {
  private static validators: Record<PieceType, MoveValidator> = {
    KNIGHT: new KnightValidator(),
    ROOK: new RookValidator(),
    BISHOP: new BishopValidator(),
    QUEEN: new QueenValidator(),
    KING: new KingValidator(),
    PAWN: new PawnValidator(),
  };

  public static getValidator(type: PieceType): MoveValidator {
    const validator = this.validators[type];
    if (!validator && type !== 'PAWN') {
      throw new Error(`Validador não implementado para a peça: ${type}`);
    }
    return validator;
  }
}