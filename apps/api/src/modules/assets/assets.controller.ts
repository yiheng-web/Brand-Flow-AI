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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import {
  ApiCreatedSuccessResponse,
  ApiSuccessArrayResponse,
  ApiSuccessResponse,
} from '@/common/swagger/api-success-response'
import { SuccessResultDto } from '@/common/swagger/common-response.dto'
import { AssetsService } from './assets.service'
import { CreateAssetDto, SaveAssetToKnowledgeDto, UploadAssetDto } from './dto/assets.dto'
import { AssetResponseDto, SaveAssetToKnowledgeResponseDto } from './dto/assets-response.dto'
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard'

@ApiTags('素材资产 Assets')
@Controller('assets')
@UseGuards(JwtAuthGuard) // 保护所有资产端点
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post()
  @ApiOperation({
    summary: '创建资产记录',
  })
  async createAsset(@Req() req: any, @Body() createDto: CreateAssetDto) {
    const userId = req.user.sub
    const workspaceId = req.user.workspaceId
    return this.assetsService.createAsset(userId, workspaceId, createDto)
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '上传图片素材',
  })
  @ApiCreatedSuccessResponse(AssetResponseDto, '上传成功，返回封装后的资产记录和 signedUrl。')
  async uploadAsset(@Req() req: any, @Body() uploadDto: UploadAssetDto, @UploadedFile() file: any) {
    const userId = req.user.sub
    const workspaceId = req.user.workspaceId
    return this.assetsService.uploadAsset(userId, workspaceId, uploadDto, file)
  }

  @Get()
  @ApiOperation({
    summary: '获取可访问资产列表',
    description: '返回当前用户在当前企业下可见的素材，包括本人私有、团队、企业和公开素材。',
  })
  @ApiSuccessArrayResponse(AssetResponseDto, '返回封装后的资产列表。')
  async getAssets(@Req() req: any) {
    const userId = req.user.sub
    const workspaceId = req.user.workspaceId
    return this.assetsService.getAssets(userId, workspaceId)
  }

  @Post(':id/save-to-knowledge')
  @ApiOperation({
    summary: '将素材保存为知识库知识项',
    description:
      '把素材名称、类型、标签、描述和 URL 组装成知识项，保存到 MongoDB，并同步写入向量库供 Agent 检索。',
  })
  @ApiParam({ name: 'id', description: '素材资产 ID' })
  @ApiCreatedSuccessResponse(
    SaveAssetToKnowledgeResponseDto,
    '保存成功，返回封装后的 KnowledgeItem 和向量入库结果。',
  )
  async saveToKnowledge(
    @Req() req: any,
    @Param('id') assetId: string,
    @Body() dto: SaveAssetToKnowledgeDto,
  ) {
    const userId = req.user.sub
    const workspaceId = req.user.workspaceId
    return this.assetsService.saveToKnowledge(userId, workspaceId, assetId, dto)
  }

  @Delete(':id')
  @ApiOperation({
    summary: '删除资产',
    description: '删除资产记录；若资产由上传产生且存在 objectKey，会同步删除对象存储中的文件。',
  })
  @ApiParam({ name: 'id', description: '素材资产 ID' })
  @ApiSuccessResponse(SuccessResultDto, '删除成功，返回封装后的 success=true。')
  async deleteAsset(@Req() req: any, @Param('id') assetId: string) {
    const userId = req.user.sub
    const workspaceId = req.user.workspaceId
    return this.assetsService.deleteAsset(userId, workspaceId, assetId)
  }
}
