import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'
import type { WorkflowNodeId, WorkflowNodeStatus } from '../workflow.constants'

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed'
export type WorkflowSessionContext = Record<string, unknown>
export type WorkflowNodeStateMap = Record<WorkflowNodeId, WorkflowNodeStatus>

export interface WorkflowRerunRecord {
  rerunFromNodeId: WorkflowNodeId
  requestedAt: string
}

export type WorkflowDocument = Workflow &
  Document & {
    createdAt: Date
    updatedAt: Date
  }

@Schema({ timestamps: true })
export class Workflow {
  @Prop({ required: true })
  prompt!: string

  @Prop({ required: true, index: true })
  spaceId!: string

  @Prop({
    type: String,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending',
    index: true,
  })
  status!: WorkflowStatus

  @Prop({ type: Object })
  result?: Record<string, unknown>

  @Prop({ type: Object, default: {} })
  sessionContext!: WorkflowSessionContext

  @Prop({ type: Object, default: {} })
  nodeStates!: Partial<WorkflowNodeStateMap>

  @Prop()
  activeNodeId?: WorkflowNodeId

  @Prop({ type: Array, default: [] })
  rerunHistory!: WorkflowRerunRecord[]

  @Prop()
  errorMessage?: string
}

export const WorkflowSchema = SchemaFactory.createForClass(Workflow)
