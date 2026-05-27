import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'

import type {
  CreateKnowledgeRequest,
  KnowledgeItem,
  KnowledgeOverviewDto,
  KnowledgeScope,
  ListKnowledgeQuery,
  UpdateKnowledgeRequest,
} from '@brand-flow/common'

import { KnowledgeItemDocument, KnowledgeItemEntity } from './schemas/knowledge-item.schema'

@Injectable()
export class KnowledgeService {
  private readonly overviews: Record<KnowledgeScope, KnowledgeOverviewDto> = {
    personal: this.createOverview('personal'),
    team: this.createOverview('team'),
  }

  constructor(
    @InjectModel(KnowledgeItemEntity.name)
    private readonly knowledgeModel: Model<KnowledgeItemDocument>,
  ) {}

  getOverview(scope: KnowledgeScope): KnowledgeOverviewDto {
    return this.overviews[scope]
  }

  createBase(scope: KnowledgeScope, name: string): KnowledgeOverviewDto {
    const overview = this.overviews[scope]
    if (overview.quota.used >= overview.quota.limit) return overview

    overview.bases.push({
      id: `${scope}-${Date.now()}`,
      name,
      description: scope === 'team' ? '团队共用知识库' : '私人创作知识库',
      scope,
      assetCount: 0,
      assetLimit: overview.quota.assetLimitPerBase,
      color: scope === 'team' ? '#e65100' : '#0b57d0',
      assets: [],
    })
    overview.quota.used = overview.bases.length
    return overview
  }

  async list(query: ListKnowledgeQuery): Promise<KnowledgeItem[]> {
    const filter: Record<string, unknown> = { spaceId: query.spaceId }

    if (query.type) filter.type = query.type
    if (query.enabled !== undefined) filter.enabled = query.enabled
    if (query.keyword) {
      filter.$or = [
        { title: { $regex: query.keyword, $options: 'i' } },
        { description: { $regex: query.keyword, $options: 'i' } },
      ]
    }
    if (query.tags) {
      const tagList = query.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      if (tagList.length > 0) filter.tags = { $in: tagList }
    }

    const docs = await this.knowledgeModel.find(filter).sort({ updatedAt: -1 }).exec()
    return docs.map((doc) => this.toItem(doc))
  }

  async listBySpace(
    spaceId: string,
    options?: { enabled?: boolean; type?: ListKnowledgeQuery['type'] },
  ): Promise<KnowledgeItem[]> {
    return this.list({
      spaceId,
      enabled: options?.enabled,
      type: options?.type,
    })
  }

  async findById(id: string): Promise<KnowledgeItem> {
    const doc = await this.knowledgeModel.findById(id).exec()
    if (!doc) throw new NotFoundException('知识条目不存在')
    return this.toItem(doc)
  }

  async create(dto: CreateKnowledgeRequest): Promise<KnowledgeItem> {
    const doc = await this.knowledgeModel.create({
      spaceId: dto.spaceId,
      type: dto.type,
      title: dto.title,
      description: dto.description,
      tags: dto.tags ?? [],
      content: dto.content,
      assetUrl: dto.assetUrl,
      enabled: dto.enabled ?? true,
    })
    return this.toItem(doc)
  }

  async update(id: string, dto: UpdateKnowledgeRequest): Promise<KnowledgeItem> {
    const doc = await this.knowledgeModel
      .findByIdAndUpdate(
        id,
        {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
          ...(dto.content !== undefined ? { content: dto.content } : {}),
          ...(dto.assetUrl !== undefined ? { assetUrl: dto.assetUrl } : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        },
        { new: true },
      )
      .exec()

    if (!doc) throw new NotFoundException('知识条目不存在')
    return this.toItem(doc)
  }

  async remove(id: string): Promise<void> {
    const result = await this.knowledgeModel.findByIdAndDelete(id).exec()
    if (!result) throw new NotFoundException('知识条目不存在')
  }

  async setEnabled(id: string, enabled: boolean): Promise<KnowledgeItem> {
    const doc = await this.knowledgeModel.findByIdAndUpdate(id, { enabled }, { new: true }).exec()
    if (!doc) throw new NotFoundException('知识条目不存在')
    return this.toItem(doc)
  }

  private toItem(doc: KnowledgeItemDocument): KnowledgeItem {
    return {
      id: doc._id.toString(),
      spaceId: doc.spaceId,
      type: doc.type,
      title: doc.title,
      description: doc.description,
      tags: doc.tags ?? [],
      content: doc.content ?? {},
      assetUrl: doc.assetUrl,
      enabled: doc.enabled,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    }
  }

  private createOverview(scope: KnowledgeScope): KnowledgeOverviewDto {
    const isTeam = scope === 'team'
    return {
      quota: {
        scope,
        used: 1,
        limit: isTeam ? 20 : 5,
        assetLimitPerBase: isTeam ? 100 : 20,
      },
      bases: [
        {
          id: `${scope}-default`,
          name: isTeam ? '瑞幸项目组 - 核心视觉' : '默认风格库',
          description: isTeam
            ? '团队共用品牌资产、Logo 与色卡。'
            : '个人常用色卡、提示词偏好与参考素材。',
          scope,
          assetCount: isTeam ? 5 : 3,
          assetLimit: isTeam ? 100 : 20,
          color: isTeam ? '#e65100' : '#0b57d0',
          assets: [
            { id: 'blue', type: 'color', label: '品牌蓝', value: '#0b57d0', selected: true },
            {
              id: 'logo',
              type: 'logo',
              label: '标准 Logo',
              value: 'brand-logo.svg',
              selected: true,
            },
          ],
        },
      ],
    }
  }
}
