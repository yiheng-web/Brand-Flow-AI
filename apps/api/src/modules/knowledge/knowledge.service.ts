import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { FilterQuery, Model, Types } from 'mongoose'
import { Knowledge, KnowledgeDocument, KnowledgeVisibility } from './schemas/knowledge.schema'
import {
  KnowledgeItem,
  KnowledgeItemDocument,
  KnowledgeItemStatus,
  KnowledgeItemType,
} from './schemas/knowledge-item.schema'
import {
  CreateKnowledgeDto,
  CreateKnowledgeItemDto,
  UpdateKnowledgeDto,
  UpdateKnowledgeItemDto,
} from './dto/knowledge.dto'
import { OrgService, SpaceContext } from '@/modules/org/org.service'
import { ingestDocument, IngestMetadata } from '@brand-flow/agent'

export interface AvailableKnowledgeBase {
  id: string
  name: string
  scope: 'personal' | 'team' | 'enterprise'
  visibility: KnowledgeVisibility
  required: boolean
  selectedByDefault: boolean
  disabled: boolean
  source: 'personal' | 'team' | 'enterprise'
}

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectModel(Knowledge.name) private knowledgeModel: Model<KnowledgeDocument>,
    @InjectModel(KnowledgeItem.name)
    private knowledgeItemModel: Model<KnowledgeItemDocument>,
    private orgService: OrgService,
  ) {}

  async create(userId: string, enterpriseId: string | undefined, dto: CreateKnowledgeDto) {
    const space = await this.resolveRequestSpace(userId, enterpriseId, dto.spaceId)

    const knowledge = await this.knowledgeModel.create({
      name: dto.name,
      description: dto.description,
      pineconeNamespace: dto.pineconeNamespace,
      visibility: dto.visibility ?? this.defaultVisibility(space),
      isRequired: dto.isRequired ?? false,
      itemCount: 0,
      storageUsed: 0,
      creatorId: new Types.ObjectId(userId),
      ...this.scopeFields(space),
    })

    return knowledge
  }

  async findAll(userId: string, enterpriseId?: string, spaceId?: string) {
    const space = await this.resolveRequestSpace(userId, enterpriseId, spaceId)

    return this.knowledgeModel
      .find(this.knowledgeListQuery(space))
      .populate('creatorId', 'email profile')
      .sort({ createdAt: -1 })
  }

  async findAvailable(
    userId: string,
    enterpriseId?: string,
    spaceId?: string,
  ): Promise<AvailableKnowledgeBase[]> {
    const space = await this.resolveRequestSpace(userId, enterpriseId, spaceId)
    const knowledge = await this.knowledgeModel.find(this.availableKnowledgeQuery(space)).sort({
      scope: 1,
      createdAt: -1,
    })

    return knowledge.map((item) => {
      const scope = this.normalizedScope(item)
      const required = Boolean(item.isRequired)

      return {
        id: item._id.toString(),
        name: item.name,
        scope,
        visibility: item.visibility ?? this.defaultVisibilityForScope(scope),
        required,
        selectedByDefault: required,
        disabled: required,
        source: scope,
      }
    })
  }

  async findOne(userId: string, enterpriseId: string | undefined, id: string) {
    const knowledge = await this.findAccessibleKnowledge(userId, enterpriseId, id)
    return knowledge.populate('creatorId', 'email profile')
  }

  async update(
    userId: string,
    enterpriseId: string | undefined,
    id: string,
    dto: UpdateKnowledgeDto,
  ) {
    await this.assertCanManageKnowledge(userId, enterpriseId, id)

    return this.knowledgeModel.findByIdAndUpdate(
      id,
      {
        name: dto.name,
        description: dto.description,
        visibility: dto.visibility,
        isRequired: dto.isRequired,
        pineconeNamespace: dto.pineconeNamespace,
      },
      { new: true },
    )
  }

  async ingestText(
    userId: string,
    enterpriseId: string | undefined,
    knowledgeId: string,
    content: string,
  ) {
    if (!content?.trim()) {
      throw new BadRequestException('文本内容不能为空')
    }

    const knowledge = await this.assertCanManageKnowledge(userId, enterpriseId, knowledgeId)
    const metadata = this.vectorMetadata(knowledge)

    const result = await ingestDocument(
      content,
      this.cleanMetadata({
        ...metadata,
        knowledgeId,
        knowledgeBaseId: knowledgeId,
        status: 'active',
        type: 'text_doc',
      }),
    )

    return {
      message: `成功入库，共生成 ${result.chunks} 个向量切片`,
      ...result,
    }
  }

  async createItem(
    userId: string,
    enterpriseId: string | undefined,
    knowledgeId: string,
    dto: CreateKnowledgeItemDto,
  ) {
    const knowledge = await this.assertCanManageKnowledge(userId, enterpriseId, knowledgeId)
    this.assertItemPayload(dto)

    const status = (dto.status ??
      (await this.defaultItemStatusForKnowledge(userId, knowledge))) as KnowledgeItemStatus
    const item = await this.knowledgeItemModel.create({
      knowledgeId: new Types.ObjectId(knowledgeId),
      ...this.itemScopeFields(knowledge),
      type: (dto.type ?? 'text_doc') as KnowledgeItemType,
      title: dto.title,
      content: dto.content,
      fileUrl: dto.fileUrl,
      thumbnailUrl: dto.thumbnailUrl,
      tags: dto.tags || [],
      sourceType: 'manual',
      status,
      creatorId: new Types.ObjectId(userId),
      metadata: dto.metadata || {},
    })

    await this.knowledgeModel.findByIdAndUpdate(knowledgeId, { $inc: { itemCount: 1 } })

    const ingest =
      status === 'active' && dto.content
        ? await this.ingestItemContent(knowledge, item, dto.content)
        : undefined

    return {
      item,
      ingest,
    }
  }

  async createItemFromAsset(
    userId: string,
    enterpriseId: string | undefined,
    knowledgeId: string,
    payload: {
      title: string
      content: string
      assetId: string
      tags?: string[]
      metadata?: Record<string, any>
      fileUrl?: string
      thumbnailUrl?: string
    },
  ) {
    const knowledge = await this.assertCanManageKnowledge(userId, enterpriseId, knowledgeId)

    const item = await this.knowledgeItemModel.create({
      knowledgeId: new Types.ObjectId(knowledgeId),
      ...this.itemScopeFields(knowledge),
      type: 'image_asset',
      title: payload.title,
      content: payload.content,
      fileUrl: payload.fileUrl,
      thumbnailUrl: payload.thumbnailUrl,
      tags: payload.tags || [],
      sourceType: 'asset',
      assetId: new Types.ObjectId(payload.assetId),
      status: 'active',
      creatorId: new Types.ObjectId(userId),
      metadata: payload.metadata || {},
    })

    await this.knowledgeModel.findByIdAndUpdate(knowledgeId, { $inc: { itemCount: 1 } })

    const ingest = await this.ingestItemContent(knowledge, item, payload.content)

    return {
      item,
      ingest,
    }
  }

  async findItems(userId: string, enterpriseId: string | undefined, knowledgeId: string) {
    await this.findAccessibleKnowledge(userId, enterpriseId, knowledgeId)

    return this.knowledgeItemModel
      .find({ knowledgeId: new Types.ObjectId(knowledgeId) })
      .populate('creatorId', 'email profile')
      .sort({ createdAt: -1 })
  }

  async findItem(
    userId: string,
    enterpriseId: string | undefined,
    knowledgeId: string,
    itemId: string,
  ) {
    await this.findAccessibleKnowledge(userId, enterpriseId, knowledgeId)

    const item = await this.knowledgeItemModel
      .findOne({
        _id: itemId,
        knowledgeId: new Types.ObjectId(knowledgeId),
      })
      .populate('creatorId', 'email profile')

    if (!item) {
      throw new NotFoundException('知识项不存在或无权访问')
    }

    return item
  }

  async updateItem(
    userId: string,
    enterpriseId: string | undefined,
    knowledgeId: string,
    itemId: string,
    dto: UpdateKnowledgeItemDto,
  ) {
    const knowledge = await this.assertCanManageKnowledge(userId, enterpriseId, knowledgeId)
    await this.findItem(userId, enterpriseId, knowledgeId, itemId)

    const update: Record<string, unknown> = {
      type: dto.type,
      title: dto.title,
      content: dto.content,
      fileUrl: dto.fileUrl,
      thumbnailUrl: dto.thumbnailUrl,
      tags: dto.tags,
      status: dto.status,
      rejectedReason: dto.rejectedReason,
      metadata: dto.metadata,
    }

    Object.keys(update).forEach((key) => update[key] === undefined && delete update[key])

    const item = await this.knowledgeItemModel.findByIdAndUpdate(itemId, update, { new: true })

    if (item?.status === 'active' && dto.content) {
      await this.ingestItemContent(knowledge, item, dto.content)
    }

    return item
  }

  async removeItem(
    userId: string,
    enterpriseId: string | undefined,
    knowledgeId: string,
    itemId: string,
  ) {
    await this.assertCanManageKnowledge(userId, enterpriseId, knowledgeId)
    const item = await this.findItem(userId, enterpriseId, knowledgeId, itemId)

    await this.knowledgeItemModel.findByIdAndDelete(item._id)
    await this.knowledgeModel.findByIdAndUpdate(knowledgeId, { $inc: { itemCount: -1 } })

    return { success: true }
  }

  async remove(userId: string, enterpriseId: string | undefined, id: string) {
    const knowledge = await this.assertCanManageKnowledge(userId, enterpriseId, id)

    await this.knowledgeItemModel.deleteMany({ knowledgeId: knowledge._id })
    await this.knowledgeModel.findByIdAndDelete(knowledge._id)

    return { success: true }
  }

  async getRecords(
    userId: string,
    enterpriseId: string | undefined,
    knowledgeId: string,
  ): Promise<any[]> {
    await this.findAccessibleKnowledge(userId, enterpriseId, knowledgeId)

    const { listKnowledgeRecords } = await import('@brand-flow/agent')
    return listKnowledgeRecords(knowledgeId)
  }

  async resolveCallableKnowledgeBases(
    userId: string,
    enterpriseId: string | undefined,
    spaceId: string | undefined,
    selectedKnowledgeBaseIds: string[] = [],
  ) {
    if (selectedKnowledgeBaseIds.length > 3) {
      throw new BadRequestException('一次创作最多选择 3 个知识库')
    }

    const available = await this.findAvailable(userId, enterpriseId, spaceId)
    const availableIds = new Set(available.map((item) => item.id))
    const requiredIds = available.filter((item) => item.required).map((item) => item.id)

    for (const id of selectedKnowledgeBaseIds) {
      if (!availableIds.has(id)) {
        throw new BadRequestException('选择的知识库不属于当前空间或无权访问')
      }
    }

    return Array.from(new Set([...requiredIds, ...selectedKnowledgeBaseIds]))
  }

  private async resolveRequestSpace(userId: string, enterpriseId?: string, spaceId?: string) {
    if (spaceId) {
      return this.orgService.resolveSpaceContext(userId, spaceId)
    }

    if (enterpriseId) {
      return this.orgService.resolveSpaceContext(userId, enterpriseId)
    }

    return this.orgService.resolveSpaceContext(userId, 'personal')
  }

  private scopeFields(space: SpaceContext) {
    return {
      scope: space.spaceType,
      ownerUserId: space.ownerUserId ? new Types.ObjectId(space.ownerUserId) : undefined,
      teamId: space.teamId ? new Types.ObjectId(space.teamId) : undefined,
      enterpriseId: space.enterpriseId ? new Types.ObjectId(space.enterpriseId) : undefined,
    }
  }

  private itemScopeFields(knowledge: KnowledgeDocument) {
    const scope = this.normalizedScope(knowledge)

    return {
      scope,
      ownerUserId: knowledge.ownerUserId,
      teamId: knowledge.teamId,
      enterpriseId: knowledge.enterpriseId,
      visibility: knowledge.visibility ?? this.defaultVisibilityForScope(scope),
    }
  }

  private defaultVisibility(space: SpaceContext): KnowledgeVisibility {
    return this.defaultVisibilityForScope(space.spaceType)
  }

  private defaultVisibilityForScope(
    scope: 'personal' | 'team' | 'enterprise',
  ): KnowledgeVisibility {
    if (scope === 'personal') return 'private'
    if (scope === 'team') return 'team'
    return 'enterprise'
  }

  private async defaultItemStatusForKnowledge(
    userId: string,
    knowledge: KnowledgeDocument,
  ): Promise<KnowledgeItemStatus> {
    const scope = this.normalizedScope(knowledge)
    if (scope !== 'team' || !knowledge.teamId) return 'active'

    const space = await this.orgService
      .resolveSpaceContext(userId, knowledge.teamId.toString())
      .catch(() => undefined)

    return space?.policies?.teamKnowledgeRequiresReview ? 'pending_review' : 'active'
  }

  private normalizedScope(knowledge: KnowledgeDocument): 'personal' | 'team' | 'enterprise' {
    return knowledge.scope ?? 'enterprise'
  }

  private knowledgeListQuery(space: SpaceContext): FilterQuery<KnowledgeDocument> {
    if (space.spaceType === 'personal') {
      return {
        scope: 'personal',
        ownerUserId: new Types.ObjectId(space.ownerUserId),
      }
    }

    if (space.spaceType === 'team') {
      return {
        scope: 'team',
        teamId: new Types.ObjectId(space.teamId),
      }
    }

    const enterpriseObjectId = new Types.ObjectId(space.enterpriseId)
    return {
      $or: [
        { scope: 'enterprise', enterpriseId: enterpriseObjectId },
        { scope: { $exists: false }, enterpriseId: enterpriseObjectId },
      ],
    }
  }

  private availableKnowledgeQuery(space: SpaceContext): FilterQuery<KnowledgeDocument> {
    if (space.spaceType === 'personal') {
      return {
        scope: 'personal',
        ownerUserId: new Types.ObjectId(space.ownerUserId),
      }
    }

    if (space.spaceType === 'team') {
      const enterpriseObjectId = new Types.ObjectId(space.enterpriseId)

      return {
        $or: [
          { scope: 'team', teamId: new Types.ObjectId(space.teamId) },
          { scope: 'enterprise', enterpriseId: enterpriseObjectId, isRequired: true },
          { scope: { $exists: false }, enterpriseId: enterpriseObjectId, isRequired: true },
        ],
      }
    }

    return this.knowledgeListQuery(space)
  }

  private async findAccessibleKnowledge(
    userId: string,
    enterpriseId: string | undefined,
    knowledgeId: string,
  ) {
    const knowledge = await this.knowledgeModel.findById(knowledgeId)

    if (!knowledge) {
      throw new NotFoundException('知识库不存在或无权访问')
    }

    if (knowledge.creatorId.toString() === userId) {
      return knowledge
    }

    const scope = this.normalizedScope(knowledge)

    if (scope === 'personal') {
      if (knowledge.ownerUserId?.toString() === userId) {
        return knowledge
      }
      throw new NotFoundException('知识库不存在或无权访问')
    }

    const targetSpaceId = this.spaceIdFromKnowledge(knowledge, enterpriseId)
    await this.orgService.resolveSpaceContext(userId, targetSpaceId)

    return knowledge
  }

  private async assertCanManageKnowledge(
    userId: string,
    enterpriseId: string | undefined,
    knowledgeId: string,
  ) {
    const knowledge = await this.findAccessibleKnowledge(userId, enterpriseId, knowledgeId)

    if (knowledge.creatorId.toString() === userId) {
      return knowledge
    }

    const scope = this.normalizedScope(knowledge)
    if (scope === 'personal') {
      throw new BadRequestException('您无权操作此知识库')
    }

    const targetSpaceId = this.spaceIdFromKnowledge(knowledge, enterpriseId)
    const space = await this.orgService.resolveSpaceContext(userId, targetSpaceId)

    const managePermission =
      scope === 'team' ? 'manage_team_knowledge' : 'manage_enterprise_knowledge'

    if (!space.permissions.includes(managePermission) && !space.permissions.includes('*')) {
      throw new BadRequestException('您无权操作此知识库')
    }

    return knowledge
  }

  private spaceIdFromKnowledge(knowledge: KnowledgeDocument, fallbackEnterpriseId?: string) {
    const scope = this.normalizedScope(knowledge)

    if (scope === 'team' && knowledge.teamId) {
      return knowledge.teamId.toString()
    }

    if (scope === 'enterprise' && knowledge.enterpriseId) {
      return knowledge.enterpriseId.toString()
    }

    if (fallbackEnterpriseId) {
      return fallbackEnterpriseId
    }

    throw new NotFoundException('知识库不存在或无权访问')
  }

  private vectorMetadata(knowledge: KnowledgeDocument) {
    const scope = this.normalizedScope(knowledge)

    return {
      scope,
      ownerUserId: knowledge.ownerUserId?.toString(),
      teamId: knowledge.teamId?.toString(),
      enterpriseId: knowledge.enterpriseId?.toString(),
      visibility: knowledge.visibility ?? this.defaultVisibilityForScope(scope),
    }
  }

  private async ingestItemContent(
    knowledge: KnowledgeDocument,
    item: KnowledgeItemDocument,
    content: string,
  ) {
    return ingestDocument(
      content,
      this.cleanMetadata({
        ...this.vectorMetadata(knowledge),
        knowledgeId: knowledge._id.toString(),
        knowledgeBaseId: knowledge._id.toString(),
        knowledgeItemId: item._id.toString(),
        status: item.status,
        type: item.type,
      }),
    )
  }

  private assertItemPayload(dto: CreateKnowledgeItemDto) {
    if (!dto.content?.trim() && !dto.fileUrl) {
      throw new BadRequestException('知识项内容和文件 URL 至少需要提供一个')
    }
  }

  private cleanMetadata(metadata: IngestMetadata): IngestMetadata {
    const result: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined) {
        result[key] = value
      }
    }

    return result as IngestMetadata
  }
}
