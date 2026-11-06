import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.set('trust proxy', 1);

  app.enableCors({
    origin: [
      process.env.FRONTEND_URL || 'https://pingcheck-web.vercel.app',
      'http://localhost:3000',
    ],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  const config = new DocumentBuilder()
    .setTitle('PingCheck API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, config));

  app.getHttpAdapter().get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  await app.listen(process.env.PORT || 4000);
}
bootstrap();
