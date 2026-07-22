import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { OwnerType, Role, Visibility } from '@/common/enums'
import { User, UserDocument } from '@/modules/org/schemas/user.schema'
import { OrgService } from '@/modules/org/org.service'
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
    private readonly orgService: OrgService,
  ) {}

  async create(userId: string, dto: CreateWorkDto) {
    const space = await this.orgService.getAccessibleSpace(userId, dto.spaceId)
    if (dto.workflowId && Types.ObjectId.isValid(dto.workflowId)) {
      const existing = await this.workModel.findOne({
        workflowId: new Types.ObjectId(dto.workflowId),
        creatorId: new Types.ObjectId(userId),
      })
      if (existing) return this.findOne(userId, existing._id.toString())
    }
    const ownerType =
      space.spaceType === 'personal'
        ? OwnerType.USER
        : space.spaceType === 'team'
          ? OwnerType.TEAM
          : OwnerType.ENTERPRISE
    const ownerId = space.spaceType === 'personal' ? userId : dto.spaceId
    const visibility =
      space.spaceType === 'personal'
        ? Visibility.PRIVATE
        : space.spaceType === 'team'
          ? Visibility.TEAM
          : Visibility.ENTERPRISE

    const work = await this.workModel.create({
      title: dto.title,
      description: dto.description,
      finalImageUrl: dto.finalImageUrl,
      objectKey: dto.objectKey,
      workflowId: dto.workflowId ? new Types.ObjectId(dto.workflowId) : undefined,
      spaceId: dto.spaceId,
      spaceType: space.spaceType,
      selectedCandidateId:
        typeof dto.metadata?.selectedCandidateId === 'string'
          ? dto.metadata.selectedCandidateId
          : undefined,
      qualityReport: dto.qualityReport || {},
      nodesSnapshot: dto.nodesSnapshot || {},
      ownerId: new Types.ObjectId(ownerId),
      ownerType,
      visibility,
      creatorId: new Types.ObjectId(userId),
      enterpriseId: space.enterpriseId ? new Types.ObjectId(space.enterpriseId) : undefined,
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

    return this.findOne(userId, work._id.toString())
  }

  async findAll(userId: string, spaceId: string) {
    await this.orgService.getAccessibleSpace(userId, spaceId)
    const works = await this.workModel
      .find({ spaceId })
      .populate('creatorId', 'email profile')
      .sort({ createdAt: -1 })
    return Promise.all(
      works.map(async (work) => ({
        ...work.toObject(),
        finalImageUrl: work.objectKey
          ? await this.storageService.getSignedUrl(work.objectKey)
          : work.finalImageUrl,
      })),
    )
  }

  async findOne(userId: string, id: string) {
    const work = await this.findAccessibleWork(userId, id)
    const versions = await this.workVersionModel.find({ workId: work._id }).sort({ versionNo: -1 })
    const previewVersions = await Promise.all(
      versions.map(async (version) => ({
        ...version.toObject(),
        imageUrl: version.objectKey
          ? await this.storageService.getSignedUrl(version.objectKey)
          : version.imageUrl,
      })),
    )

    return {
      ...work.toObject(),
      finalImageUrl: work.objectKey
        ? await this.storageService.getSignedUrl(work.objectKey)
        : work.finalImageUrl,
      versions: previewVersions,
    }
  }

  async remove(userId: string, id: string) {
    const work = await this.findAccessibleWork(userId, id)

    if (work.creatorId.toString() !== userId) {
      await this.assertAdminForScope(
        userId,
        work.enterpriseId?.toString() || '',
        work.ownerId.toString(),
        work.ownerType,
      )
    }

    await this.workVersionModel.deleteMany({ workId: work._id })
    await this.workModel.findByIdAndDelete(work._id)

    return { success: true }
  }

  async createVersion(userId: string, id: string, dto: CreateWorkVersionDto) {
    const work = await this.findAccessibleWork(userId, id)

    if (work.creatorId.toString() !== userId) {
      await this.assertAdminForScope(
        userId,
        work.enterpriseId?.toString() || '',
        work.ownerId.toString(),
        work.ownerType,
      )
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

  async findVersions(userId: string, id: string) {
    const work = await this.findAccessibleWork(userId, id)

    return this.workVersionModel.find({ workId: work._id }).sort({ versionNo: -1 })
  }

  async findVersion(userId: string, id: string, versionId: string) {
    const work = await this.findAccessibleWork(userId, id)
    const version = await this.workVersionModel.findOne({
      _id: versionId,
      workId: work._id,
    })

    if (!version) {
      throw new NotFoundException('作品版本不存在或无权访问')
    }

    return version
  }

  async export(userId: string, id: string, dto: ExportWorkDto) {
    const format = dto.format || 'png'
    if (format !== 'png') {
      throw new BadRequestException('V1.0 暂仅支持 PNG 导出')
    }

    const work = await this.findAccessibleWork(userId, id)
    await this.assertPngExport(work.objectKey, work.finalImageUrl)
    const downloadUrl = work.objectKey
      ? await this.storageService.getSignedUrl(work.objectKey, { expiresIn: 60 * 10 })
      : work.finalImageUrl

    const fileName = `${this.sanitizeFileName(work.title)}.png`
    const log = await this.exportLogModel.create({
      workId: work._id,
      enterpriseId: work.enterpriseId,
      spaceId: work.spaceId,
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

  private async findAccessibleWork(userId: string, id: string) {
    const work = await this.workModel.findById(id)

    if (!work) {
      throw new NotFoundException('作品不存在或无权访问')
    }
    await this.orgService.getAccessibleSpace(userId, work.spaceId)

    if (work.creatorId.toString() === userId || work.visibility === Visibility.PUBLIC) {
      return work
    }

    if (work.visibility === Visibility.ENTERPRISE) return work

    if (work.visibility === Visibility.TEAM && work.ownerType === OwnerType.TEAM) {
      const user = await this.userModel.findById(userId)
      const membership = user?.memberships.find(
        (m) => m.teamId?.toString() === work.ownerId.toString(),
      )
      if (membership) {
        return work
      }
    }

    throw new NotFoundException('作品不存在或无权访问')
  }

  private async assertPngExport(objectKey: string | undefined, imageUrl: string) {
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    if (objectKey) {
      const object = await this.storageService.getObjectPrefix(objectKey, 8)
      if (
        object.contentType !== 'image/png' ||
        !Buffer.from(object.bytes).subarray(0, 8).equals(pngSignature)
      ) {
        throw new BadRequestException('作品对象不是有效 PNG，无法导出')
      }
      return
    }

    const response = await fetch(imageUrl, { headers: { Range: 'bytes=0-7' } })
    const bytes = Buffer.from(await response.arrayBuffer()).subarray(0, 8)
    if (
      !response.ok ||
      !response.headers.get('content-type')?.startsWith('image/png') ||
      !bytes.equals(pngSignature)
    ) {
      throw new BadRequestException('作品地址未返回有效 PNG，无法导出')
    }
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

  private sanitizeFileName(title: string) {
    return title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'work'
  }
}
