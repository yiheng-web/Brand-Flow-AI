import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
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
  constructor(
    @InjectModel(Asset.name) private assetModel: Model<AssetDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly storageService: StorageService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  async createAsset(userId: string, enterpriseId: string, createDto: CreateAssetDto) {
    if (!enterpriseId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    const { name, type, url, ownerId, ownerType, visibility, metadata } = createDto

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
      enterpriseId: new Types.ObjectId(enterpriseId),
      metadata: metadata || {},
    })

    return asset
  }

  async uploadAsset(
    userId: string,
    enterpriseId: string,
    uploadDto: UploadAssetDto,
    file: UploadedAssetFile,
  ) {
    if (!enterpriseId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    if (!file?.buffer) {
      throw new BadRequestException('上传文件不能为空')
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('当前仅支持上传图片素材')
    }

    await this.assertCanCreateAsset(
      userId,
      enterpriseId,
      uploadDto.ownerId,
      uploadDto.ownerType,
      uploadDto.visibility,
    )

    const assetId = new Types.ObjectId()
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

    const asset = await this.assetModel.create({
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
      enterpriseId: new Types.ObjectId(enterpriseId),
      metadata: {
        tags: this.parseTags(uploadDto.tags),
        description: uploadDto.description,
        ...this.parseMetadata(uploadDto.metadata),
      },
    })

    return this.attachSignedUrl(asset)
  }

  async getAssets(userId: string, enterpriseId: string) {
    if (!enterpriseId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    const user = await this.userModel.findById(userId)
    if (!user) {
      throw new NotFoundException('用户不存在')
    }

    const myTeams = user.memberships
      .filter((m) => m.enterpriseId.toString() === enterpriseId && m.teamId)
      .map((m) => m.teamId?.toString())

    const query = {
      enterpriseId: new Types.ObjectId(enterpriseId),
      $or: [
        { visibility: Visibility.PUBLIC },
        { creatorId: new Types.ObjectId(userId) },
        { visibility: Visibility.ENTERPRISE },
        {
          visibility: Visibility.TEAM,
          ownerType: OwnerType.TEAM,
          ownerId: { $in: myTeams.map((id) => new Types.ObjectId(id)) },
        },
      ],
    }

    const assets = await this.assetModel
      .find(query)
      .populate('creatorId', 'email profile')
      .sort({ createdAt: -1 })

    return Promise.all(assets.map((asset) => this.attachSignedUrl(asset)))
  }

  async deleteAsset(userId: string, assetId: string) {
    const asset = await this.assetModel.findById(assetId)
    if (!asset) {
      throw new NotFoundException('资产不存在')
    }

    if (asset.creatorId.toString() !== userId) {
      if (asset.visibility === Visibility.TEAM || asset.visibility === Visibility.ENTERPRISE) {
        const user = await this.userModel.findById(userId)
        const membership = user?.memberships.find(
          (m) =>
            m.enterpriseId.toString() === asset.enterpriseId.toString() &&
            (!m.teamId ||
              (asset.ownerType === OwnerType.TEAM &&
                m.teamId.toString() === asset.ownerId.toString())),
        )

        if (!membership || (membership.role !== Role.OWNER && membership.role !== Role.ADMIN)) {
          throw new BadRequestException('仅部门主管或企业管理员才能删除公共素材')
        }
      } else {
        throw new BadRequestException('您无权删除此资产')
      }
    }

    // Uploaded files live in the private bucket, so remove the object as part
    // of the same business delete path that removes the database record.
    if (asset.objectKey) {
      await this.storageService.deleteObject(asset.objectKey)
    }

    await this.assetModel.findByIdAndDelete(assetId)
    return { success: true }
  }

  async saveToKnowledge(
    userId: string,
    enterpriseId: string,
    assetId: string,
    dto: SaveAssetToKnowledgeDto,
  ) {
    if (!enterpriseId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    const asset = await this.findAccessibleAsset(userId, enterpriseId, assetId)
    const tags = Array.isArray(asset.metadata?.tags) ? asset.metadata.tags : []
    const content = [
      `素材名称：${asset.name}`,
      `素材类型：${asset.type}`,
      dto.description || asset.metadata?.description
        ? `素材描述：${dto.description || asset.metadata.description}`
        : undefined,
      asset.metadata?.tags?.length ? `标签：${asset.metadata.tags.join(', ')}` : undefined,
      `素材地址：${asset.url}`,
    ]
      .filter(Boolean)
      .join('\n')

    const result = await this.knowledgeService.createItemFromAsset(
      userId,
      enterpriseId,
      dto.knowledgeId,
      {
        title: asset.name,
        content,
        assetId: asset._id.toString(),
        tags,
        fileUrl: asset.url,
        thumbnailUrl: asset.url,
        metadata: {
          assetType: asset.type,
          assetUrl: asset.url,
          objectKey: asset.objectKey,
          description: dto.description || asset.metadata?.description,
        },
      },
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
    enterpriseId: string,
    ownerId: string,
    ownerType: OwnerType,
    visibility: Visibility,
  ) {
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

  private async findAccessibleAsset(userId: string, enterpriseId: string, assetId: string) {
    const asset = await this.assetModel.findOne({
      _id: assetId,
      enterpriseId: new Types.ObjectId(enterpriseId),
    })

    if (!asset) {
      throw new NotFoundException('资产不存在或无权访问')
    }

    if (asset.creatorId.toString() === userId || asset.visibility === Visibility.PUBLIC) {
      return asset
    }

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
    const nameParts = file.originalname.split('.')
    const extFromName = nameParts.length > 1 ? nameParts.pop() : undefined

    if (extFromName) {
      return `.${extFromName.toLowerCase()}`
    }

    const subtype = file.mimetype.split('/')[1]
    return subtype ? `.${subtype}` : ''
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

  private parseMetadata(metadata?: string): Record<string, any> {
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

    // The bucket is private in production; clients should only receive short-lived URLs.
    return {
      ...assetObject,
      signedUrl: await this.storageService.getSignedUrl(asset.objectKey),
      thumbnailSignedUrl: asset.thumbnailObjectKey
        ? await this.storageService.getSignedUrl(asset.thumbnailObjectKey)
        : undefined,
    }
  }
}
