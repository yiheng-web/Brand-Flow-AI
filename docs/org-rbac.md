# V2.1 组织域与统一 RBAC

## 领域模型

- Enterprise：现有企业 collection，包含名称、Logo、状态。
- Team：现有团队 collection，`enterpriseId` 必填，团队不能独立于企业存在。
- EnterpriseMembership：User.memberships 中没有 `teamId` 的条目；企业角色以此为准。
- TeamMembership：User.memberships 中包含 `teamId` 的条目；权限必须同时匹配团队及其真实企业。
- SpaceRef：contracts 中的 personal（ownerId）、team（enterpriseId + teamId）、enterprise（enterpriseId）联合类型。

V2.1 使用嵌入式成员存储；V2.2 新增 Invitation collection，并修正组织 ObjectId Schema，升级迁移见 [组织生命周期](org-lifecycle.md)。历史仅有团队 membership 的用户，
企业权限按 VIEWER 解释，不能把团队管理员角色当成企业管理员。

## 权限矩阵

个人空间只允许本人访问，有效角色始终为 OWNER；任意企业角色均不能访问他人的个人资源。
团队及企业空间使用以下矩阵：

| 有效角色 | 读取 | 工作流创作/作品写入 | 成员管理 | 知识库管理 | 素材管理 | 任务分配接口 |
| -------- | ---- | ------------------- | -------- | ---------- | -------- | ------------ |
| OWNER    | 是   | 是                  | 是       | 是         | 是       | 是           |
| ADMIN    | 是   | 是                  | 是       | 是         | 是       | 是           |
| MEMBER   | 是   | 是                  | 否       | 否         | 否       | 否           |
| VIEWER   | 是   | 否                  | 否       | 否         | 否       | 否           |

企业 OWNER/ADMIN 可穿透本企业团队的读取与管理权限；企业 MEMBER/VIEWER 必须有显式团队
membership 才能访问团队。企业 VIEWER 即使持有历史团队 ADMIN/OWNER 角色，也只能读取。
任何角色都不能穿透其他企业。个人空间不允许成员邀请或任务分配。

创建企业时初始化首位 OWNER；创建团队时记录创建者的团队 ADMIN 角色。邀请路径对所有操作者
拒绝授予 OWNER，包括 OWNER 本人；所有权变更只能由 OWNER 通过专门转移路径处理；V2.2 已开放企业 OWNER 转移入口。任务分配仅提供 Policy 方法，具体任务接口属于后续阶段。

## 服务端边界

AuthorizationService 导出资源与组织生命周期权限断言。Org、Assets、Workflow、Knowledge、Works 均复用
该 Policy；JWT 中的角色和前端按钮不作为服务端授权依据。

- Workflow 详情、版本、下载、SSE 为读取；创建、启动、确认、修改、重跑、取消、重试必须有写权限。
- Knowledge 创建及全部知识项写操作必须有管理权限，创建者身份不能绕过角色降级。
- Assets 创建、上传、删除、沉淀知识库必须有素材管理权限；V2.4 将企业内 public 统一迁移为 enterprise。
- ownerId 只指定目标；团队所属企业从 DB 解析并与登录企业上下文比较，企业 ownerId 必须指向企业。
- 素材只允许 user/private、team/team、enterprise/enterprise 组合；团队读取本团队和所属企业素材。
- Works 个人仅本人，组织成员按当前角色共享浏览；创建者或空间 OWNER/ADMIN 可编辑，Viewer 仅浏览/导出。版本继承作品空间并校验同空间 Workflow 来源。

## 契约与客户端

`GET /org/spaces` 在原字段上增加 `permissions`，由后端 Policy 计算；包括 `read/write`、
`manageMembers/manageKnowledge/manageAssets/manageWorks/assignTasks/manageOrganization/transferOwnership`。角色仍使用小写既有值。
Web 空间 Store 保留此结果，组织、素材、知识库、作品和工作流写入口按相应权限禁用。
缺少权限结果时默认禁用写入口；服务端仍会重新检查 DB 成员关系。

## 验证边界

`authorization.service.spec.ts` 覆盖四角色与三种空间的权限矩阵，并使用真实 Policy 对接 Org、
Assets、Workflow、Knowledge Service 做隔离数据库集成测试，复测四类历史漏洞与归属/可见性伪造。
Web 知识库测试验证 VIEWER 的写按钮禁用、读取按钮保留。

本阶段验证不调用付费模型，也不操作真实用户数据；Mongo/Redis/对象存储及浏览器全流程验收需在
专用环境运行。本阶段没有新增或修改依赖。

## 01 执行结果（2026-10-05）

使用本机已有 Node.js 24.19.0 与 pnpm 10.29.3 运行，未安装或升级依赖。

| 命令                                             | 实际结果                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------- |
| `pnpm --filter @brand-flow/contracts test`       | build 与 12 项测试通过                                                           |
| `pnpm --filter @brand-flow/api test --runInBand` | 15 个测试文件、114 项测试通过，含权限矩阵、Service 集成与既有 Nest HTTP 安全测试 |
| `pnpm --filter @brand-flow/api lint`             | 通过                                                                             |
| `pnpm --filter @brand-flow/api build`            | 通过                                                                             |
| `pnpm --filter @brand-flow/web test`             | 16 个 Vitest 文件、38 项测试及 1 项 Node SSE 测试通过                            |
| `pnpm lint`                                      | 四包全部通过                                                                     |
| `pnpm build`                                     | 四包全部通过；Web 仍有大于 500 kB 的分包体积提示                                 |
| `git diff --check`                               | 通过                                                                             |

未启动专用 Mongo/Redis/MinIO 业务环境，未执行真实持久化及浏览器 E2E；自动测试使用模型替身，
不等同于真实数据库验收。后续可使用 `apps/api/rest-client/org-rbac.http` 的专用账号示例做真实
接口冒烟，并检查 OWNER/ADMIN、MEMBER、VIEWER 三类账号的空间切换及按钮状态。
本阶段仅修改授权及其相关契约、界面、测试和文档；不改变后续共享资源及任务分配的业务范围。
