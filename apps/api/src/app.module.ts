import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { MongooseModule } from '@nestjs/mongoose'
import { BullModule } from '@nestjs/bullmq'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { OrgModule } from './modules/org/org.module'
import { AssetsModule } from './modules/assets/assets.module'
import { AuthModule } from './modules/auth/auth.module'
import { WorkflowModule } from './modules/workflow/workflow.module'
import { KnowledgeModule } from './modules/knowledge/knowledge.module'
import { WorksModule } from './modules/works/works.module'
import { AdminModule } from './modules/admin/admin.module'

@Module({
  imports: [
    OrgModule,
    AssetsModule,
    AuthModule,
    AdminModule,
    WorkflowModule,
    KnowledgeModule,
    WorksModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
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
