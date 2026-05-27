import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Asset, AssetDocument } from './asset.schema'
import { User, UserDocument } from '@/modules/org/schemas/user.schema'
import { CreateAssetDto } from './dto/assets.dto'
import { Visibility, OwnerType } from '@/common/enums'

@Injectable()
export class AssetsService {
  constructor(
    @InjectModel(Asset.name) private assetModel: Model<AssetDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async createAsset(userId: string, enterpriseId: string, createDto: CreateAssetDto) {
    if (!enterpriseId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    const { name, type, url, ownerId, ownerType, visibility, metadata } = createDto

    const asset = await this.assetModel.create({
      name,
      type,
      url,
      ownerId: new Types.ObjectId(ownerId),
      ownerType,
      visibility,
      creatorId: new Types.ObjectId(userId),
      enterpriseId: new Types.ObjectId(enterpriseId),
      metadata: metadata || {},
    })

    return asset
  }

  async getAssets(userId: string, enterpriseId: string) {
    if (!enterpriseId) {
      throw new BadRequestException('请先选择或切换到一家企业')
    }

    const user = await this.userModel.findById(userId)
    if (!user) {
      throw new NotFoundException('用户不存在')
    }

    const myTeams = user.memberships
      .filter((m) => m.enterpriseId.toString() === enterpriseId && m.teamId)
      .map((m) => m.teamId.toString())

    const query = {
      enterpriseId: new Types.ObjectId(enterpriseId),
      $or: [
        { visibility: Visibility.PUBLIC },
        { creatorId: new Types.ObjectId(userId) },
        { visibility: Visibility.ENTERPRISE },
        {
          visibility: Visibility.TEAM,
          ownerType: OwnerType.TEAM,
          ownerId: { $in: myTeams.map((id) => new Types.ObjectId(id)) },
        },
      ],
    }

    return this.assetModel
      .find(query)
      .populate('creatorId', 'email profile')
      .sort({ createdAt: -1 })
  }

  async deleteAsset(userId: string, assetId: string) {
    const asset = await this.assetModel.findById(assetId)
    if (!asset) {
      throw new NotFoundException('资产不存在')
    }

    // TODO: 后续可以引入更细粒度的 RBAC 权限判断，允许企业 OWNER/ADMIN 删除成员资产
    if (asset.creatorId.toString() !== userId) {
      throw new BadRequestException('您无权删除此资产')
    }

    await this.assetModel.findByIdAndDelete(assetId)
    return { success: true }
  }
}
