import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { OwnerType, Role, Visibility } from '@/common/enums'
import { Membership, MembershipDocument } from '@/modules/org/schemas/membership.schema'
import { StorageService } from '@/modules/storage/storage.service'
import { CreateWorkDto, CreateWorkVersionDto, ExportWorkDto } from './dto/works.dto'
import { Work, WorkDocument } from './schemas/work.schema'
import { WorkVersion, WorkVersionDocument } from './schemas/work-version.schema'
import { ExportLog, ExportLogDocument } from './schemas/export-log.schema'
import { Workflow, WorkflowDocument } from '@/modules/workflow/schemas/workflow.schema'

@Injectable()
export class WorksService {
  constructor(
    @InjectModel(Work.name) private readonly workModel: Model<WorkDocument>,
    @InjectModel(WorkVersion.name)
    private readonly workVersionModel: Model<WorkVersionDocument>,
    @InjectModel(ExportLog.name)
    private readonly exportLogModel: Model<ExportLogDocument>,
    @InjectModel(Membership.name) private readonly membershipModel: Model<MembershipDocument>,
    @InjectModel(Workflow.name) private readonly workflowModel: Model<WorkflowDocument>,
    private readonly storageService: StorageService,
  ) {}

  async create(userId: string, workspaceId: string, dto: CreateWorkDto) {
    this.assertWorkspaceSelected(workspaceId)
    const ownership = await this.resolveWorkflowOwnership(userId, workspaceId, dto.workflowId)

    await this.assertCanCreate(
      userId,
      ownership.workspaceId,
      ownership.ownerId,
      ownership.ownerType,
      ownership.visibility,
    )

    const work = await this.workModel.create({
      title: dto.title,
      description: dto.description,
      finalImageUrl: dto.finalImageUrl,
      objectKey: dto.objectKey,
      workflowId: dto.workflowId ? new Types.ObjectId(dto.workflowId) : undefined,
      qualityReport: dto.qualityReport || {},
      nodesSnapshot: dto.nodesSnapshot || {},
      spaceId: new Types.ObjectId(ownership.spaceId),
      ownerId: new Types.ObjectId(ownership.ownerId),
      ownerType: ownership.ownerType,
      visibility: ownership.visibility,
      creatorId: new Types.ObjectId(userId),
      workspaceId: new Types.ObjectId(ownership.workspaceId),
      metadata: dto.metadata || {},
    })

    await this.workVersionModel.create({
      workId: work._id,
      versionNo: 1,
      imageUrl: dto.finalImageUrl,
      objectKey: dto.objectKey,
      sourceWorkflowId: dto.workflowId ? new Types.ObjectId(dto.workflowId) : undefined,
      nodesSnapshot: dto.nodesSnapshot || {},
      qualityReport: dto.qualityReport || {},
      createdBy: new Types.ObjectId(userId),
    })

    return this.findOne(userId, ownership.workspaceId, work._id.toString())
  }

