import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'http://localhost:5173',
      'https://multimensional-chess.netlify.app',
      'https://www.multimensional-chess.netlify.app'
    ],
    credentials: true,
  });

  await app.listen(3000);
}
bootstrap();
