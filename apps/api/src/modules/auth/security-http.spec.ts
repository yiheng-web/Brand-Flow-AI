import { AuthorizationService } from '../org/authorization.service'
import { Module, ValidationPipe } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { getModelToken } from '@nestjs/mongoose'
import { PassportModule } from '@nestjs/passport'
import { Types } from 'mongoose'

import { AssetsController } from '../assets/assets.controller'
import { AssetsService } from '../assets/assets.service'
import { MAX_ASSET_IMAGE_BYTES } from '../assets/assets.constants'
import { User } from '../org/schemas/user.schema'
import { WorksController } from '../works/works.controller'
import { WorksService } from '../works/works.service'
import { WorkflowController } from '../workflow/workflow.controller'
import { WorkflowService } from '../workflow/workflow.service'
import { LimitsService } from '../limits/limits.service'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './guards/jwt.strategy'

const userId = new Types.ObjectId().toString()
const user = { _id: userId, email: 'http@example.test', status: 'active', memberships: [] }
const findById = jest.fn()
const createTrustedVersion = jest.fn()
const secret = 'http-test-only-secret'
const workflowModel = { findOne: jest.fn() }
const workflowService = new WorkflowService(
  workflowModel as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  {} as never,
  new AuthorizationService({} as never, {} as never, {} as never),
)

@Module({
  imports: [PassportModule, JwtModule.register({ secret })],
  controllers: [AuthController, AssetsController, WorksController, WorkflowController],
  providers: [
    JwtStrategy,
    { provide: LimitsService, useValue: { authenticate: jest.fn().mockResolvedValue(undefined) } },
    { provide: ConfigService, useValue: new ConfigService({ JWT_SECRET: secret }) },
    { provide: getModelToken(User.name), useValue: { findById } },
    { provide: AuthService, useValue: {} },
    { provide: WorksService, useValue: { createTrustedVersion } },
    {
      provide: WorkflowService,
      useValue: { streamWorkflow: workflowService.streamWorkflow.bind(workflowService) },
    },
    {
      provide: AssetsService,
      useValue: new AssetsService(
        {} as never,
        new AuthorizationService({} as never, {} as never, {} as never),
        {} as never,
        {} as never,
        {} as never,
      ),
    },
  ],
})
class SecurityHttpModule {}

describe('安全 HTTP 边界（真实 Nest/Passport/Multer，隔离数据库）', () => {
  let app: INestApplication
  let baseUrl: string
  let token: string

  beforeAll(async () => {
    app = await NestFactory.create(SecurityHttpModule, { logger: false })
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
    token = app.get(JwtService).sign({ sub: userId }, { expiresIn: '1h' })
  })

  beforeEach(() => {
    jest.clearAllMocks()
    findById.mockResolvedValue(user)
  })
  afterAll(async () => {
    await app.close()
  })

  const upload = async (size: number, count = 1) => {
    const form = new FormData()
    form.set('name', '图片')
    form.set('type', 'reference')
    form.set('ownerId', userId)
    form.set('ownerType', 'user')
    form.set('visibility', 'private')
    for (let i = 0; i < count; i++)
      form.append('file', new Blob([new Uint8Array(size)], { type: 'image/png' }), 'test.png')
    return fetch(`${baseUrl}/assets/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
  }

  it('已有 JWT 请求在禁用后得到 401', async () => {
    const headers = { Authorization: `Bearer ${token}` }
    expect((await fetch(`${baseUrl}/auth/profile`, { headers })).status).toBe(200)
    findById.mockResolvedValue({ ...user, status: 'disabled' })
    expect((await fetch(`${baseUrl}/auth/profile`, { headers })).status).toBe(401)
  })

  it('A 订阅 B 的个人工作流在创建 SSE 之前返回 404', async () => {
    workflowModel.findOne.mockResolvedValue({
      spaceId: 'personal',
      spaceType: 'personal',
      userId: new Types.ObjectId().toString(),
    })
    const response = await fetch(`${baseUrl}/workflow/${new Types.ObjectId()}/stream`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).not.toContain('text/event-stream')
  })

  it('伪造 PNG 的实际 multipart 请求返回 400', async () => {
    expect((await upload(20)).status).toBe(400)
  })

  it('传输大小超限返回 413', async () => {
    expect((await upload(MAX_ASSET_IMAGE_BYTES + 1)).status).toBe(413)
  })

  it('一次上传两张图片返回 400', async () => {
    expect((await upload(20, 2)).status).toBe(400)
  })

  it('旧版本 payload 缺少可信 workflowId，返回 400 且不写版本', async () => {
    const response = await fetch(`${baseUrl}/works/${new Types.ObjectId()}/versions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: 'foreign-url',
        objectKey: 'foreign-object',
        qualityReport: { passed: true },
      }),
    })
    expect(response.status).toBe(400)
    expect(createTrustedVersion).not.toHaveBeenCalled()
  })
})
