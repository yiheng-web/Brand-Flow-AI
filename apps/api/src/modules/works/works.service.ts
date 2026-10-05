import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import type { WorkflowResult } from '@brand-flow/contracts'
import { OwnerType, Visibility } from '@/common/enums'
import { OrgService } from '@/modules/org/org.service'
import { StorageService } from '@/modules/storage/storage.service'
import { CreateWorkDto, ExportWorkDto } from './dto/works.dto'
import { assertObjectId, personalCreatorFilter } from '@/common/personal-scope'
import { Work, WorkDocument } from './schemas/work.schema'
import { WorkVersion, WorkVersionDocument } from './schemas/work-version.schema'
import { ExportLog, ExportLogDocument } from './schemas/export-log.schema'
import { Workflow, WorkflowDocument } from '../workflow/schemas/workflow.schema'
import { WorkflowNode, WorkflowNodeDocument } from '../workflow/schemas/workflow-node.schema'

@Injectable()
export class WorksService {
  private readonly logger = new Logger(WorksService.name)
  constructor(
    @InjectModel(Work.name) private readonly workModel: Model<WorkDocument>,
    @InjectModel(WorkVersion.name)
    private readonly workVersionModel: Model<WorkVersionDocument>,
    @InjectModel(ExportLog.name)
    private readonly exportLogModel: Model<ExportLogDocument>,
    @InjectModel(Workflow.name) private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel(WorkflowNode.name)
    private readonly workflowNodeModel: Model<WorkflowNodeDocument>,
    private readonly storageService: StorageService,
    private readonly orgService: OrgService,
  ) {}

  async create(userId: string, dto: CreateWorkDto) {
    if (!Types.ObjectId.isValid(dto.workflowId)) {
      throw new BadRequestException('来源工作流 ID 格式不正确')
    }
    const workflow = await this.workflowModel.findOne({ _id: dto.workflowId, userId })
    if (!workflow) throw new NotFoundException('来源工作流不存在或无权访问')
    const result = workflow?.result as WorkflowResult | undefined
    if (
      !workflow ||
      workflow.spaceId !== dto.spaceId ||
      workflow.status !== 'completed' ||
      !result?.finalEvaluation?.passed ||
      !result.compose
    ) {
      throw new BadRequestException('只能保存本人当前 Space 中已完成且质检通过的工作流')
    }
    const selectedCandidate = result.generate?.candidates.find(
      (candidate) => candidate.id === result.generate?.selectedCandidateId,
    )
    const selectedCandidateKey = selectedCandidate?.metadata?.objectKey
    const trustedObjectKey =
      ('objectKey' in result.compose ? result.compose.objectKey : undefined) ||
      (typeof selectedCandidateKey === 'string' ? selectedCandidateKey : undefined)
    if (
      !trustedObjectKey ||
      !trustedObjectKey.startsWith(`workflows/${userId}/${dto.workflowId}/`)
    ) {
      throw new BadRequestException('工作流成片缺少可信对象存储来源')
    }
    if (dto.objectKey && dto.objectKey !== trustedObjectKey) {
      throw new BadRequestException('作品对象与工作流成片不一致')
    }
    const space = await this.orgService.authorization.assertCanManageWorks(userId, dto.spaceId)
    const existing = await this.workModel.findOne({ workflowId: workflow._id })
    if (existing) {
      await this.createTrustedVersion(userId, existing._id.toString(), dto.workflowId)
      return this.findOne(userId, existing._id.toString())
    }
    const nodes = await this.workflowNodeModel.find({ workflowId: dto.workflowId }).sort({
      createdAt: 1,
    })
    const nodesSnapshot = Object.fromEntries(
      nodes.map((node) => [node.type, { status: node.status, output: node.output }]),
    )
    const workId = new Types.ObjectId()
    const workObjectKey = `works/${userId}/${workId.toString()}/versions/1.png`
    const sourceObject = await this.storageService.getObject(trustedObjectKey)
    if (sourceObject.contentType !== 'image/png') {
      throw new BadRequestException('工作流成片不是有效 PNG')
    }
    await this.storageService.uploadObject({
      key: workObjectKey,
      body: Buffer.from(sourceObject.bytes),
      size: sourceObject.bytes.length,
      contentType: 'image/png',
      metadata: { workflowId: dto.workflowId, sourceObjectKey: trustedObjectKey },
    })
    const trustedImageUrl = await this.storageService.getSignedUrl(workObjectKey)
    let work: WorkDocument
    try {
      work = await this.workModel.create({
        _id: workId,
        title: dto.title,
        description: dto.description,
        finalImageUrl: trustedImageUrl,
        objectKey: workObjectKey,
        workflowId: workflow._id,
        spaceId: dto.spaceId,
        spaceType: space.spaceType,
        selectedCandidateId: result.generate?.selectedCandidateId || undefined,
        qualityReport: result.finalEvaluation,
        nodesSnapshot,
        ownerId: new Types.ObjectId(userId),
        ownerType: OwnerType.USER,
        visibility: Visibility.PRIVATE,
        creatorId: new Types.ObjectId(userId),
        enterpriseId: space.enterpriseId ? new Types.ObjectId(space.enterpriseId) : undefined,
        metadata: {
          selectedCandidateId: result.generate?.selectedCandidateId,
          artText: result.compositionDraft,
          composition: result.compose,
        },
      })
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        Reflect.get(error, 'code') === 11000
      ) {
        const duplicate = await this.workModel.findOne({ workflowId: workflow._id })
        if (duplicate) {
          await this.storageService.deleteObject(workObjectKey).catch(() => undefined)
          return this.findOne(userId, duplicate._id.toString())
        }
      }
      await this.storageService.deleteObject(workObjectKey).catch(() => undefined)
      throw error
    }

