# Task 领域与权限

Task 是团队管理实体，Workflow 是执行实体，WorkVersion 是不可变成果，Submission 是审核实体。任务创建者从 JWT 获取，企业由服务端团队授权结果推导；客户端不能设置状态、创建者或审核权限。

第一版只有 single_assignee。Owner/Admin 创建、编辑草稿、派发、取消和审核；当前可写团队成员且是 assignee 才能接受、拒绝、执行和提交；Viewer 只读。企业管理者沿用 V2 团队管理穿透权限。每次操作重新读取成员关系，查询限定 enterpriseId + teamId。

状态转换以 contracts 的 TASK_TRANSITIONS 为准。接受与取消以 status + version 条件原子更新；请求携带过期 version 返回 409。任务、审计与通知在同一 MongoDB 事务内提交，运行环境需要副本集。

执行人拒绝派发必须提供原因，任务回到 draft，清空 assigneeId，保留 declineReason 与 task.decline 事件，由管理员重新派发。这与成果审核 rejected 状态不同。正式派发后禁止编辑要求或删除；取消保留历史。

deadline 的 overdue/upcoming 为派生标识，不覆盖业务状态。正式启动时再通过 Workflow 服务解析强制知识与素材，不复制执行引擎。

## V3.2 派发与看板验证

团队业务任务入口为 `/team-tasks`，原 `/tasks` 保留 Workflow 历史。创建表单可保存草稿或派发；详情使用服务端计算权限接受、拒绝、取消及重新指派。品牌要求保存在创作要求中，可选附加知识库和风格参考素材，强制知识由启动时继承。

`node scripts/smoke-tasks.cjs mongodb://127.0.0.1:27019 <Playwright模块目录>` 使用随机数据库、五角色 JWT、专用 Mongo 副本集与 Edge。已验证创建/派发/通知/拒绝/再派发/接受、租户隔离、旧版本冲突、看板、详情与刷新。结束清理随机数据库。另通过三项 React 测试、Task/Activity 12 项测试以及 Web/API lint/build。

## V3.3 执行联动

`POST /tasks/:id/start` 仅负责人在 accepted 状态使用最新 version 调用。Task、pending Workflow 与七节点初始化在一个事务中提交；唯一 activeWorkflowId 不被覆盖。随后在工作台运行既有引擎，图文模式和团队归属来自任务快照。关联 Workflow 的写操作必须由负责人在 Task in_progress 状态执行。

任务取消和未完成 Workflow 的取消、runVersion/eventSequence 递增、节点 stale 更新在同一事务中完成。旧队列载荷无法覆盖结果。任务详情每三秒刷新 Workflow 派生进度，离开页面停止订阅；工作台显示返回 Task 的入口。

真实 Mongo/Redis/Garage S3 + Demo 验收覆盖七节点、企业强制知识继承、重复 start、输出模式锁定、非负责人写入拒绝、取消旧 worker 隔离、工作台往返和刷新。Workflow/Task Jest 26 项、API/Web lint、API/Web build 通过。

## V3.4 提交、审核与返修

提交绑定 Task、Workflow 当前完成执行版本、团队和企业；仅负责人可选择成果。Task 在一次事务内经过 submitted 进入 reviewing，提交主体、成果引用和轮次不可覆盖。Owner/Admin 审核最新提交，驳回需填写理由，审核与 Task 更新使用条件写和事务，旧轮次不可再审核。

返修基于被提交 WorkVersion 的 Workflow/Revision 和服务端审核意见创建新优化 Revision。启动失败且尚未产生新 Revision 时恢复 rejected，允许重试；已创建 Revision 的后续执行失败通过原工作台恢复。任务关联作品禁止删除，保留不可变成果和提交历史。

真实 Mongo/Redis/Garage S3 + Demo 验证 round1 驳回→新 Revision/WorkVersion→round2 通过，返修失败补偿、越权、历史读取与删除保护。API Task/Works 30 项测试、React 六项测试、API/Web lint/build 通过。
