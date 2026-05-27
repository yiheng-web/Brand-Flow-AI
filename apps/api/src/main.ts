import 'reflect-metadata'
import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { verifyOpenAiApiKey } from '@brand-flow/agent'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'

const bootstrapLogger = new Logger('Bootstrap')

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

  void verifyOpenAiApiKey().then((result) => {
    if (result.ok) {
      bootstrapLogger.log(result.message)
      return
    }
    bootstrapLogger.warn(
      `${result.message}。工作流中的意图识别/提示词/评估将失败，请更新 apps/api/.env 或设置 AI_MOCK_MODE=true`,
    )
  })
}

void bootstrap()
