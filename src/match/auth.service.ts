import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(username: string) {
    const normalizedUsername = username.trim();
    
    // Busca o usuário. Se for a primeira vez acessando, já o cadastra automaticamente
    const user = await this.prisma.user.upsert({
      where: { username: normalizedUsername },
      update: {},
      create: {
        username: normalizedUsername,
        elo: 1200, // ELO base inicial para novos jogadores
      },
    });
    return user;
  }
}