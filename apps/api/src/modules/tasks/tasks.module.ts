import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { OrgModule } from '../org/org.module'
import { Task, TaskSchema } from './schemas/task.schema'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'
import { WorkflowModule } from '../workflow/workflow.module'
import { TasksExecutionService } from './tasks-execution.service'

@Module({
  imports: [
    OrgModule,
    WorkflowModule,
    MongooseModule.forFeature([{ name: Task.name, schema: TaskSchema }]),
  ],
  controllers: [TasksController],
  providers: [TasksService, TasksExecutionService],
  exports: [TasksService],
})
export class TasksModule {}
