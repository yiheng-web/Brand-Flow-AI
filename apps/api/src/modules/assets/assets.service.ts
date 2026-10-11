import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common'
import sharp from 'sharp'
import { assertObjectId, personalCreatorFilter } from '@/common/personal-scope'
import { MAX_ASSET_IMAGE_BYTES, ASSET_IMAGE_FORMATS } from './assets.constants'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Asset, AssetDocument } from './asset.schema'
import { AuthorizationService } from '@/modules/org/authorization.service'
import { CreateAssetDto, UploadAssetDto } from './dto/assets.dto'
import { SaveAssetToKnowledgeDto } from './dto/assets.dto'
import { Visibility, OwnerType } from '@/common/enums'
import { StorageService } from '@/modules/storage/storage.service'
import { KnowledgeService } from '@/modules/knowledge/knowledge.service'
import { OrgService } from '@/modules/org/org.service'

interface UploadedAssetFile {
  originalname: string
  mimetype: string
  size: number
  buffer?: Buffer
}

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name)
  constructor(
    @InjectModel(Asset.name) private assetModel: Model<AssetDocument>,
    private readonly authorization: AuthorizationService,
    private readonly storageService: StorageService,
    private readonly knowledgeService: KnowledgeService,
    private readonly orgService: OrgService,
  ) {}

  async createAsset(userId: string, enterpriseId: string | undefined, createDto: CreateAssetDto) {
    const { name, type, url, ownerId, ownerType, visibility, metadata } = createDto
    await this.assertCanCreateAsset(userId, enterpriseId, ownerId, ownerType, visibility)

    const asset = await this.assetModel.create({
      name,
      type,
      url,
      ownerId: new Types.ObjectId(ownerId),
      ownerType,
      visibility,
      creatorId: new Types.ObjectId(userId),
      enterpriseId:
        ownerType !== OwnerType.USER && enterpriseId ? new Types.ObjectId(enterpriseId) : undefined,
      metadata: metadata || {},
    })

    return asset
  }

  async uploadAsset(
    userId: string,
    enterpriseId: string | undefined,
    uploadDto: UploadAssetDto,
    file: UploadedAssetFile,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('上传文件不能为空')
    }

    assertObjectId(uploadDto.ownerId)
    if (file.size > MAX_ASSET_IMAGE_BYTES || file.buffer.length > MAX_ASSET_IMAGE_BYTES) {
      throw new BadRequestException('图片大小不能超过 10 MiB')
    }
    const expectedFormat = ASSET_IMAGE_FORMATS[file.mimetype]
    if (!expectedFormat) throw new BadRequestException('仅支持 PNG、JPEG、WebP、GIF 图片')
    try {
      const image = sharp(file.buffer, { limitInputPixels: 40_000_000 })
      const metadata = await image.metadata()
      if (metadata.format !== expectedFormat) throw new Error('图片格式与 MIME 不一致')
      await image.stats()
    } catch {
      throw new BadRequestException('图片内容无效、格式与 MIME 不一致或像素过大')
    }

    await this.assertCanCreateAsset(
      userId,
      enterpriseId,
      uploadDto.ownerId,
      uploadDto.ownerType,
      uploadDto.visibility,
    )

    const assetId = new Types.ObjectId()
    const metadata = this.parseMetadata(uploadDto.metadata)
    // Keep a stable object key in MongoDB; signed URLs are generated on read.
    const objectKey = this.buildAssetObjectKey(uploadDto, assetId.toString(), file)

    const storedObject = await this.storageService.uploadObject({
      key: objectKey,
      body: file.buffer,
      contentType: file.mimetype,
      size: file.size,
      metadata: {
        uploadedBy: userId,
        ownerType: uploadDto.ownerType,
        ownerId: uploadDto.ownerId,
      },
    })

    let asset: AssetDocument
    try {
      asset = await this.assetModel.create({
        _id: assetId,
        name: uploadDto.name,
        type: uploadDto.type,
        url: this.storageService.getObjectUrl(storedObject.key),
        bucket: storedObject.bucket,
        objectKey: storedObject.key,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        ownerId: new Types.ObjectId(uploadDto.ownerId),
        ownerType: uploadDto.ownerType,
        visibility: uploadDto.visibility,
        creatorId: new Types.ObjectId(userId),
        enterpriseId:
          uploadDto.ownerType !== OwnerType.USER && enterpriseId
            ? new Types.ObjectId(enterpriseId)
            : undefined,
        metadata: {
          tags: this.parseTags(uploadDto.tags),
          description: uploadDto.description,
          ...metadata,
        },
      })
    } catch (error: unknown) {
      try {
        await this.storageService.deleteObject(storedObject.key)
      } catch (cleanupError: unknown) {
        this.logger.error(
          '素材写入失败后的对象清理失败',
          cleanupError instanceof Error ? cleanupError.stack : undefined,
        )
      }
      throw error
    }

    return this.attachSignedUrl(asset, userId)
  }

  async getAssets(userId: string, enterpriseId?: string, spaceId?: string) {
    if (spaceId === 'personal' || (!enterpriseId && !spaceId)) {
      await this.authorization.assertCanReadSpace(userId, 'personal')
      const personalAssets = await this.assetModel
        .find({
          ...personalCreatorFilter(userId),
          ownerId: new Types.ObjectId(userId),
          ownerType: OwnerType.USER,
          visibility: Visibility.PRIVATE,
        })
        .sort({ createdAt: -1 })
      return Promise.all(personalAssets.map((asset) => this.attachSignedUrl(asset, userId)))
    }

    const space = await this.authorization.assertCanReadSpace(
      userId,
      spaceId || enterpriseId || 'personal',
    )
    this.authorization.assertEnterpriseContext(space, enterpriseId)

    if (space.spaceType === 'team') {
      const teamAssets = await this.assetModel
        .find({
          enterpriseId: new Types.ObjectId(enterpriseId),
          $or: [
            {
              ownerType: OwnerType.TEAM,
              ownerId: new Types.ObjectId(space.spaceId),
              visibility: Visibility.TEAM,
            },
            {
              ownerType: OwnerType.ENTERPRISE,
              ownerId: new Types.ObjectId(space.enterpriseId),
              visibility: Visibility.ENTERPRISE,
            },
          ],
        })
        .populate('creatorId', 'email profile')
        .sort({ createdAt: -1 })
      return Promise.all(teamAssets.map((asset) => this.attachSignedUrl(asset, userId)))
    }

    const query = {
      enterpriseId: new Types.ObjectId(enterpriseId),
      ownerId: new Types.ObjectId(enterpriseId),
      ownerType: OwnerType.ENTERPRISE,
      visibility: Visibility.ENTERPRISE,
    }

    const assets = await this.assetModel
      .find(query)
      .populate('creatorId', 'email profile')
      .sort({ createdAt: -1 })

    return Promise.all(assets.map((asset) => this.attachSignedUrl(asset, userId)))
  }

  async deleteAsset(userId: string, assetId: string) {
    assertObjectId(assetId)
    const asset = await this.assetModel.findOne({
      _id: assetId,
      $or: [
        {
          ownerType: OwnerType.USER,
          ownerId: new Types.ObjectId(userId),
          ...personalCreatorFilter(userId),
        },
        { ownerType: { $ne: OwnerType.USER } },
      ],
    })
    if (!asset) {
      throw new NotFoundException('资产不存在')
    }

    if (asset.ownerType === OwnerType.USER && asset.creatorId.toString() !== userId) {
      throw new ForbiddenException('您无权删除此素材')
    }
    await this.assertCanCreateAsset(
      userId,
      asset.enterpriseId?.toString(),
      asset.ownerId.toString(),
      asset.ownerType,
      asset.visibility,
    )

    const remove = async (session?: import('mongoose').ClientSession) => {
      if (asset.ownerType !== OwnerType.USER)
        await this.authorization.assertCanManageAssets(userId, asset.ownerId.toString(), session)
      // 对象先删除；数据库失败时保留记录，重试可完成删除，不丢失审计。
      if (asset.objectKey) {
        this.assertAssetObject(asset, asset.objectKey)
        await this.storageService.deleteObject(asset.objectKey)
      }
      const deleted =
        asset.ownerType === OwnerType.USER
          ? await this.assetModel.findByIdAndDelete(assetId)
          : await this.assetModel.findOneAndDelete(
              { _id: assetId, ownerId: asset.ownerId },
              { session },
            )
      if (deleted && asset.ownerType !== OwnerType.USER)
        await this.orgService.activity.record(
          userId,
          {
            spaceType: asset.ownerType,
            spaceId: asset.ownerId.toString(),
            enterpriseId: asset.enterpriseId?.toString(),
          },
          'asset.deleted',
          'asset',
          assetId,
          {},
          session,
        )
    }
    if (asset.ownerType === OwnerType.USER) await remove()
    else await this.orgService.memberships.transaction(asset.enterpriseId!.toString(), remove)
    return { success: true }
  }

  async saveToKnowledge(
    userId: string,
    enterpriseId: string | undefined,
    assetId: string,
    dto: SaveAssetToKnowledgeDto,
  ) {
    const asset = await this.findAccessibleAsset(userId, enterpriseId, assetId)
    await this.assertCanCreateAsset(
      userId,
      asset.enterpriseId?.toString(),
      asset.ownerId.toString(),
      asset.ownerType,
      asset.visibility,
    )
    const tags = Array.isArray(asset.metadata?.tags)
      ? asset.metadata.tags.filter((tag): tag is string => typeof tag === 'string')
      : []
    const description =
      typeof asset.metadata?.description === 'string' ? asset.metadata.description : undefined
    const content = [
      `素材名称：${asset.name}`,
      `素材类型：${asset.type}`,
      dto.description || description ? `素材描述：${dto.description || description}` : undefined,
      tags.length ? `标签：${tags.join(', ')}` : undefined,
      `素材地址：${asset.url}`,
    ]
      .filter(Boolean)
      .join('\n')

    const result = await this.knowledgeService.createItemFromAsset(
      userId,
      dto.knowledgeId,
      {
        title: asset.name,
        content,
        assetId: asset._id.toString(),
        tags,
        metadata: {
          assetType: asset.type,
          assetUrl: asset.url,
          objectKey: asset.objectKey,
          description: dto.description || asset.metadata?.description,
        },
      },
      asset.ownerType === OwnerType.USER ? 'personal' : asset.ownerId.toString(),
    )

    asset.metadata = {
      ...(asset.metadata || {}),
      savedToKnowledge: true,
      savedKnowledgeId: dto.knowledgeId,
      savedKnowledgeItemId: result.item._id.toString(),
      savedToKnowledgeAt: new Date().toISOString(),
    }
    await asset.save()

    return {
      success: true,
      assetId: asset._id,
      knowledgeId: dto.knowledgeId,
      item: result.item,
      ingest: result.ingest,
    }
  }

  private async assertCanCreateAsset(
    userId: string,
    enterpriseId: string | undefined,
    ownerId: string,
    ownerType: OwnerType,
    visibility: Visibility,
  ) {
    assertObjectId(ownerId)
    this.authorization.assertAssetVisibility(ownerType, visibility)
    if (ownerType === OwnerType.USER) {
      if (ownerId !== userId) throw new ForbiddenException('不能向他人的个人空间写入素材')
      await this.authorization.assertCanManageAssets(userId, 'personal')
      return
    }
    const space = await this.authorization.assertCanManageAssets(userId, ownerId)
    if (space.spaceType !== ownerType) throw new BadRequestException('素材归属类型与目标空间不一致')
    this.authorization.assertEnterpriseContext(space, enterpriseId)
  }

  private async findAccessibleAsset(
    userId: string,
    enterpriseId: string | undefined,
    assetId: string,
  ) {
    assertObjectId(assetId)
    const personal = {
      ownerType: OwnerType.USER,
      ownerId: new Types.ObjectId(userId),
      ...personalCreatorFilter(userId),
    }
    const asset = await this.assetModel.findOne({
      _id: assetId,
      ...(enterpriseId
        ? {
            $or: [
              personal,
              {
                enterpriseId: new Types.ObjectId(enterpriseId),
                ownerType: { $ne: OwnerType.USER },
              },
            ],
          }
        : personal),
    })

    if (!asset) {
      throw new NotFoundException('资产不存在或无权访问')
    }

    if (asset.ownerType === OwnerType.USER) {
      if (asset.ownerId.toString() !== userId || asset.creatorId.toString() !== userId) {
        throw new ForbiddenException('您无权访问此素材')
      }
    } else {
      const space = await this.authorization.assertCanReadSpace(userId, asset.ownerId.toString())
      this.authorization.assertEnterpriseContext(space, asset.enterpriseId?.toString())
      this.authorization.assertEnterpriseContext(space, enterpriseId)
      if (space.spaceType !== asset.ownerType) throw new ForbiddenException('素材归属不一致')
    }
    this.authorization.assertAssetVisibility(asset.ownerType, asset.visibility)
    return asset
  }

  private buildAssetObjectKey(
    uploadDto: UploadAssetDto,
    assetId: string,
    file: UploadedAssetFile,
  ): string {
    const ext = this.getFileExtension(file)
    // Object keys include ownership scope to make cleanup and permission audits easier.
    return `assets/${uploadDto.ownerType}/${uploadDto.ownerId}/${assetId}/original${ext}`
  }

  private getFileExtension(file: UploadedAssetFile): string {
    // 对象路径使用已验证格式，不能继承客户端文件名中的路径或伪造扩展名。
    const format = ASSET_IMAGE_FORMATS[file.mimetype]
    return format === 'jpeg' ? '.jpg' : `.${format}`
  }

  private parseTags(tags?: string): string[] {
    if (!tags) {
      return []
    }

    return tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  }

  private parseMetadata(metadata?: string): Record<string, unknown> {
    if (!metadata) {
      return {}
    }

    try {
      const parsed = JSON.parse(metadata)
      return typeof parsed === 'object' && parsed !== null ? parsed : {}
    } catch {
      throw new BadRequestException('metadata 必须是合法 JSON 字符串')
    }
  }

  private async attachSignedUrl(asset: AssetDocument, userId: string) {
    const scope = await this.authorization.assertCanReadSpace(
      userId,
      asset.ownerType === OwnerType.USER ? 'personal' : asset.ownerId.toString(),
    )
    const assetObject = { ...asset.toObject(), canManage: scope.permissions.manageAssets }

    if (!asset.objectKey) {
      return assetObject
    }

    this.assertAssetObject(asset, asset.objectKey)
    if (asset.thumbnailObjectKey) this.assertAssetObject(asset, asset.thumbnailObjectKey)
    return {
      ...assetObject,
      signedUrl: await this.storageService.getSignedUrl(asset.objectKey),
      thumbnailSignedUrl: asset.thumbnailObjectKey
        ? await this.storageService.getSignedUrl(asset.thumbnailObjectKey)
        : undefined,
    }
  }

  private assertAssetObject(asset: AssetDocument, key: string): void {
    const prefix = `assets/${asset.ownerType}/${asset.ownerId.toString()}/${asset._id.toString()}/`
    if (!key.startsWith(prefix) || key.slice(prefix.length).includes('/') || key.includes('..')) {
      throw new BadRequestException('素材对象缺少可信归属')
    }
  }
}
