import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { TASK_STATUSES, TASK_TRANSITIONS, canTransitionTask, taskPermissions } from './tasks'
import { Role } from './authorization'

test('Task 全部合法和非法转换', () => {
  const expected = {
    draft: ['pending', 'cancelled'],
    pending: ['accepted', 'draft', 'cancelled'],
    accepted: ['in_progress', 'cancelled'],
    in_progress: ['submitted', 'cancelled'],
    submitted: ['reviewing'],
    reviewing: ['completed', 'rejected'],
    rejected: ['in_progress', 'submitted', 'cancelled'],
    completed: [],
    cancelled: [],
  }
  assert.deepEqual(TASK_TRANSITIONS, expected)
  for (const from of TASK_STATUSES)
    for (const to of TASK_STATUSES) {
      assert.equal(
        canTransitionTask(from, to),
        (expected[from] as string[]).includes(to),
        `${from} → ${to}`,
      )
    }
})
test('管理者、负责人和 Viewer 权限互相独立', () => {
  assert.deepEqual(taskPermissions(Role.MEMBER, 'a', 'a'), {
    manage: false,
    execute: true,
    review: false,
  })
  assert.deepEqual(taskPermissions(Role.ADMIN, 'b', 'a'), {
    manage: true,
    execute: false,
    review: true,
  })
  assert.deepEqual(taskPermissions(Role.VIEWER, 'a', 'a'), {
    manage: false,
    execute: false,
    review: false,
  })
})
