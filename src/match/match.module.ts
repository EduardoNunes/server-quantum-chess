import { Module } from '@nestjs/common';
import { MatchGateway } from './match.gateway';
import { MatchService } from './match.service';
import { QuantumEngineService } from './engine/quantum-engine.service';

@Module({
  providers: [MatchGateway, MatchService, QuantumEngineService],
  exports: [MatchService]
})
export class MatchModule { }