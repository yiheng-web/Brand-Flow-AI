import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { OwnerType, Role, Visibility } from '@/common/enums'
import { User, UserDocument } from '@/modules/org/schemas/user.schema'
import { StorageService } from '@/modules/storage/storage.service'
import { CreateWorkDto, CreateWorkVersionDto, ExportWorkDto } from './dto/works.dto'
import { Work, WorkDocument } from './schemas/work.schema'
import { WorkVersion, WorkVersionDocument } from './schemas/work-version.schema'
import { ExportLog, ExportLogDocument } from './schemas/export-log.schema'

@Injectable()
export class WorksService {
  constructor(
    @InjectModel(Work.name) private readonly workModel: Model<WorkDocument>,
    @InjectModel(WorkVersion.name)
    private readonly workVersionModel: Model<WorkVersionDocument>,
    @InjectModel(ExportLog.name)
    private readonly exportLogModel: Model<ExportLogDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly storageService: StorageService,
  ) {}

  async create(userId: string, enterpriseId: string, dto: CreateWorkDto) {
    this.assertEnterpriseSelected(enterpriseId)
    await this.assertCanCreate(userId, enterpriseId, dto.ownerId, dto.ownerType, dto.visibility)

    const work = await this.workModel.create({
      title: dto.title,
      description: dto.description,
      finalImageUrl: dto.finalImageUrl,
      objectKey: dto.objectKey,
      workflowId: dto.workflowId ? new Types.ObjectId(dto.workflowId) : undefined,
      qualityReport: dto.qualityReport || {},
      nodesSnapshot: dto.nodesSnapshot || {},
      ownerId: new Types.ObjectId(dto.ownerId),
      ownerType: dto.ownerType,
      visibility: dto.visibility,
      creatorId: new Types.ObjectId(userId),
      enterpriseId: new Types.ObjectId(enterpriseId),
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

    return this.findOne(userId, enterpriseId, work._id.toString())
  }

  async findAll(userId: string, enterpriseId: string) {
    this.assertEnterpriseSelected(enterpriseId)

    const user = await this.userModel.findById(userId)
    if (!user) {
      throw new NotFoundException('用户不存在')
    }

    const teamIds = user.memberships
      .filter(
        (membership) => membership.enterpriseId.toString() === enterpriseId && membership.teamId,
      )
      .map((membership) => membership.teamId?.toString())

    return this.workModel
      .find({
        enterpriseId: new Types.ObjectId(enterpriseId),
        $or: [
          { visibility: Visibility.PUBLIC },
          { creatorId: new Types.ObjectId(userId) },
          { visibility: Visibility.ENTERPRISE },
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

  async findOne(userId: string, enterpriseId: string, id: string) {
    const work = await this.findAccessibleWork(userId, enterpriseId, id)
    const versions = await this.workVersionModel.find({ workId: work._id }).sort({ versionNo: -1 })

    return {
      ...work.toObject(),
      versions,
    }
  }

  async remove(userId: string, enterpriseId: string, id: string) {
    const work = await this.findAccessibleWork(userId, enterpriseId, id)

    if (work.creatorId.toString() !== userId) {
      await this.assertAdminForScope(userId, enterpriseId, work.ownerId.toString(), work.ownerType)
    }

    await this.workVersionModel.deleteMany({ workId: work._id })
    await this.workModel.findByIdAndDelete(work._id)

    return { success: true }
  }

  async createVersion(userId: string, enterpriseId: string, id: string, dto: CreateWorkVersionDto) {
    const work = await this.findAccessibleWork(userId, enterpriseId, id)

    if (work.creatorId.toString() !== userId) {
      await this.assertAdminForScope(userId, enterpriseId, work.ownerId.toString(), work.ownerType)
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

  async findVersions(userId: string, enterpriseId: string, id: string) {
    const work = await this.findAccessibleWork(userId, enterpriseId, id)

    return this.workVersionModel.find({ workId: work._id }).sort({ versionNo: -1 })
  }

  async findVersion(userId: string, enterpriseId: string, id: string, versionId: string) {
    const work = await this.findAccessibleWork(userId, enterpriseId, id)
    const version = await this.workVersionModel.findOne({
      _id: versionId,
      workId: work._id,
    })

    if (!version) {
      throw new NotFoundException('作品版本不存在或无权访问')
    }

    return version
  }

  async export(userId: string, enterpriseId: string, id: string, dto: ExportWorkDto) {
    const format = dto.format || 'png'
    if (format !== 'png') {
      throw new BadRequestException('V1.0 暂仅支持 PNG 导出')
    }

    const work = await this.findAccessibleWork(userId, enterpriseId, id)
    const downloadUrl = work.objectKey
      ? await this.storageService.getSignedUrl(work.objectKey, { expiresIn: 60 * 10 })
      : work.finalImageUrl

    const fileName = `${this.sanitizeFileName(work.title)}.png`
    const log = await this.exportLogModel.create({
      workId: work._id,
      enterpriseId: new Types.ObjectId(enterpriseId),
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

  private async findAccessibleWork(userId: string, enterpriseId: string, id: string) {
    this.assertEnterpriseSelected(enterpriseId)

    const work = await this.workModel.findOne({
      _id: id,
      enterpriseId: new Types.ObjectId(enterpriseId),
    })

    if (!work) {
      throw new NotFoundException('作品不存在或无权访问')
    }

    if (work.creatorId.toString() === userId || work.visibility === Visibility.PUBLIC) {
      return work
    }

    if (work.visibility === Visibility.ENTERPRISE) {
      const user = await this.userModel.findById(userId)
      const membership = user?.memberships.find((m) => m.enterpriseId.toString() === enterpriseId)
      if (membership) {
        return work
      }
    }

    if (work.visibility === Visibility.TEAM && work.ownerType === OwnerType.TEAM) {
      const user = await this.userModel.findById(userId)
      const membership = user?.memberships.find(
        (m) =>
          m.enterpriseId.toString() === enterpriseId &&
          m.teamId?.toString() === work.ownerId.toString(),
      )
      if (membership) {
        return work
      }
    }

    throw new NotFoundException('作品不存在或无权访问')
  }

  private async assertCanCreate(
    userId: string,
    enterpriseId: string,
    ownerId: string,
    ownerType: OwnerType,
    visibility: Visibility,
  ) {
    if (visibility === Visibility.PRIVATE && ownerType === OwnerType.USER && ownerId === userId) {
      return
    }

    if (visibility === Visibility.TEAM || visibility === Visibility.ENTERPRISE) {
      await this.assertAdminForScope(userId, enterpriseId, ownerId, ownerType)
      return
    }

    if (visibility === Visibility.PUBLIC) {
      await this.assertAdminForScope(userId, enterpriseId, ownerId, ownerType)
      return
    }

    throw new BadRequestException('无权创建该归属范围的作品')
  }

  private async assertAdminForScope(
    userId: string,
    enterpriseId: string,
    ownerId: string,
    ownerType: OwnerType,
  ) {
    const user = await this.userModel.findById(userId)
    const membership = user?.memberships.find(
      (m) =>
        m.enterpriseId.toString() === enterpriseId &&
        (!m.teamId || (ownerType === OwnerType.TEAM && m.teamId.toString() === ownerId)),
    )

    if (!membership || (membership.role !== Role.OWNER && membership.role !== Role.ADMIN)) {
      throw new BadRequestException('您无权操作该归属范围的作品')
    }
  }

  private assertEnterpriseSelected(enterpriseId: string) {
    if (!enterpriseId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }
  }

  private sanitizeFileName(title: string) {
    return title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'work'
  }
}
