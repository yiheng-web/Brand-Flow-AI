import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { OrgModule } from '../org/org.module'
import { Task, TaskSchema } from './schemas/task.schema'
import { TasksController } from './tasks.controller'
import { TasksService } from './tasks.service'
import { WorkflowModule } from '../workflow/workflow.module'
import { TasksExecutionService } from './tasks-execution.service'
import { Submission, SubmissionSchema } from './schemas/submission.schema'
import { Work, WorkSchema } from '../works/schemas/work.schema'
import { WorkVersion, WorkVersionSchema } from '../works/schemas/work-version.schema'
import { SubmissionsService } from './submissions.service'

@Module({
  imports: [
    OrgModule,
    WorkflowModule,
    MongooseModule.forFeature([
      { name: Task.name, schema: TaskSchema },
      { name: Submission.name, schema: SubmissionSchema },
      { name: Work.name, schema: WorkSchema },
      { name: WorkVersion.name, schema: WorkVersionSchema },
    ]),
  ],
  controllers: [TasksController],
  providers: [TasksService, TasksExecutionService, SubmissionsService],
  exports: [TasksService],
})
export class TasksModule {}
