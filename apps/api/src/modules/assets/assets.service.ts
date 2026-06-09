import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Asset, AssetDocument } from './asset.schema'
import { Membership, MembershipDocument } from '@/modules/org/schemas/membership.schema'
import { CreateAssetDto, UploadAssetDto } from './dto/assets.dto'
import { SaveAssetToKnowledgeDto } from './dto/assets.dto'
import { Visibility, OwnerType, Role } from '@/common/enums'
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
  constructor(
    @InjectModel(Asset.name) private assetModel: Model<AssetDocument>,
    @InjectModel(Membership.name) private membershipModel: Model<MembershipDocument>,
    private readonly storageService: StorageService,
    private readonly knowledgeService: KnowledgeService,
    private readonly orgService: OrgService,
  ) {}

  async createAsset(userId: string, workspaceId: string, createDto: CreateAssetDto) {
    if (!workspaceId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    const { name, type, url, metadata } = createDto
    const space = await this.orgService.resolveAccessibleSpace(
      userId,
      createDto.spaceId,
      workspaceId,
    )

    const asset = await this.assetModel.create({
      name,
      type,
      url,
      spaceId: new Types.ObjectId(space.spaceId),
      ownerId: new Types.ObjectId(space.ownerId),
      ownerType: space.ownerType,
      visibility: space.visibility,
      creatorId: new Types.ObjectId(userId),
      workspaceId: new Types.ObjectId(space.workspaceId),
      metadata: metadata || {},
    })

    return asset
  }

  async uploadAsset(
    userId: string,
    workspaceId: string,
    uploadDto: UploadAssetDto,
    file: UploadedAssetFile,
  ) {
    if (!workspaceId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    if (!file?.buffer) {
      throw new BadRequestException('上传文件不能为空')
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('当前仅支持上传图片素材')
    }

    const space = await this.orgService.resolveAccessibleSpace(
      userId,
      uploadDto.spaceId,
      workspaceId,
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
        ownerType: space.ownerType,
        ownerId: space.ownerId,
        spaceId: space.spaceId,
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
      spaceId: new Types.ObjectId(space.spaceId),
      ownerId: new Types.ObjectId(space.ownerId),
      ownerType: space.ownerType,
      visibility: space.visibility,
      creatorId: new Types.ObjectId(userId),
      workspaceId: new Types.ObjectId(space.workspaceId),
      metadata: {
        tags: this.parseTags(uploadDto.tags),
        description: uploadDto.description,
        ...this.parseMetadata(uploadDto.metadata),
      },
    })

    return this.attachSignedUrl(asset)
  }

  async getAssets(userId: string, workspaceId: string) {
    if (!workspaceId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    const myTeams = await this.findUserTeamIds(userId, workspaceId)

    const query = {
      workspaceId: new Types.ObjectId(workspaceId),
      $or: [
        { visibility: Visibility.PUBLIC },
        { creatorId: new Types.ObjectId(userId) },
        { visibility: Visibility.WORKSPACE },
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

  async deleteAsset(userId: string, workspaceId: string, assetId: string) {
    if (!workspaceId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    const asset = await this.assetModel.findOne({
      _id: assetId,
      workspaceId: new Types.ObjectId(workspaceId),
    })
    if (!asset) {
      throw new NotFoundException('资产不存在或无权访问')
    }

    if (asset.creatorId.toString() !== userId) {
      if (asset.visibility === Visibility.TEAM || asset.visibility === Visibility.WORKSPACE) {
        const membership = await this.findManagerMembership(
          userId,
          asset.workspaceId.toString(),
          asset.ownerId.toString(),
          asset.ownerType,
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
    workspaceId: string,
    assetId: string,
    dto: SaveAssetToKnowledgeDto,
  ) {
    if (!workspaceId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    const asset = await this.findAccessibleAsset(userId, workspaceId, assetId)
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
      workspaceId,
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
    workspaceId: string,
    ownerId: string,
    ownerType: OwnerType,
    visibility: Visibility,
  ) {
    if (visibility !== Visibility.TEAM && visibility !== Visibility.WORKSPACE) {
      return
    }

    const membership = await this.findManagerMembership(userId, workspaceId, ownerId, ownerType)

    if (!membership || (membership.role !== Role.OWNER && membership.role !== Role.ADMIN)) {
      throw new BadRequestException('仅部门主管或企业管理员才能往企业/团队库添加规范素材')
    }
  }

  private async findAccessibleAsset(userId: string, workspaceId: string, assetId: string) {
    const asset = await this.assetModel.findOne({
      _id: assetId,
      workspaceId: new Types.ObjectId(workspaceId),
    })

    if (!asset) {
      throw new NotFoundException('资产不存在或无权访问')
    }

    if (asset.creatorId.toString() === userId || asset.visibility === Visibility.PUBLIC) {
      return asset
    }

    if (
      asset.visibility === Visibility.WORKSPACE &&
      (await this.hasWorkspaceMembership(userId, workspaceId))
    ) {
      return asset
    }

    if (asset.visibility === Visibility.TEAM && asset.ownerType === OwnerType.TEAM) {
      const membership = await this.membershipModel.findOne({
        userId: new Types.ObjectId(userId),
        workspaceId: new Types.ObjectId(workspaceId),
        scopeType: 'team',
        scopeId: asset.ownerId,
        status: 'active',
      })
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
    return `assets/${uploadDto.spaceId}/${assetId}/original${ext}`
  }

  private async findUserTeamIds(userId: string, workspaceId: string) {
    const memberships = await this.membershipModel.find({
      userId: new Types.ObjectId(userId),
      workspaceId: new Types.ObjectId(workspaceId),
      scopeType: 'team',
      status: 'active',
    })

    return memberships.map((membership) => membership.scopeId.toString())
  }

  private async hasWorkspaceMembership(userId: string, workspaceId: string) {
    const membership = await this.membershipModel.exists({
      userId: new Types.ObjectId(userId),
      workspaceId: new Types.ObjectId(workspaceId),
      scopeType: 'workspace',
      status: 'active',
    })

    return Boolean(membership)
  }

  private async findManagerMembership(
    userId: string,
    workspaceId: string,
    ownerId: string,
    ownerType: OwnerType,
  ) {
    return this.membershipModel.findOne({
      userId: new Types.ObjectId(userId),
      workspaceId: new Types.ObjectId(workspaceId),
      status: 'active',
      ...(ownerType === OwnerType.TEAM
        ? { scopeType: 'team', scopeId: new Types.ObjectId(ownerId) }
        : { scopeType: 'workspace', scopeId: new Types.ObjectId(workspaceId) }),
    })
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