  async findAll(userId: string, workspaceId: string) {
    this.assertWorkspaceSelected(workspaceId)

    const teamIds = await this.findUserTeamIds(userId, workspaceId)

    return this.workModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        $or: [
          { visibility: Visibility.PUBLIC },
          { creatorId: new Types.ObjectId(userId) },
          { visibility: Visibility.WORKSPACE },
          {
            visibility: Visibility.TEAM,
            ownerType: OwnerType.TEAM,
            ownerId: { $in: teamIds.map((id) => new Types.ObjectId(id)) },
          },
        ],
      })
      .populate('creatorId', 'email profile')
      .sort({ createdAt: -1 })
  }

  async findOne(userId: string, workspaceId: string, id: string) {
    const work = await this.findAccessibleWork(userId, workspaceId, id)
    const versions = await this.workVersionModel.find({ workId: work._id }).sort({ versionNo: -1 })

    return {
      ...work.toObject(),
      versions,
    }
  }

  async remove(userId: string, workspaceId: string, id: string) {
    const work = await this.findAccessibleWork(userId, workspaceId, id)

    if (work.creatorId.toString() !== userId) {
      await this.assertAdminForScope(userId, workspaceId, work.ownerId.toString(), work.ownerType)
    }

    await this.workVersionModel.deleteMany({ workId: work._id })
    await this.workModel.findByIdAndDelete(work._id)

    return { success: true }
  }

  async createVersion(userId: string, workspaceId: string, id: string, dto: CreateWorkVersionDto) {
    const work = await this.findAccessibleWork(userId, workspaceId, id)

    if (work.creatorId.toString() !== userId) {
      await this.assertAdminForScope(userId, workspaceId, work.ownerId.toString(), work.ownerType)
    }

    const latest = await this.workVersionModel.findOne({ workId: work._id }).sort({ versionNo: -1 })

    const version = await this.workVersionModel.create({
      workId: work._id,
      versionNo: (latest?.versionNo || 0) + 1,
      imageUrl: dto.imageUrl,
      objectKey: dto.objectKey,
      sourceWorkflowId: dto.sourceWorkflowId ? new Types.ObjectId(dto.sourceWorkflowId) : undefined,
      nodesSnapshot: dto.nodesSnapshot || {},
      qualityReport: dto.qualityReport || {},
      createdBy: new Types.ObjectId(userId),
    })

    work.finalImageUrl = dto.imageUrl
    work.objectKey = dto.objectKey
    work.nodesSnapshot = dto.nodesSnapshot || work.nodesSnapshot || {}
    work.qualityReport = dto.qualityReport || work.qualityReport || {}
    await work.save()

    return version
  }

  async findVersions(userId: string, workspaceId: string, id: string) {
    const work = await this.findAccessibleWork(userId, workspaceId, id)

    return this.workVersionModel.find({ workId: work._id }).sort({ versionNo: -1 })
  }

  async findVersion(userId: string, workspaceId: string, id: string, versionId: string) {
    const work = await this.findAccessibleWork(userId, workspaceId, id)
    const version = await this.workVersionModel.findOne({
      _id: versionId,
      workId: work._id,
    })

    if (!version) {
      throw new NotFoundException('作品版本不存在或无权访问')
    }

    return version
  }

  async export(userId: string, workspaceId: string, id: string, dto: ExportWorkDto) {
    const format = dto.format || 'png'
    if (format !== 'png') {
      throw new BadRequestException('V1.0 暂仅支持 PNG 导出')
    }

    const work = await this.findAccessibleWork(userId, workspaceId, id)
    const downloadUrl = work.objectKey
      ? await this.storageService.getSignedUrl(work.objectKey, { expiresIn: 60 * 10 })
      : work.finalImageUrl

    const fileName = `${this.sanitizeFileName(work.title)}.png`
    const log = await this.exportLogModel.create({
      workId: work._id,
      workspaceId: new Types.ObjectId(workspaceId),
      exportedBy: new Types.ObjectId(userId),
      format,
      fileName,
      downloadUrl,
      metadata: {
        objectKey: work.objectKey,
        visibility: work.visibility,
      },
    })

    return {
      workId: work._id,
      exportLogId: log._id,
      format,
      fileName,
      downloadUrl,
    }
  }

  private async findAccessibleWork(userId: string, workspaceId: string, id: string) {
    this.assertWorkspaceSelected(workspaceId)

    const work = await this.workModel.findOne({
      _id: id,
      workspaceId: new Types.ObjectId(workspaceId),
    })

    if (!work) {
      throw new NotFoundException('作品不存在或无权访问')
    }

    if (work.creatorId.toString() === userId || work.visibility === Visibility.PUBLIC) {
      return work
    }

    if (work.visibility === Visibility.WORKSPACE) {
      const membership = await this.findWorkspaceMembership(userId, workspaceId)
      if (membership) {
        return work
      }
    }

    if (work.visibility === Visibility.TEAM && work.ownerType === OwnerType.TEAM) {
      const membership = await this.membershipModel.findOne({
        userId: new Types.ObjectId(userId),
        workspaceId: new Types.ObjectId(workspaceId),
        scopeType: 'team',
        scopeId: work.ownerId,
        status: 'active',
      })
      if (membership) {
        return work
      }
    }

    throw new NotFoundException('作品不存在或无权访问')
  }

  private async assertCanCreate(
    userId: string,
    workspaceId: string,
    ownerId: string,
    ownerType: OwnerType,
    visibility: Visibility,
  ) {
    if (visibility === Visibility.PRIVATE && ownerType === OwnerType.USER && ownerId === userId) {
      return
    }

    if (visibility === Visibility.TEAM || visibility === Visibility.WORKSPACE) {
      await this.assertMemberForScope(userId, workspaceId, ownerId, ownerType)
      return
    }

    if (visibility === Visibility.PUBLIC) {
      await this.assertAdminForScope(userId, workspaceId, ownerId, ownerType)
      return
    }

    throw new BadRequestException('无权创建该归属范围的作品')
  }

  private async assertMemberForScope(
    userId: string,
    workspaceId: string,
    ownerId: string,
    ownerType: OwnerType,
  ) {
    if (ownerType === OwnerType.WORKSPACE) {
      const membership = await this.findWorkspaceMembership(userId, workspaceId)
      if (membership) {
        return
      }
    }

    if (ownerType === OwnerType.TEAM) {
      const membership = await this.membershipModel.findOne({
        userId: new Types.ObjectId(userId),
        workspaceId: new Types.ObjectId(workspaceId),
        scopeType: 'team',
        scopeId: new Types.ObjectId(ownerId),
        status: 'active',
      })
      if (membership) {
        return
      }
    }

    throw new BadRequestException('您不属于该作品归属空间')
  }

  private async resolveWorkflowOwnership(userId: string, workspaceId: string, workflowId: string) {
    const workflow = await this.workflowModel.findById(workflowId)
    if (!workflow) {
      throw new NotFoundException('工作流不存在或无权访问')
    }

    if (workflow.workspaceId.toString() !== workspaceId) {
      throw new BadRequestException('不能保存其他企业下的工作流作品')
    }

    if (workflow.ownerType === OwnerType.USER && workflow.userId.toString() !== userId) {
      throw new BadRequestException('不能保存他人个人空间的工作流作品')
    }

    if (!workflow.ownerId || !workflow.ownerType || !workflow.visibility || !workflow.workspaceId) {
      throw new BadRequestException('工作流缺少作品归属信息，请重新创建工作流')
    }

    return {
      workspaceId: workflow.workspaceId.toString(),
      ownerId: workflow.ownerId.toString(),
      ownerType: workflow.ownerType,
      visibility: workflow.visibility,
      spaceId: workflow.spaceId.toString(),
    }
  }

  private async assertAdminForScope(
    userId: string,
    workspaceId: string,
    ownerId: string,
    ownerType: OwnerType,
  ) {
    const membership = await this.membershipModel.findOne({
      userId: new Types.ObjectId(userId),
      workspaceId: new Types.ObjectId(workspaceId),
      status: 'active',
      ...(ownerType === OwnerType.TEAM
        ? { scopeType: 'team', scopeId: new Types.ObjectId(ownerId) }
        : { scopeType: 'workspace', scopeId: new Types.ObjectId(workspaceId) }),
    })

    if (!membership || (membership.role !== Role.OWNER && membership.role !== Role.ADMIN)) {
      throw new BadRequestException('您无权操作该归属范围的作品')
    }
  }

  private assertWorkspaceSelected(workspaceId: string) {
    if (!workspaceId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }
  }

  private sanitizeFileName(title: string) {
    return title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'work'
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

  private async findWorkspaceMembership(userId: string, workspaceId: string) {
    return this.membershipModel.findOne({
      userId: new Types.ObjectId(userId),
      workspaceId: new Types.ObjectId(workspaceId),
      scopeType: 'workspace',
      status: 'active',
    })
  }
}
