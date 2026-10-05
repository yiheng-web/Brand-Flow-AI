import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Model, Types } from 'mongoose'
import { Role } from '@brand-flow/contracts'
import type { CreateInvitationResult, InvitationData } from '@brand-flow/contracts'
import { AuthorizationService } from './authorization.service'
import { MembershipService } from './membership.service'
import { Invitation, type InvitationDocument } from './schemas/invitation.schema'
import { User, type UserDocument } from './schemas/user.schema'
import { assertObjectId } from '@/common/personal-scope'
import type { InviteSpaceMemberDto } from './dto/org.dto'

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

@Injectable()
export class InvitationService {
  constructor(
    @InjectModel(Invitation.name) private readonly invitationModel: Model<InvitationDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly authorization: AuthorizationService,
    private readonly memberships: MembershipService,
  ) {}

  async create(
    userId: string,
    spaceId: string,
    dto: InviteSpaceMemberDto,
  ): Promise<CreateInvitationResult> {
    const initial = await this.authorization.assertCanManageMembers(userId, spaceId)
    const role = dto.role ?? Role.MEMBER
    this.authorization.assertCanGrantRole(initial, role)
    const email = dto.email.trim().toLowerCase()
    const code = randomBytes(32).toString('hex')
    try {
      return await this.memberships.transaction(initial.enterpriseId!, async (session) => {
        const space = await this.authorization.assertCanManageMembers(userId, spaceId, session)
        this.authorization.assertCanGrantRole(space, role)
        const target = await this.userModel.findOne(
          { email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
          null,
          { session },
        )
        if (target && this.memberships.findMembership(target, space))
          throw new ConflictException('该用户已是空间成员')
        await this.invitationModel.updateMany(
          { spaceId, inviteeEmail: email, status: 'pending', expiresAt: { $lte: new Date() } },
          { $set: { status: 'expired' } },
          { session },
        )
        const [invitation] = await this.invitationModel.create(
          [
            {
              spaceId,
              spaceName: space.name,
              enterpriseId: new Types.ObjectId(space.enterpriseId),
              ...(space.spaceType === 'team' ? { teamId: new Types.ObjectId(spaceId) } : {}),
              inviterId: new Types.ObjectId(userId),
              inviteeEmail: email,
              targetRole: role,
              tokenHash: createHash('sha256').update(code).digest('hex'),
              status: 'pending',
              expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
            },
          ],
          { session },
        )
        return { invitation: this.toData(invitation, false, true), inviteCode: code }
      })
    } catch (error: unknown) {
      if (error && typeof error === 'object' && Reflect.get(error, 'code') === 11000)
        throw new ConflictException('已有待处理邀请，请先撤销或等待过期')
      throw error
    }
  }

  async list(userId: string, direction: 'received' | 'sent'): Promise<InvitationData[]> {
    const user = await this.userModel.findById(userId)
    if (!user) throw new NotFoundException('用户不存在')
    const filter =
      direction === 'received'
        ? { inviteeEmail: user.email.toLowerCase() }
        : { inviterId: new Types.ObjectId(userId) }
    await this.invitationModel.updateMany(
      { ...filter, status: 'pending', expiresAt: { $lte: new Date() } },
      { $set: { status: 'expired' } },
    )
    const invitations = await this.invitationModel.find(filter).sort({ createdAt: -1 })
    return Promise.all(
      invitations.map(async (invitation) => {
        let canCancel = false
        if (direction === 'sent' && invitation.status === 'pending') {
          try {
            canCancel = (
              await this.authorization.assertCanReadOrganization(userId, invitation.spaceId)
            ).permissions.manageMembers
          } catch (error: unknown) {
            if (!(error instanceof ForbiddenException || error instanceof NotFoundException))
              throw error
          }
        }
        return this.toData(
          invitation,
          direction === 'received' && invitation.status === 'pending',
          canCancel,
        )
      }),
    )
  }

  async respond(
    userId: string,
    id: string,
    decision: 'accepted' | 'rejected',
    code?: string,
  ): Promise<InvitationData> {
    assertObjectId(id)
    const user = await this.userModel.findById(userId)
    if (!user) throw new NotFoundException('用户不存在')
    const filter = { _id: id, inviteeEmail: user.email.toLowerCase() }
    await this.invitationModel.updateMany(
      { ...filter, status: 'pending', expiresAt: { $lte: new Date() } },
      { $set: { status: 'expired' } },
    )
    const initial = await this.invitationModel.findOne(filter)
    if (!initial) throw new NotFoundException('邀请不存在或不属于当前账号')
    return this.memberships.transaction(initial.enterpriseId.toString(), async (session) => {
      const invitation = await this.invitationModel
        .findOne(filter, null, { session })
        .select('+tokenHash')
      if (!invitation) throw new NotFoundException('邀请不存在')
      if (
        code &&
        !timingSafeEqual(
          Buffer.from(createHash('sha256').update(code).digest('hex'), 'hex'),
          Buffer.from(invitation.tokenHash, 'hex'),
        )
      )
        throw new ForbiddenException('邀请码不正确')
      if (invitation.status === decision) return this.toData(invitation, false, false)
      if (invitation.status !== 'pending' || invitation.expiresAt <= new Date())
        throw new ConflictException('邀请已处理或已过期')
      if (decision === 'accepted') {
        const space = await this.authorization.assertCanManageMembers(
          invitation.inviterId.toString(),
          invitation.spaceId,
          session,
        )
        this.authorization.assertCanGrantRole(space, invitation.targetRole)
        const target = await this.userModel.findById(userId, null, { session })
        if (!target || target.email.toLowerCase() !== invitation.inviteeEmail)
          throw new ForbiddenException('账号与邀请邮箱不一致')
        await this.memberships.joinInvitation(target, space, invitation.targetRole, session)
      }
      invitation.status = decision
      await invitation.save({ session })
      return this.toData(invitation, false, false)
    })
  }

  async cancel(userId: string, id: string): Promise<InvitationData> {
    assertObjectId(id)
    const initial = await this.invitationModel.findOne({
      _id: id,
      inviterId: new Types.ObjectId(userId),
    })
    if (!initial) throw new NotFoundException('邀请不存在或不是本人发出')
    return this.memberships.transaction(initial.enterpriseId.toString(), async (session) => {
      await this.authorization.assertCanManageMembers(userId, initial.spaceId, session)
      const invitation = await this.invitationModel.findOne(
        { _id: id, inviterId: new Types.ObjectId(userId) },
        null,
        { session },
      )
      if (!invitation) throw new NotFoundException('邀请不存在')
      if (invitation.status === 'cancelled') return this.toData(invitation, false, false)
      if (invitation.status !== 'pending') throw new BadRequestException('邀请已处理')
      invitation.status = invitation.expiresAt <= new Date() ? 'expired' : 'cancelled'
      await invitation.save({ session })
      return this.toData(invitation, false, false)
    })
  }

  private toData(
    invitation: InvitationDocument,
    canRespond: boolean,
    canCancel: boolean,
  ): InvitationData {
    return {
      id: invitation._id.toString(),
      spaceId: invitation.spaceId,
      spaceName: invitation.spaceName,
      enterpriseId: invitation.enterpriseId.toString(),
      teamId: invitation.teamId?.toString(),
      inviterId: invitation.inviterId.toString(),
      inviteeEmail: invitation.inviteeEmail,
      targetRole: invitation.targetRole,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      canRespond,
      canCancel,
    }
  }
}
