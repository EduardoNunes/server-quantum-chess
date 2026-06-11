import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { MatchModule } from './match/match.module';
import { AuthModule } from './match/auth.module';

@Module({
  imports: [PrismaModule, MatchModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }