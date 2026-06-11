import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body('username') username: string) {
    if (!username) throw new BadRequestException('O nome de usuário é obrigatório.');
    return this.authService.login(username);
  }
}