    try {
      await this.workVersionModel.create({
        workId: work._id,
        versionNo: 1,
        imageUrl: trustedImageUrl,
        objectKey: workObjectKey,
        sourceWorkflowId: workflow._id,
        sourceObjectKey: trustedObjectKey,
        sourceRunVersion: workflow.runVersion,
        sourceRevisionId: result.revision?.id,
        promptPlan: result.prompt,
        feedback: result.revision?.feedback,
        nodesSnapshot,
        qualityReport: result.finalEvaluation,
        createdBy: new Types.ObjectId(userId),
      })
    } catch (error) {
      await this.workModel.findByIdAndDelete(work._id)
      await this.storageService.deleteObject(workObjectKey).catch(() => undefined)
      throw error
    }

    return this.findOne(userId, work._id.toString())
  }

  async findAll(userId: string, spaceId: string) {
    await this.orgService.getAccessibleSpace(userId, spaceId)
    const works = await this.workModel
      .find({ spaceId, ...personalCreatorFilter(userId) })
      .populate('creatorId', 'email profile')
      .sort({ createdAt: -1 })
    return Promise.all(
      works.map(async (work) => ({
        ...work.toObject(),
        finalImageUrl: await this.signWorkObject(work, work.objectKey),
      })),
    )
  }

  async findOne(userId: string, id: string) {
    const work = await this.findAccessibleWork(userId, id)
    const versions = await this.workVersionModel.find({ workId: work._id }).sort({ versionNo: -1 })
    const previewVersions = await Promise.all(
      versions.map(async (version) => ({
        ...version.toObject(),
        imageUrl: await this.signWorkObject(work, version.objectKey),
      })),
    )

    return {
      ...work.toObject(),
      finalImageUrl: await this.signWorkObject(work, work.objectKey),
      versions: previewVersions,
    }
  }

  async remove(userId: string, id: string) {
    const work = await this.findAccessibleWork(userId, id)
    await this.orgService.authorization.assertCanManageWorks(userId, work.spaceId)

    const versions = await this.workVersionModel.find({ workId: work._id }, { objectKey: 1 })
    const objectKeys = new Set(
      [work.objectKey, ...versions.map((version) => version.objectKey)].filter(
        (key): key is string => Boolean(key),
      ),
    )
    // 先校验全部对象，历史污染记录也不能触发他人对象的删除。
    for (const key of objectKeys) this.assertWorkObject(work, key)
    await Promise.all([...objectKeys].map((key) => this.storageService.deleteObject(key)))
    await this.workVersionModel.deleteMany({ workId: work._id })
    await this.workModel.findByIdAndDelete(work._id)

    return { success: true }
  }

  async createTrustedVersion(userId: string, id: string, workflowId: string) {
    const work = await this.findAccessibleWork(userId, id)
    await this.orgService.authorization.assertCanManageWorks(userId, work.spaceId)
    if (work.creatorId.toString() !== userId || !Types.ObjectId.isValid(workflowId)) {
      throw new BadRequestException('只能从本人有效工作流创建新版本')
    }
    const workflow = await this.workflowModel.findOne({ _id: workflowId, userId })
    if (!workflow) throw new NotFoundException('来源工作流不存在或无权访问')
    const result = workflow?.result as WorkflowResult | undefined
    const selectedCandidate = result?.generate?.candidates.find(
      (candidate) => candidate.id === result.generate?.selectedCandidateId,
    )
    const selectedCandidateKey = selectedCandidate?.metadata?.objectKey
    const sourceKey =
      (result?.compose && 'objectKey' in result.compose ? result.compose.objectKey : undefined) ||
      (typeof selectedCandidateKey === 'string' ? selectedCandidateKey : undefined)
    if (
      !workflow ||
      workflow.spaceId !== work.spaceId ||
      workflow.status !== 'completed' ||
      !result?.finalEvaluation?.passed ||
      !sourceKey ||
      !sourceKey.startsWith(`workflows/${userId}/${workflowId}/`)
    ) {
      throw new BadRequestException('只能从已完成且质检通过的可信工作流创建版本')
    }
    const source = await this.storageService.getObject(sourceKey)
    if (source.contentType !== 'image/png') throw new BadRequestException('工作流成片不是有效 PNG')
    const sourceFilter = {
      workId: work._id,
      sourceWorkflowId: workflow._id,
      sourceObjectKey: sourceKey,
    }
    const duplicate = await this.workVersionModel.findOne(sourceFilter)
    if (duplicate) return duplicate
    const latest = await this.workVersionModel.findOne({ workId: work._id }).sort({ versionNo: -1 })
    if (!latest) throw new ConflictException('作品初始版本正在保存，请稍后重试')
    // 为旧作品补齐计数，再原子分配版本号；并发请求不能取得同一个号码。
    await this.workModel.updateOne(
      { _id: work._id },
      { $max: { versionCounter: latest.versionNo } },
    )
    const allocated = await this.workModel.findOneAndUpdate(
      { _id: work._id, ...personalCreatorFilter(userId) },
      { $inc: { versionCounter: 1 } },
      { new: true },
    )
    if (!allocated) throw new NotFoundException('作品不存在或无权访问')
    const versionNo = allocated.versionCounter
    const objectKey = `works/${userId}/${work._id.toString()}/versions/${versionNo}-${randomUUID()}.png`
    await this.storageService.uploadObject({
      key: objectKey,
      body: Buffer.from(source.bytes),
      size: source.bytes.length,
      contentType: 'image/png',
      metadata: { workflowId, sourceObjectKey: sourceKey },
    })
    let createdVersion: WorkVersionDocument | undefined
    try {
      const imageUrl = await this.storageService.getSignedUrl(objectKey)
      const nodes = await this.workflowNodeModel.find({ workflowId }).sort({ createdAt: 1 })
      const nodesSnapshot = Object.fromEntries(
        nodes.map((node) => [node.type, { status: node.status, output: node.output }]),
      )
      const version = await this.workVersionModel.create({
        workId: work._id,
        versionNo,
        imageUrl,
        objectKey,
        sourceWorkflowId: workflow._id,
        sourceObjectKey: sourceKey,
        sourceRunVersion: workflow.runVersion,
        sourceRevisionId: result.revision?.id,
        promptPlan: result.prompt,
        feedback: result.revision?.feedback,
        nodesSnapshot,
        qualityReport: result.finalEvaluation,
        createdBy: new Types.ObjectId(userId),
      })
      createdVersion = version
      await this.workModel.updateOne(
        {
          _id: work._id,
          $or: [{ currentVersionNo: { $lt: versionNo } }, { currentVersionNo: { $exists: false } }],
        },
        {
          $set: {
            finalImageUrl: imageUrl,
            objectKey,
            nodesSnapshot,
            qualityReport: result.finalEvaluation,
            currentVersionNo: versionNo,
          },
        },
      )
      return version
    } catch (error) {
      if (createdVersion) await this.workVersionModel.deleteOne({ _id: createdVersion._id })
      try {
        await this.storageService.deleteObject(objectKey)
      } catch (cleanupError: unknown) {
        this.logger.error(
          '作品版本写入失败后的对象清理失败',
          cleanupError instanceof Error ? cleanupError.stack : undefined,
        )
      }
      if (error && typeof error === 'object' && Reflect.get(error, 'code') === 11000) {
        const completed = await this.workVersionModel.findOne(sourceFilter)
        if (completed) return completed
      }
      throw error
    }
  }

  async updateFavorite(userId: string, id: string, isFavorite: boolean) {
    const work = await this.findAccessibleWork(userId, id)
    await this.orgService.authorization.assertCanManageWorks(userId, work.spaceId)
    if (work.creatorId.toString() !== userId) {
      throw new BadRequestException('只能收藏本人创建的作品')
    }
    work.isFavorite = isFavorite
    await work.save()
    return { id: work._id.toString(), isFavorite }
  }

  async findVersions(userId: string, id: string) {
    const work = await this.findAccessibleWork(userId, id)

    const versions = await this.workVersionModel.find({ workId: work._id }).sort({ versionNo: -1 })
    for (const version of versions) {
      this.assertWorkObject(work, version.objectKey)
    }
    return versions
  }

  async findVersion(userId: string, id: string, versionId: string) {
    assertObjectId(versionId)
    const work = await this.findAccessibleWork(userId, id)
    const version = await this.workVersionModel.findOne({
      _id: versionId,
      workId: work._id,
    })

    if (!version) {
      throw new NotFoundException('作品版本不存在或无权访问')
    }

    this.assertWorkObject(work, version.objectKey)
    return version
  }

  async export(userId: string, id: string, dto: ExportWorkDto, versionId?: string) {
    const format = dto.format || 'png'
    if (format !== 'png') {
      throw new BadRequestException('V1.0 暂仅支持 PNG 导出')
    }

    const work = await this.findAccessibleWork(userId, id)
    const version = versionId ? await this.findVersion(userId, id, versionId) : undefined
    const objectKey = version?.objectKey ?? work.objectKey
    this.assertWorkObject(work, objectKey)
    await this.assertPngExport(objectKey)
    const fileName = `${this.sanitizeFileName(work.title)}${version ? `-V${version.versionNo}` : ''}.png`
    const downloadUrl = await this.storageService.getSignedUrl(objectKey, {
      expiresIn: 60 * 10,
      downloadName: fileName,
    })

    const log = await this.exportLogModel.create({
      workId: work._id,
      enterpriseId: work.enterpriseId,
      spaceId: work.spaceId,
      exportedBy: new Types.ObjectId(userId),
      format,
      fileName,
      downloadUrl,
      metadata: {
        objectKey,
        versionId: version?._id,
        visibility: work.visibility,
      },
    })

    return {
      workId: work._id,
      versionId: version?._id,
      exportLogId: log._id,
      format,
      fileName,
      downloadUrl,
    }
  }

  private async findAccessibleWork(userId: string, id: string) {
    assertObjectId(id)
    const work = await this.workModel.findOne({ _id: id, ...personalCreatorFilter(userId) })

    if (!work) {
      throw new NotFoundException('作品不存在或无权访问')
    }
    if (work.creatorId.toString() !== userId) {
      throw new NotFoundException('作品不存在或无权访问')
    }
    await this.orgService.getAccessibleSpace(userId, work.spaceId)
    return work
  }

  private assertWorkObject(work: WorkDocument, key: string | undefined): asserts key is string {
    // 列表填充创建者后，使用 Mongoose 保存的原始 ID 校验对象归属。
    const populatedCreatorId: unknown = work.populated('creatorId')
    const creatorId =
      populatedCreatorId instanceof Types.ObjectId ? populatedCreatorId : work.creatorId
    const prefix = `works/${creatorId.toString()}/${work._id.toString()}/versions/`
    if (
      !key ||
      !key.startsWith(prefix) ||
      !/^\d+(?:-[0-9a-f-]{36})?\.png$/.test(key.slice(prefix.length))
    ) {
      throw new BadRequestException('作品对象缺少可信归属，拒绝签名或删除')
    }
  }

  private async signWorkObject(work: WorkDocument, key: string | undefined): Promise<string> {
    this.assertWorkObject(work, key)
    return this.storageService.getSignedUrl(key)
  }

  private async assertPngExport(objectKey: string) {
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    const object = await this.storageService.getObjectPrefix(objectKey, 8)
    if (
      object.contentType !== 'image/png' ||
      !Buffer.from(object.bytes).subarray(0, 8).equals(pngSignature)
    ) {
      throw new BadRequestException('作品对象不是有效 PNG，无法导出')
    }
  }

  private sanitizeFileName(title: string) {
    return title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'work'
  }
}
