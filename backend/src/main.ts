import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ResponseInterceptor } from './shared/interceptors/response.interceptor';
import helmet from 'helmet';
import { AppDataSource } from './data-source';

async function bootstrap() {
  // Initialize TypeORM DataSource before NestJS app
  await AppDataSource.initialize();
  console.log('TypeORM DataSource initialized');

  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Security headers
  app.use(helmet());

  // CORS - restrict to configured origins in production
  app.enableCors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:4200'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('v1');

  // Global Response Interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Global Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger/OpenAPI Configuration
  const config = new DocumentBuilder()
    .setTitle('AALA.LAND API')
    .setDescription('The Property Management SaaS for the Middle East')
    .setVersion('1.0')
    .addTag('aala')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3010;
  await app.listen(port);
  console.log(`AALA.LAND Backend is breathing on: http://localhost:${port}/v1`);
  console.log(`API Documentation: http://localhost:${port}/docs`);
}
bootstrap();
