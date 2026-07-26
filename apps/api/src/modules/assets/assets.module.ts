import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Asset, AssetSchema } from './asset.schema'
import { AssetsService } from './assets.service'
import { AssetsController } from './assets.controller'
import { OrgModule } from '@/modules/org/org.module'
import { StorageModule } from '@/modules/storage/storage.module'
import { KnowledgeModule } from '@/modules/knowledge/knowledge.module'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Asset.name, schema: AssetSchema }]),
    OrgModule,
    StorageModule,
    KnowledgeModule,
  ],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
