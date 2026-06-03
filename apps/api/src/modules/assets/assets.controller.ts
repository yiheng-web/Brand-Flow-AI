import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AssetsService } from './assets.service'
import { CreateAssetDto, SaveAssetToKnowledgeDto, UploadAssetDto } from './dto/assets.dto'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'

@ApiTags('素材资产 Assets')
@ApiBearerAuth()
@Controller('assets')
@UseGuards(JwtAuthGuard) // 保护所有资产端点
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post()
  @ApiOperation({ summary: '创建资产记录' })
  async createAsset(@Req() req: any, @Body() createDto: CreateAssetDto) {
    const userId = req.user.sub
    const enterpriseId = req.user.entId
    return this.assetsService.createAsset(userId, enterpriseId, createDto)
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传图片素材' })
  async uploadAsset(@Req() req: any, @Body() uploadDto: UploadAssetDto, @UploadedFile() file: any) {
    const userId = req.user.sub
    const enterpriseId = req.user.entId
    return this.assetsService.uploadAsset(userId, enterpriseId, uploadDto, file)
  }

  @Get()
  @ApiOperation({ summary: '获取可访问资产列表' })
  async getAssets(@Req() req: any) {
    const userId = req.user.sub
    const enterpriseId = req.user.entId
    return this.assetsService.getAssets(userId, enterpriseId)
  }

  @Post(':id/save-to-knowledge')
  @ApiOperation({ summary: '将素材保存为知识库知识项' })
  async saveToKnowledge(
    @Req() req: any,
    @Param('id') assetId: string,
    @Body() dto: SaveAssetToKnowledgeDto,
  ) {
    const userId = req.user.sub
    const enterpriseId = req.user.entId
    return this.assetsService.saveToKnowledge(userId, enterpriseId, assetId, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除资产' })
  async deleteAsset(@Req() req: any, @Param('id') assetId: string) {
    const userId = req.user.sub
    return this.assetsService.deleteAsset(userId, assetId)
  }
}
