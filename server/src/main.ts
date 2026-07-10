import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from './modules/app.module.js'

const LOCAL_CORS_ORIGINS = ['http://127.0.0.1:5173', 'http://localhost:5173']

function parseCsvEnv(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: ['log', 'warn', 'error'],
  })

  const corsOrigins = parseCsvEnv(process.env.CORS_ORIGINS)

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : LOCAL_CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
  app.setGlobalPrefix('api/v1')

  const port = Number(process.env.PORT ?? 4000)
  const host = process.env.HOST ?? '0.0.0.0'
  await app.listen(port, host)
}

bootstrap().catch((error) => {
  console.error(error)
  process.exit(1)
})
