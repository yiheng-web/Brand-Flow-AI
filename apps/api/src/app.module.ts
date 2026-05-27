import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { join } from 'node:path'
import { MongooseModule } from '@nestjs/mongoose'
import { BullModule } from '@nestjs/bullmq'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './modules/auth/auth.module'
import { WorkflowModule } from './modules/workflow/workflow.module'
import { TeamModule } from './modules/team/team.module'
import { KnowledgeModule } from './modules/knowledge/knowledge.module'

@Module({
  imports: [
    AuthModule,
    WorkflowModule,
    TeamModule,
    KnowledgeModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(__dirname, '..', '.env'), '.env'],
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
        connection: {
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
