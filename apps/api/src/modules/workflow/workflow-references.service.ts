import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import type { ResolvedWorkflowReference, WorkflowReferenceInput } from '@brand-flow/contracts'
import { REFERENCE_ROLES } from '@brand-flow/contracts'
import { Asset } from '../assets/asset.schema'
import type { AssetDocument } from '../assets/asset.schema'
import { StorageService } from '../storage/storage.service'
import { assertObjectId } from '@/common/personal-scope'
import { AuthorizationService } from '../org/authorization.service'

@Injectable()
export class WorkflowReferencesService {
  constructor(
    @InjectModel(Asset.name) private readonly assetModel: Model<AssetDocument>,
    private readonly storageService: StorageService,
    private readonly authorization: AuthorizationService,
  ) {}

  async resolve(
    inputs: WorkflowReferenceInput[],
    userId: string,
    spaceId = 'personal',
  ): Promise<ResolvedWorkflowReference[]> {
    const space = await this.authorization.assertCanReadSpace(userId, spaceId)
    const scope =
      space.spaceType === 'personal'
        ? {
            creatorId: new Types.ObjectId(userId),
            ownerId: new Types.ObjectId(userId),
            ownerType: 'user',
            visibility: 'private',
          }
        : {
            enterpriseId: new Types.ObjectId(space.enterpriseId),
            $or: [
              {
                ownerId: new Types.ObjectId(space.enterpriseId),
                ownerType: 'enterprise',
                visibility: 'enterprise',
              },
              ...(space.spaceType === 'team'
                ? [
                    {
                      ownerId: new Types.ObjectId(space.spaceId),
                      ownerType: 'team',
                      visibility: 'team',
                    },
                  ]
                : []),
            ],
          }
    if (inputs.length > 4 || new Set(inputs.map((input) => input.assetId)).size !== inputs.length)
      throw new BadRequestException('最多选择 4 个不重复的参考素材')
    return Promise.all(
      inputs.map(async (input) => {
        assertObjectId(input.assetId)
        if (!REFERENCE_ROLES.includes(input.role))
          throw new BadRequestException('不支持的参考素材用途')
        const asset = await this.assetModel.findOne({
          _id: new Types.ObjectId(input.assetId),
          ...scope,
        })
        if (!asset) throw new NotFoundException('参考素材不存在或无权访问')
        if (
          !asset.objectKey?.startsWith(
            `assets/${asset.ownerType}/${asset.ownerId}/${input.assetId}/`,
          ) ||
          !/^original\.(png|jpg|webp)$/.test(
            asset.objectKey.slice(
              `assets/${asset.ownerType}/${asset.ownerId}/${input.assetId}/`.length,
            ),
          ) ||
          !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType ?? '')
        )
          throw new BadRequestException(
            '参考素材须为上传到当前空间或所属企业的 PNG、JPEG 或 WebP 图片',
          )
        return {
          assetId: input.assetId,
          role: input.role,
          name: asset.name,
          objectKey: asset.objectKey,
          mimeType: asset.mimeType!,
          imageUrl: await this.storageService.getSignedUrl(asset.objectKey),
          strategy: input.role === 'logo' ? 'compose_logo' : 'visual_constraints',
        }
      }),
    )
  }

  async forExecution(
    references: ResolvedWorkflowReference[],
    userId: string,
    spaceId = 'personal',
  ): Promise<ResolvedWorkflowReference[]> {
    const verified = await this.resolve(
      references.map(({ assetId, role }) => ({ assetId, role })),
      userId,
      spaceId,
    )
    return Promise.all(
      verified.map(async (reference) => {
        if (reference.strategy === 'compose_logo') return reference
        const object = await this.storageService.getObject(reference.objectKey)
        if (object.bytes.length > 10 * 1024 * 1024 || object.bytes.length === 0)
          throw new BadRequestException('参考图片读取失败或超过 10 MiB')
        return {
          ...reference,
          imageUrl: `data:${reference.mimeType};base64,${Buffer.from(object.bytes).toString('base64')}`,
        }
      }),
    )
  }
}
