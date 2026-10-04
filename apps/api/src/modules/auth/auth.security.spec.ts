import { UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Model, Types } from 'mongoose'
import * as bcrypt from 'bcrypt'

import type { UserDocument } from '../org/schemas/user.schema'
import { AuthService } from './auth.service'
import { JwtStrategy } from './guards/jwt.strategy'

describe('账号状态鉴权', () => {
  const userId = new Types.ObjectId().toString()
  const user = {
    _id: userId,
    email: 'a@example.test',
    password: '',
    status: 'active',
    memberships: [],
  }
  const findById = jest.fn()
  const select = jest.fn()
  const sign = jest.fn(() => 'token')
  const model = { findById, findOne: jest.fn(() => ({ select })) }
  const service = new AuthService(
    model as unknown as Model<UserDocument>,
    { sign } as unknown as JwtService,
  )
  const strategy = new JwtStrategy(
    new ConfigService({ JWT_SECRET: 'test-only-secret' }),
    model as unknown as Model<UserDocument>,
  )

  beforeEach(() => jest.clearAllMocks())

  it('正常密码仍不能登录 disabled 账号', async () => {
    select.mockResolvedValue({
      ...user,
      status: 'disabled',
      password: await bcrypt.hash('password123', 4),
    })
    await expect(
      service.login({ email: user.email, password: 'password123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException)
    expect(sign).not.toHaveBeenCalled()
  })

  it('active 账号仍可登录', async () => {
    select.mockResolvedValue({ ...user, password: await bcrypt.hash('password123', 4) })
    await expect(
      service.login({ email: user.email, password: 'password123' }),
    ).resolves.toMatchObject({ access_token: 'token' })
  })

  it('注册仍创建 active 账号并保存密码哈希', async () => {
    const create = jest.fn(async (value) => ({ ...value, _id: userId }))
    const registration = new AuthService(
      { findOne: jest.fn().mockResolvedValue(null), create } as unknown as Model<UserDocument>,
      { sign } as unknown as JwtService,
    )
    await expect(
      registration.register({ email: user.email, password: 'password123', nickname: 'A' }),
    ).resolves.toMatchObject({ userId, email: user.email })
    const saved = create.mock.calls[0][0]
    expect(saved.status).toBe('active')
    expect(await bcrypt.compare('password123', saved.password)).toBe(true)
    expect(saved.password).not.toBe('password123')
  })

  it('已有 JWT 在账号禁用或删除后失效', async () => {
    findById.mockResolvedValue(user)
    await expect(strategy.validate({ sub: userId })).resolves.toMatchObject({ sub: userId })
    findById.mockResolvedValue({ ...user, status: 'disabled' })
    await expect(strategy.validate({ sub: userId })).rejects.toBeInstanceOf(UnauthorizedException)
    findById.mockResolvedValue(null)
    await expect(strategy.validate({ sub: userId })).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('畸形身份返回 401 且不查询数据库', async () => {
    await expect(strategy.validate({ sub: 'invalid' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
    expect(findById).not.toHaveBeenCalled()
  })

  it('撤销企业成员关系后旧企业 JWT 不再可用', async () => {
    findById.mockResolvedValue(user)
    await expect(
      strategy.validate({ sub: userId, entId: new Types.ObjectId().toString() }),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })
})
