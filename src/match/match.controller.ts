import { Controller, Post, Body, BadRequestException, Get, Param } from '@nestjs/common';
import { MatchService } from './match.service';

@Controller('matches')
export class MatchController {
  constructor(private readonly matchService: MatchService) { }

  // No seu match.controller.ts (Back-end)
  @Get(':matchId/replay')
  async getReplayStates(@Param('matchId') matchId: string) {
    return await this.matchService.generateReplayStates(matchId);
  }
}