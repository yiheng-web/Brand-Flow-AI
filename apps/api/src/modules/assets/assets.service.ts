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
import { User, UserDocument } from '@/modules/org/schemas/user.schema'
import { CreateAssetDto, UploadAssetDto } from './dto/assets.dto'
import { SaveAssetToKnowledgeDto } from './dto/assets.dto'
import { Visibility, OwnerType, Role } from '@/common/enums'
import { StorageService } from '@/modules/storage/storage.service'
import { KnowledgeService } from '@/modules/knowledge/knowledge.service'

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
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly storageService: StorageService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  async createAsset(userId: string, enterpriseId: string | undefined, createDto: CreateAssetDto) {
    const { name, type, url, ownerId, ownerType, visibility, metadata } = createDto
    assertObjectId(ownerId)

    if (ownerType === OwnerType.USER) {
      if (ownerId !== userId) throw new ForbiddenException('不能向他人的个人空间写入素材')
      if (visibility !== Visibility.PRIVATE) {
        throw new BadRequestException('个人素材只能保存到本人私有空间')
      }
    } else if (!enterpriseId) {
      throw new BadRequestException('团队或企业素材需要有效的企业上下文')
    }

    if (visibility === Visibility.TEAM || visibility === Visibility.ENTERPRISE) {
      const user = await this.userModel.findById(userId)
      const membership = user?.memberships.find(
        (m) =>
          m.enterpriseId.toString() === enterpriseId &&
          (!m.teamId || (ownerType === OwnerType.TEAM && m.teamId.toString() === ownerId)),
      )

      if (!membership || (membership.role !== Role.OWNER && membership.role !== Role.ADMIN)) {
        throw new BadRequestException('仅部门主管或企业管理员才能往企业/团队库添加规范素材')
      }
    }

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

    if (uploadDto.ownerType === OwnerType.USER) {
      if (uploadDto.ownerId !== userId) throw new ForbiddenException('不能向他人的个人空间上传素材')
      if (uploadDto.visibility !== Visibility.PRIVATE) {
        throw new BadRequestException('个人素材只能上传到本人私有空间')
      }
    } else if (!enterpriseId) {
      throw new BadRequestException('团队或企业素材需要有效的企业上下文')
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

    return this.attachSignedUrl(asset)
  }

  async getAssets(userId: string, enterpriseId?: string, spaceId?: string) {
    if (spaceId === 'personal' || !enterpriseId) {
      const personalAssets = await this.assetModel
        .find({
          ...personalCreatorFilter(userId),
          ownerId: new Types.ObjectId(userId),
          ownerType: OwnerType.USER,
          visibility: Visibility.PRIVATE,
        })
        .sort({ createdAt: -1 })
      return Promise.all(personalAssets.map((asset) => this.attachSignedUrl(asset)))
    }

    const user = await this.userModel.findById(userId)
    if (!user) {
      throw new NotFoundException('用户不存在')
    }

    const myTeams = user.memberships
      .filter((m) => m.enterpriseId.toString() === enterpriseId && m.teamId)
      .map((m) => m.teamId?.toString())

    if (spaceId && spaceId !== enterpriseId) {
      if (!myTeams.includes(spaceId)) throw new BadRequestException('您不属于当前团队空间')
      const teamAssets = await this.assetModel
        .find({
          enterpriseId: new Types.ObjectId(enterpriseId),
          ownerType: OwnerType.TEAM,
          ownerId: new Types.ObjectId(spaceId),
          visibility: Visibility.TEAM,
        })
        .populate('creatorId', 'email profile')
        .sort({ createdAt: -1 })
      return Promise.all(teamAssets.map((asset) => this.attachSignedUrl(asset)))
    }

    const query = {
      enterpriseId: new Types.ObjectId(enterpriseId),
      $or: [
        { visibility: Visibility.PUBLIC, ownerType: OwnerType.ENTERPRISE },
        { creatorId: new Types.ObjectId(userId) },
        { visibility: Visibility.ENTERPRISE, ownerType: OwnerType.ENTERPRISE },
      ],
    }

    const assets = await this.assetModel
      .find(query)
      .populate('creatorId', 'email profile')
      .sort({ createdAt: -1 })

    return Promise.all(assets.map((asset) => this.attachSignedUrl(asset)))
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

    if (asset.creatorId.toString() !== userId) {
      if (asset.visibility === Visibility.TEAM || asset.visibility === Visibility.ENTERPRISE) {
        const user = await this.userModel.findById(userId)
        const membership = user?.memberships.find(
          (m) =>
            asset.enterpriseId &&
            m.enterpriseId.toString() === asset.enterpriseId.toString() &&
            (!m.teamId ||
              (asset.ownerType === OwnerType.TEAM &&
                m.teamId.toString() === asset.ownerId.toString())),
        )

        if (!membership || (membership.role !== Role.OWNER && membership.role !== Role.ADMIN)) {
          throw new BadRequestException('仅部门主管或企业管理员才能删除公共素材')
        }
      } else {
        throw new ForbiddenException('您无权删除此资产')
      }
    }

    // Uploaded files live in the private bucket, so remove the object as part
    // of the same business delete path that removes the database record.
    if (asset.objectKey) {
      this.assertAssetObject(asset, asset.objectKey)
      await this.storageService.deleteObject(asset.objectKey)
    }

    await this.assetModel.findByIdAndDelete(assetId)
    return { success: true }
  }

  async saveToKnowledge(
    userId: string,
    enterpriseId: string | undefined,
    assetId: string,
    dto: SaveAssetToKnowledgeDto,
  ) {
    const asset = await this.findAccessibleAsset(userId, enterpriseId, assetId)
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

    const result = await this.knowledgeService.createItemFromAsset(userId, dto.knowledgeId, {
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
    })

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
    if (ownerType === OwnerType.USER) {
      if (ownerId !== userId) throw new ForbiddenException('不能向他人的个人空间写入素材')
      if (visibility !== Visibility.PRIVATE) {
        throw new BadRequestException('个人素材只能保存到本人私有空间')
      }
      return
    }
    if (!enterpriseId) throw new BadRequestException('团队或企业素材需要有效的企业上下文')
    if (visibility !== Visibility.TEAM && visibility !== Visibility.ENTERPRISE) {
      return
    }

    const user = await this.userModel.findById(userId)
    const membership = user?.memberships.find(
      (m) =>
        m.enterpriseId.toString() === enterpriseId &&
        (!m.teamId || (ownerType === OwnerType.TEAM && m.teamId.toString() === ownerId)),
    )

    if (!membership || (membership.role !== Role.OWNER && membership.role !== Role.ADMIN)) {
      throw new BadRequestException('仅部门主管或企业管理员才能往企业/团队库添加规范素材')
    }
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

    if (asset.creatorId.toString() === userId || asset.visibility === Visibility.PUBLIC) {
      return asset
    }

    if (!enterpriseId) throw new NotFoundException('资产不存在或无权访问')

    const user = await this.userModel.findById(userId)

    if (
      asset.visibility === Visibility.ENTERPRISE &&
      user?.memberships.some((m) => m.enterpriseId.toString() === enterpriseId)
    ) {
      return asset
    }

    if (asset.visibility === Visibility.TEAM && asset.ownerType === OwnerType.TEAM) {
      const membership = user?.memberships.find(
        (m) =>
          m.enterpriseId.toString() === enterpriseId &&
          m.teamId?.toString() === asset.ownerId.toString(),
      )
      if (membership) {
        return asset
      }
    }

    throw new NotFoundException('资产不存在或无权访问')
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

  private async attachSignedUrl(asset: AssetDocument) {
    const assetObject = asset.toObject()

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
