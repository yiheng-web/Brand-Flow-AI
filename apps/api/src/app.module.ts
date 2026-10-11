import { HealthModule } from './modules/health/health.module'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import { BullModule } from '@nestjs/bullmq'
import { resolve } from 'node:path'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { OrgModule } from './modules/org/org.module'
import { AssetsModule } from './modules/assets/assets.module'
import { AuthModule } from './modules/auth/auth.module'
import { WorkflowModule } from './modules/workflow/workflow.module'
import { KnowledgeModule } from './modules/knowledge/knowledge.module'
import { WorksModule } from './modules/works/works.module'
import { TasksModule } from './modules/tasks/tasks.module'

@Module({
  imports: [
    TasksModule,
    OrgModule,
    HealthModule,
    AssetsModule,
    AuthModule,
    WorkflowModule,
    KnowledgeModule,
    WorksModule,
    ConfigModule.forRoot({
      isGlobal: true,
      // API 可能由仓库根目录或包目录启动，环境文件路径不能依赖当前工作目录。
      envFilePath: resolve(__dirname, '..', '.env'),
    }),

    // 初始化 MongoDB 连接
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),

    // 初始化 BullMQ (Redis) 连接池
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        prefix: configService.get<string>('REDIS_QUEUE_PREFIX') ?? 'bull',
        connection: {
          host: configService.get<string>('REDIS_HOST'),
          port: Number(configService.get('REDIS_PORT') ?? 6379),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
          db: Number(configService.get('REDIS_DB') ?? 0),
          connectTimeout: 3000,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
