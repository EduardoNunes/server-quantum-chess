// src/match/engine/core/validators/MoveValidator.ts
import { GameState, MoveIntent } from '../types';

export interface MoveValidator {
  validate(intent: MoveIntent, state: GameState): boolean;
}