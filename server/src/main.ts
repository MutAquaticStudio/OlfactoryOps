import 'reflect-metadata'
import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from './modules/app.module.js'
import { resolveLocalApiConfig } from './modules/local-api-config.js'
import { isAppHttpError } from './shared/http-error.js'

@Catch()
class AppHttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse()

    if (isAppHttpError(exception)) {
      response.status(exception.getStatus()).send(exception.getResponse())
      return
    }

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).send(exception.getResponse())
      return
    }

    console.error(exception)
    response.status(500).send({ statusCode: 500, message: 'Internal server error', error: 'Internal Server Error' })
  }
}

async function bootstrap() {
  const config = resolveLocalApiConfig()
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: ['log', 'warn', 'error'],
  })

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  })
  app.useGlobalFilters(new AppHttpErrorFilter())
  app.setGlobalPrefix('api/v1')

  await app.listen(config.port, config.host)
}

bootstrap().catch((error) => {
  console.error(error)
  process.exit(1)
})
