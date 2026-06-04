import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WorkflowNodeType =
  | 'intentNode'
  | 'knowledgeNode'
  | 'promptNode'
  | 'generateNode'
  | 'evaluateNode'
  | 'finishNode';

export type WorkflowNodeStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'stale'
  | 'skipped';

export type WorkflowNodeDocument = WorkflowNode &
  Document & {
    createdAt: Date;
    updatedAt: Date;
  };

@Schema({ timestamps: true })
export class WorkflowNode {
  @Prop({ type: Types.ObjectId, required: true, index: true, ref: 'Workflow' })
  workflowId!: string;

  @Prop({
    type: String,
    enum: [
      'intentNode',
      'knowledgeNode',
      'promptNode',
      'generateNode',
      'evaluateNode',
      'finishNode',
    ],
    required: true,
  })
  type!: WorkflowNodeType;

  @Prop({
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'stale', 'skipped'],
    default: 'pending',
    index: true,
  })
  status!: WorkflowNodeStatus;

  @Prop({ type: Object, default: {} })
  input!: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  output!: Record<string, unknown>;

  @Prop({ type: Number, default: 1 })
  version!: number;

  @Prop({ type: Boolean, default: false })
  userModified!: boolean;

  @Prop({ type: [String], default: [] })
  editableFields!: string[];

  @Prop({ type: String })
  skipReason?: string;

  @Prop({ type: String })
  errorMessage?: string;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;
}

export const WorkflowNodeSchema = SchemaFactory.createForClass(WorkflowNode);

// 联合唯一索引：同一个工作流下，每种类型的节点只能有一条记录（如果有需要的话）。或者靠业务逻辑保证。
WorkflowNodeSchema.index({ workflowId: 1, type: 1 }, { unique: true });
