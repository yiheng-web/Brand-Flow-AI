import 'reflect-metadata'

import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

import { OptimizeWorkflowDto } from './dto/brief-review.dto'
import { CreateWorkflowDto, StartWorkflowDto } from './dto/create-workflow.dto'

describe('Workflow V1 DTO', () => {
  it('接受完整结构化品牌需求', async () => {
    const dto = plainToInstance(CreateWorkflowDto, {
      prompt: '生成咖啡品牌海报',
      spaceId: 'personal',
      requirements: {
        brandName: '晨光咖啡',
        productCategory: '咖啡',
        productDescription: '面向通勤人群的冷萃咖啡',
        targetAudience: '一线城市年轻上班族',
        usageScenario: '小红书新品发布',
        visualStyles: ['极简', '科技'],
        colorPreference: '深蓝与银色',
        aspectRatio: '4:5',
      },
    })
    expect(await validate(dto)).toHaveLength(0)
  })

  it('拒绝未知风格和不支持的图片比例', async () => {
    const dto = plainToInstance(CreateWorkflowDto, {
      prompt: '测试',
      spaceId: 'personal',
      requirements: {
        brandName: '品牌',
        productCategory: '品类',
        productDescription: '描述',
        targetAudience: '用户',
        usageScenario: '场景',
        visualStyles: ['未知风格'],
        aspectRatio: '2:1',
      },
    })
    expect((await validate(dto)).length).toBeGreaterThan(0)
  })

  it('反馈优化只接受受控分类', async () => {
    const dto = plainToInstance(OptimizeWorkflowDto, {
      categories: ['color', 'unknown'],
      instruction: '背景改成夜景',
      sourceCandidateId: 'candidate-1',
    })
    expect((await validate(dto)).length).toBeGreaterThan(0)
  })

  it('启动工作流必须明确传入图文分离选项', async () => {
    const validDto = plainToInstance(StartWorkflowDto, { needsComposition: false })
    const invalidDto = plainToInstance(StartWorkflowDto, {})

    expect(await validate(validDto)).toHaveLength(0)
    expect((await validate(invalidDto)).length).toBeGreaterThan(0)
  })
})
