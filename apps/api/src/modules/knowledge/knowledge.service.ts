import { Injectable } from '@nestjs/common'

import type { KnowledgeOverviewDto, KnowledgeScope } from '@brand-flow/common'

@Injectable()
export class KnowledgeService {
  private readonly overviews: Record<KnowledgeScope, KnowledgeOverviewDto> = {
    personal: this.createOverview('personal'),
    team: this.createOverview('team'),
  }

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
