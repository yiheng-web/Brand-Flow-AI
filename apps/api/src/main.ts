import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // 全局校验管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  )

  // 全局拦截器：包装成功响应
  app.useGlobalInterceptors(new TransformInterceptor())

  // 全局过滤器：处理异常响应
  app.useGlobalFilters(new AllExceptionsFilter())

  // 启用 CORS
  app.enableCors()

  // 设置全局路由前缀
  app.setGlobalPrefix('api')

  const port = process.env.PORT ?? 3000
  await app.listen(port)
}

void bootstrap()
