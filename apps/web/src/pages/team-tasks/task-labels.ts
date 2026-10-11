import type { TaskStatus } from '@brand-flow/contracts'
export const TASK_LABELS: Record<TaskStatus, string> = {
  draft: '草稿',
  pending: '待接受',
  accepted: '已接受',
  in_progress: '进行中',
  submitted: '待审核',
  reviewing: '审核中',
  rejected: '待修改',
  completed: '已完成',
  cancelled: '已取消',
}
export const TASK_EVENT_LABELS: Record<string, string> = {
  'task.created': '创建任务',
  'task.updated': '编辑草稿',
  'task.assign': '派发任务',
  'task.accept': '接受任务',
  'task.decline': '拒绝派发',
  'task.cancel': '取消任务',
  'task.started': '开始创作',
  'task.submitted': '提交成果',
  'task.rejected': '审核驳回',
  'task.approved': '审核通过',
  'task.resumed': '开始返修',
}
