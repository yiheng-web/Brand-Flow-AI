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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
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
  @ApiOperation({
    summary: '创建资产记录',
    description:
      '用于登记已经存在 URL 的素材资产。适合外部 CDN 图片、生成图 URL 或已上传对象的补录。',
  })
  @ApiCreatedResponse({ description: '创建成功，返回资产记录。' })
  async createAsset(@Req() req: any, @Body() createDto: CreateAssetDto) {
    const userId = req.user.sub
    const enterpriseId = req.user.entId
    return this.assetsService.createAsset(userId, enterpriseId, createDto)
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '上传图片素材',
    description:
      '上传图片文件到对象存储，并创建 Asset 记录。生产环境返回短期 signedUrl 供前端预览。',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'name', 'type', 'ownerId', 'ownerType', 'visibility'],
      properties: {
        file: { type: 'string', format: 'binary', description: '要上传的图片文件' },
        name: { type: 'string', example: '夏季活动背景图' },
        type: { type: 'string', example: 'background' },
        ownerId: { type: 'string', description: '归属方 ID' },
        ownerType: { type: 'string', enum: ['user', 'team', 'enterprise'] },
        visibility: { type: 'string', enum: ['private', 'team', 'enterprise', 'public'] },
        tags: { type: 'string', example: '海报,夏季,背景' },
        description: { type: 'string', example: '适合夏季促销海报的背景图' },
        metadata: { type: 'string', example: '{"source":"designer-upload"}' },
      },
    },
  })
  @ApiCreatedResponse({ description: '上传成功，返回资产记录和 signedUrl。' })
  async uploadAsset(@Req() req: any, @Body() uploadDto: UploadAssetDto, @UploadedFile() file: any) {
    const userId = req.user.sub
    const enterpriseId = req.user.entId
    return this.assetsService.uploadAsset(userId, enterpriseId, uploadDto, file)
  }

  @Get()
  @ApiOperation({
    summary: '获取可访问资产列表',
    description: '返回当前用户在当前企业下可见的素材，包括本人私有、团队、企业和公开素材。',
  })
  @ApiOkResponse({ description: '返回资产列表。' })
  async getAssets(@Req() req: any) {
    const userId = req.user.sub
    const enterpriseId = req.user.entId
    return this.assetsService.getAssets(userId, enterpriseId)
  }

  @Post(':id/save-to-knowledge')
  @ApiOperation({
    summary: '将素材保存为知识库知识项',
    description:
      '把素材名称、类型、标签、描述和 URL 组装成知识项，保存到 MongoDB，并同步写入向量库供 Agent 检索。',
  })
  @ApiParam({ name: 'id', description: '素材资产 ID' })
  @ApiCreatedResponse({ description: '保存成功，返回 KnowledgeItem 和向量入库结果。' })
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
  @ApiOperation({
    summary: '删除资产',
    description: '删除资产记录；若资产由上传产生且存在 objectKey，会同步删除对象存储中的文件。',
  })
  @ApiParam({ name: 'id', description: '素材资产 ID' })
  @ApiOkResponse({ description: '删除成功，返回 success=true。' })
  async deleteAsset(@Req() req: any, @Param('id') assetId: string) {
    const userId = req.user.sub
    return this.assetsService.deleteAsset(userId, assetId)
  }
}
