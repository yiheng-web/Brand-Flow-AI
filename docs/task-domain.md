# Task 领域与权限

Task 是团队管理实体，Workflow 是执行实体，WorkVersion 是不可变成果，Submission 是审核实体。任务创建者从 JWT 获取，企业由服务端团队授权结果推导；客户端不能设置状态、创建者或审核权限。

第一版只有 single_assignee。Owner/Admin 创建、编辑草稿、派发、取消和审核；当前可写团队成员且是 assignee 才能接受、拒绝、执行和提交；Viewer 只读。企业管理者沿用 V2 团队管理穿透权限。每次操作重新读取成员关系，查询限定 enterpriseId + teamId。

状态转换以 contracts 的 TASK_TRANSITIONS 为准。接受与取消以 status + version 条件原子更新；请求携带过期 version 返回 409。任务、审计与通知在同一 MongoDB 事务内提交，运行环境需要副本集。

执行人拒绝派发必须提供原因，任务回到 draft，清空 assigneeId，保留 declineReason 与 task.decline 事件，由管理员重新派发。这与成果审核 rejected 状态不同。正式派发后禁止编辑要求或删除；取消保留历史。

deadline 的 overdue/upcoming 为派生标识，不覆盖业务状态。正式启动时再通过 Workflow 服务解析强制知识与素材，不复制执行引擎。
