# Brand-Flow AI - 接口规范

> V1 当前契约以 Swagger 与 `@brand-flow/contracts` 为准。工作流固定为
> `brief → brandConstraint → creativeDirection → prompt → generate → compose → finalEvaluation`。
> Workflow 状态为 `pending/running/awaiting_user/completed/failed`，节点另保留
> `queued/skipped/stale` 等执行语义。本文后部残留的旧六节点示例仅用于历史兼容，不应作为新代码依据。

## V2.1 组织权限契约

`GET /org/spaces` 保持原有空间字段，并增加后端计算的 `permissions` 对象：
`read`、`write`、`manageMembers`、`manageKnowledge`、`manageAssets`、`manageWorks`、`assignTasks`、`manageOrganization`、`transferOwnership`。
企业 OWNER/ADMIN 可管理本企业团队；其他角色必须有显式团队成员关系。VIEWER 只读。
所有邀请均禁止授予 OWNER，返回 403；团队邀请支持未注册邮箱，接受时补齐最低必要的企业 MEMBER/VIEWER 关系。
素材可见性统一为 private/team/enterprise，ownerType 与 visibility 必须匹配；旧 public 企业素材部署前迁移为 enterprise。
完整模型与矩阵见 [组织 RBAC](../../docs/org-rbac.md)，拒绝测试示例见
[org-rbac.http](rest-client/org-rbac.http)。前端权限结果仅用于界面，后端每次以 DB 关系重新授权。

## V2.4 共享素材与作品

- `GET /assets?spaceId=personal|团队ID|企业ID`：个人仅本人；团队包含本团队和所属企业；企业仅本企业。响应增加 `canManage`，团队管理员不自动获得企业素材管理权。旧 `public` 不再接受。
- 组织素材创建/上传/删除仍按 `manageAssets`（OWNER/ADMIN）；成员可读取及用于本空间工作流，Viewer 不可创建工作流或修改资源。
- `POST /assets/:id/save-to-knowledge` 仅允许同一空间，避免将个人或团队素材地址泄露给更大组织范围。
- 对象签名先验证资源权限和对象路径；Workflow/Revision 刷新参考图片时重新按当前空间查素材，并保留已分析的视觉约束。
- 迁移、权限矩阵与集成验收见 [组织共享资源](../../docs/collab-resources.md)。

## V1 闭环新增接口

- `POST /workflow/:id/start`：确认是否图文分离并启动已创建的待运行工作流。
- `POST /workflow/:id/brief/confirm`：确认 Brief，并从品牌约束节点继续。
- `PUT /workflow/:id/brief`：修改并确认 Brief。
- `POST /workflow/:id/brief/regenerate`：重新生成 Brief，并再次等待用户确认。
- `POST /workflow/:id/optimize`：提交快捷分类与自然语言反馈，修订 Prompt 并生成新一轮四候选。
- `GET /workflow/:id/revisions`：查询 Prompt 修订与候选迭代历史。
- `POST /workflow/:id/result/download`：获取当前可信结果的十分钟下载地址。
- `POST /works/:id/versions/from-workflow`：从已完成且质检通过的可信 Workflow 创建作品版本。
- `POST /works/:id/favorite`：设置作品收藏状态。

创建 Workflow 只落库并初始化节点，不会自动调用 AI；工作台必须调用 `/workflow/:id/start` 后才会
入队执行。创建时可附带 `requirements`，包含品牌名称、产品类别、产品描述、目标用户、使用场景、
最多三个视觉风格、色彩偏好和图片比例。Brief 完成后 Workflow 进入
`awaiting_user + confirm_brief`，确认前不会执行下游节点。

## 1. 全局配置

- **Base URL**: `http://localhost:3000/api`
- **实时接口文档**: `http://localhost:3000/api-docs`（由 Swagger/OpenAPI 根据 Controller 和 DTO 自动生成）
- **默认 Header**: `Content-Type: application/json`
- **鉴权**: `Authorization: Bearer <JWT_TOKEN>` (除非标记了 `[无需鉴权]`，否则所有接口均需携带)
- **统一返回格式**: 所有成功响应都会被包装在如下结构中：
  ```typescript
  interface ApiResponse<T = any> {
    success: true // 请求是否成功
    data: T // 核心业务数据
  }
  ```

---

## 2. 公共数据类型

```typescript
type Role = 'owner' | 'admin' | 'member' | 'viewer'
type OwnerType = 'user' | 'team' | 'enterprise'
type Visibility = 'private' | 'team' | 'enterprise'
type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed'

interface UserInfo {
  userId: string // 用户唯一标识 ID
  email: string // 用户登录邮箱
  nickname?: string // 用户昵称（选填）
  enterpriseId?: string // 当前激活的企业 ID（选填）
  role?: Role // 用户在当前企业的角色权限（选填）
}
```

---

## 3. API 路由声明

### 身份鉴权模块 (/auth)

- **`POST /auth/register`** `[无需鉴权]`
  - **Body**:
    ```typescript
    {
      email: string,           // 注册邮箱地址
      password: string,        // 账户密码，长度 >= 6
      nickname?: string        // 用户昵称，长度 <= 20（选填）
    }
    ```
  - **返回 Data**: `UserInfo`

- **`POST /auth/login`** `[无需鉴权]`
  - **Body**:
    ```typescript
    {
      email: string,     // 登录邮箱
      password: string   // 登录密码
    }
    ```
  - **返回 Data**:
    ```typescript
    {
      access_token: string, // JWT 身份凭证
      user: UserInfo       // 登录用户信息
    }
    ```

- **`GET /auth/profile`**
  - **返回 Data**: `UserInfo`

---

### 组织与团队模块 (/org)

所有路由需 JWT。角色和租户从数据库重查，不信任客户端角色或旧 JWT。

| 方法与路径                                    | 入参                                            | 返回 Data / 约束                                                                                                  |
| --------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| POST `/org/enterprise`                        | `{name, logo?}`                                 | Enterprise 文档（`_id/name/logo/status/membershipVersion`）；同事务创建 OWNER；`ORG_MAX_OWNED_ENTERPRISES` 默认 5 |
| GET `/org/enterprises`                        | 无                                              | `{enterpriseId,name,logo?,status,role,permissions}[]`，包括已停用企业                                             |
| GET `/org/enterprise/:id`                     | 企业 ID                                         | 同上单个企业；成员可查看组织资料                                                                                  |
| PUT `/org/enterprise/:id`                     | `{name?,logo?,status?:active\|disabled}`        | 更新后的 Enterprise 文档；OWNER/ADMIN；停用保留资源并阻止业务访问，仍可恢复                                       |
| PUT `/org/enterprise/:id/switch`              | 企业 ID                                         | `{success,currentEnterpriseId,access_token}`；仅活动企业                                                          |
| PUT `/org/enterprise/:id/owner`               | `{targetUserId}`                                | `{success:true}`；仅 OWNER，目标必须为已有企业成员且未超拥有额度；原 OWNER 降为 ADMIN                             |
| POST `/org/team`                              | `{enterpriseId?,name,description?}`             | Team 文档（`_id/enterpriseId/name/description/status`）；缺省企业取 JWT，上述企业仍须数据库授权                   |
| GET `/org/teams`                              | `enterpriseId?`（query）                        | Team 文档与 `role/permissions` 数组；管理者查看全部，其他成员只看所属团队；包含归档团队                           |
| GET `/org/team/:id`                           | 团队 ID                                         | Team 文档与 `role/permissions`；验证真实所属企业                                                                  |
| PUT `/org/team/:id`                           | `{name?,description?,status?:active\|archived}` | 更新后的 Team 文档；团队管理权限；不可变更 enterpriseId                                                           |
| DELETE `/org/team/:id`                        | 团队 ID                                         | 归档后的 Team 文档；软删除，不删除知识库、作品、素材或成员                                                        |
| GET `/org/spaces`                             | 无                                              | 原空间字段与服务端 `permissions`；不返回停用企业/归档团队                                                         |
| GET `/org/spaces/:spaceId/members`            | 空间 ID                                         | `{userId,email,nickname?,avatar?,role}[]`                                                                         |
| PUT `/org/spaces/:spaceId/members/:userId`    | `{role:admin\|member\|viewer}`                  | `{success:true}`；ADMIN 只能操作普通成员并授予 MEMBER/VIEWER；OWNER 不能经此路径降级                              |
| DELETE `/org/spaces/:spaceId/members/:userId` | 用户 ID                                         | `{success:true}`；移出企业同时移出该企业所有团队；不得移除 OWNER                                                  |
| POST `/org/spaces/:spaceId/leave`             | 无                                              | `{success:true}`；只能退出本人；OWNER 必须先转移所有权                                                            |
| POST `/org/spaces/:spaceId/invitations`       | `{email,role?:admin\|member\|viewer}`           | `{invitation:InvitationData,inviteCode}`；不直接加入；仅 OWNER 可授予 ADMIN                                       |
| GET `/org/invitations`                        | `direction=received\|sent`，默认 received       | `InvitationData[]`；只查看本人邮箱收到/本人发出的邀请                                                             |
| POST `/org/invitations/:id/accept`            | `{inviteCode?}`                                 | `InvitationData`；邮箱匹配且邀请人仍有授权；事务保存成员与 accepted 状态                                          |
| POST `/org/invitations/:id/reject`            | `{inviteCode?}`                                 | `InvitationData`；邮箱匹配；拒绝不加成员                                                                          |
| POST `/org/invitations/:id/cancel`            | 无                                              | `InvitationData`；本人发出的 pending 邀请且仍有管理权限                                                           |

`InvitationData`：`id/spaceId/spaceName/enterpriseId/teamId?/inviterId/inviteeEmail/targetRole/status/expiresAt/canRespond/canCancel`。
`status` 使用 contracts 的 `pending/accepted/rejected/expired/cancelled`；有效期 7 天，过期在读取和处理时持久化，保留历史。
邀请只通过站内邀请中心送达，不发送邮件；已登录账号按邮箱验证即可处理，邀请码为可选附加校验，仅创建响应提供原文，数据库只存 SHA-256 哈希。
同空间/邮箱的 pending 邀请唯一；重复创建 409；重复接受相同终态幂等，不会在退出后重新加入，也不覆盖后来调整的角色。
邀请过期/撤销/已处理返回 409；操作无权限 403；其他账号的邀请 404；DTO/目标成员不合法 400。
退出企业后旧 JWT 清除失效企业上下文，账号仍可使用个人空间；停用账号仍返回 401。

部署需要 Mongo 副本集与旧组织 ID 迁移，详见 [组织生命周期与升级](../../docs/org-lifecycle.md)。

---

### 素材与资产模块 (/assets)

- **`POST /assets`**
  - **Body**:
    ```typescript
    {
      name: string,                     // 资产名称
      type: string,                     // 资产类型标识（如 image, template 等）
      url: string,                      // 资产对应的真实存储地址
      ownerId: string,                  // 资产归属方的 ID
      ownerType: OwnerType,             // 资产的归属类型
      visibility: Visibility,           // 资产的可见性级别
      metadata?: Record<string, any>    // 资产的扩展属性（选填）
    }
    ```

- **`GET /assets`**
  - **返回 Data**: `Array<Asset>` // 资产对象数组

- **`DELETE /assets/:id`**
  - **路径参数**: `id` (要删除的资产 ID)

- **`POST /assets/:id/save-to-knowledge`**
  - **说明**: 将指定素材沉淀为知识库知识项，并同步写入向量库。
  - **路径参数**: `id` (素材 ID)
  - **Body**:
    ```typescript
    {
      knowledgeId: string,  // 目标知识库 ID
      description?: string  // 覆盖素材原描述的补充说明
    }
    ```
  - **返回 Data**:
    ```typescript
    {
      success: boolean,
      assetId: string,
      knowledgeId: string,
      item: KnowledgeItem,
      ingest: {
        message: string,
        chunks: number
      }
    }
    ```

---

### 智能图文工作流模块 (/workflow)

- **`POST /workflow/create`**
  - **说明**: 创建待运行工作流和初始节点，返回状态为 `pending`，不会触发 AI 执行。
  - **权限拦截**: 所有接口使用验证后的 JWT 身份；个人任务校验创建者，团队或企业任务校验真实空间成员关系。无权访问的资源返回 404，不能由客户端 userId/spaceId 声明归属。
  - **Body**:
    ```typescript
    {
      prompt: string,       // 用户的原始设计意图或提示词
      spaceId: string,      // 当前工作流关联的前端空间或画布 ID
      selectedKnowledgeBaseIds?: string[] // 本次主动选择的知识库 ID，最多 3 个
      references?: { assetId: string; role: 'logo' | 'product' | 'person' | 'style' }[] // 最多 4 个个人上传图片
      generationConfig?: { aspectRatio?: '1:1' | '4:5' | '3:4' | '16:9' | '9:16'; width?: number; height?: number; seed?: number }
    }
    ```
  - **返回 Data**:
    ```typescript
    {
      id: string,               // 创建的工作流实例 ID
      status: WorkflowStatus,   // 初始状态（pending）
      prompt: string,           // 记录的原始提示词
      spaceId: string,          // 记录的空间 ID
      references: ResolvedWorkflowReference[], // 服务端校验的素材来源、用途、对象键及读取地址
      generationConfig?: PromptPlan['generationConfig'],
      runVersion: number,       // 执行版本，初始为 0
      eventSequence: number,    // 快照序号，初始为 0
      currentNode?: WorkflowNodeType,
      progress: number,         // 0–100
      createdAt: string,        // 创建时间
      updatedAt: string         // 更新时间
    }
    ```

- **`POST /workflow/:id/candidates/:candidateId/download`**
  - **说明**：下载当前轮的指定候选，不要求已选择最终候选。返回 `{ downloadUrl, fileName, expiresIn: 600 }`。
  - **权限**：验证工作流归属、当前候选 ID 与服务端对象键；旧轮、非本人候选返回 404。
  - 最终作品使用 `POST /works/:id/export`，候选下载不能代替正式作品导出。

- **参考图与参数规则**
  - 仅接受 `assetId + role`，创建、执行及签名时均校验素材与 Workflow 空间的真实归属；个人使用本人私有素材，团队使用本团队及所属企业素材，企业仅使用本企业素材。个人图片须先上传到组织空间，不自动共享，不接受外链或客户端对象键。
  - 产品、人物及风格图通过视觉模型提取结构化特征进入 Brief/Prompt；Logo 保留原图合成来源，底图不模仿 Logo。
  - 详情快照返回 references；执行特征保存在 `result.references.visualConstraints`，不持久化图片 Base64。
  - Kolors：1:1→1024×1024，16:9→1280×720；Qwen-Image：1:1→1328×1328，16:9→1664×928。其他支持范围见 `docs/create-v1.md`；不支持的模型、尺寸或比例明确拒绝。
  - 四候选分别请求 Provider，记录实际 model/seed/prompt/config。对象键包含执行版本与候选 ID；优化保留原画面参数。

- **`POST /workflow/:id/start`**
  - **说明**: 工作台确认图文分离设置后启动 `pending` 工作流。重复调用不会重复创建任务。
  - **Body**:
    ```typescript
    {
      needsComposition: boolean // true 使用图文分离与排版；false 直接使用候选图
    }
    ```
  - **返回 Data**: `WorkflowResponse`，首次启动时状态为 `running`。

- **`GET /workflow/:id`**
  - **说明**: 获取工作流详情及内部七节点执行数据；前端合并质检，仅展示六个业务节点。
  - **路径参数**: `id` (目标工作流的实例 ID)
  - **返回 Data**:
    ```typescript
    {
      workflow: WorkflowResponse,
      nodes: Array<WorkflowNode> // 按顺序返回内部执行节点状态与产物
    }
    ```

- **`GET /workflows`**
  - JWT 鉴权；仅返回当前用户在指定空间的任务，按 updatedAt、ID 倒序分页。
  - 查询参数：spaceId（默认 personal）、status（可选）、page（默认 1）、limit（默认 20，最多 100）。
  - 返回：`{ items: WorkflowResponse[], total, page, limit }`。
  - WorkflowResponse 新增 runVersion、eventSequence、currentNode、progress（0–100），保留 awaitingAction、updatedAt、错误与结果。
  - 状态：pending、running、awaiting_user、failed、completed、cancelled。

- **`GET /workflows/:id`**
  - 返回 `{ workflow: WorkflowResponse, nodes: WorkflowNode[] }`，用于刷新或跨设备恢复。
  - 原 `/workflow/:id` 保留；单数与复数路由共享同一鉴权与实现。

- **`POST /workflows/:id/cancel`**
  - 取消待启动、运行中、等待用户或失败任务，增加 runVersion，旧 Worker 不再允许写回。
  - 重复取消幂等；已完成任务不能取消；已取消任务不能重试。返回 WorkflowResponse。

- **`POST /workflows/:id/retry`**
  - 从失败任务的 currentNode 重试；旧记录没有 currentNode 时从 brief 重试。
  - 运行中任务重复请求不重复入队。返回 `{ success, message }`。

- **`PUT /workflow/:id/nodes/:nodeType`**
  - 只允许在对应等待选择状态下选择已有创意方向或通过质检的候选底图。
  - creativeDirection Body：`{ selectedDirectionId: string }`。
  - generate Body：`{ selectedCandidateId: string }`。
  - 服务端保留方向、候选、评分和质检结果，客户端不能提交任意 output、status 或 finalEvaluation。
  - 选择会增加运行版本并使下游节点失效，不自动执行后续节点；返回更新后的节点。

- **`POST /workflow/:id/nodes/:nodeType/run`**
  - 使用现有上游结果从指定节点重跑，下游置 stale。
  - 同一运行版本连续请求只有一个有效任务；jobId 为 `workflowId-r<runVersion>-nodeType`。
  - 入队失败持久化为 failed，并允许从历史重试。返回 `{ success, message }`。

- **`GET /workflows/:id/stream`**（保留单数 /workflow 别名）
  - Authorization Bearer JWT；资源授权通过后才注册队列监听；响应 text/event-stream，不经过普通响应包装。
  - `workflow_snapshot`：`{ type, workflowId, sequence, snapshot: { workflow, nodes }, timestamp }`；SSE id 等于 sequence。
  - `heartbeat`：`{ type, workflowId, timestamp }`；间隔 2 秒，同时读库补偿通知丢失。
  - 订阅监听建立后重新读取数据库快照，避免 GET 与订阅之间的空隙。队列 progress 仅触发刷新，不直接成为客户端状态。
  - 客户端先 GET 恢复，再带 Last-Event-ID 游标订阅；按 sequence 去重。服务端发送最新快照，不回放全部模型增量。
  - EOF 或 30 秒没有数据时自动重连，重连前 GET；认证失效、主动关闭与终态会清理连接和计时器。

---

### 知识库与向量检索模块 (/knowledge)

- 团队列表包含同企业知识、当前团队知识和自己的个人知识，不包含其他团队或其他用户的个人知识。
- 企业/团队库的 `isRequired` 在创建工作流时自动加载，不占最多 3 个主动选择名额；个人工作流不继承组织知识。
- 明确规则采用正文标签：`品牌色: #00A862`、`Logo禁用: 拉伸`、`Logo使用: 拉伸`、`必用文案: 品牌名`、`禁用文案: 最低价`。每行或中文/英文分号分隔规则。
- 显式禁用项和必用文案兼容映射为 `required`；企业强制约束不能被团队/个人覆盖，团队强制约束不能被个人覆盖。推荐/可选规则按个人 > 团队 > 企业优先；含多个规则或未识别正文的条目完整保留。
- 新增、编辑、导入遇明确冲突返回 409，包含来源标题和冲突键；无法自动判断的自然语言需人工确认。单项写入传 `metadata.inheritanceConfirmed: true`，导入传 `confirmInheritance: true`；编辑正文需重新确认，确认不能绕过明确冲突。
- 组织规则写入复用企业事务锁并在事务内重新授权，部署要求 Mongo 副本集。Mongo 提交后再同步向量，失败可重试。
- Workflow 在合并阶段再次检测冲突；全部强制规则保留，推荐/可选合并后各最多 30 条。`BrandConstraintPackage.sources` 增加可选的 `spaceType/spaceId`，约束条目增加 `sourceSpaceType/sourceSpaceId` 以追溯来源；可选 `warnings` 保留自然语言的人工核对提示。

知识库接口支持个人、团队和企业 Space。`GET /knowledge` 通过查询参数 `spaceId`
指定空间，默认值为 `personal`；个人空间按当前登录用户隔离，不要求用户加入企业。
其他详情和写接口根据知识库自身的 Space 归属执行服务端权限校验。

- **`POST /knowledge`**
  - **说明**: 在当前用户可访问的 Space 创建知识库。
  - **Body**:
    ```typescript
    {
      spaceId: string,       // personal、团队 ID 或企业 ID
      name: string,          // 知识库名称
      description?: string,  // 知识库描述
      isRequired?: boolean   // 企业/团队必选，仅对应空间 OWNER/ADMIN 可设置
    }
    ```

- **`GET /knowledge`**
  - **说明**: 获取当前 Space 下的知识库列表。
  - **查询参数**: `spaceId`（可选，默认 `personal`）
  - **返回 Data**:
    ```typescript
    Array<{
      _id: string
      name: string
      description?: string
      spaceId: string
      spaceType: 'personal' | 'team' | 'enterprise'
      enterpriseId?: string
      isRequired: boolean
    }>
    ```

- **`GET /knowledge/:id`**
  - **说明**: 获取特定知识库的详情。
  - **路径参数**: `id` (知识库 ID)

- **`PUT /knowledge/:id`**
  - **说明**: 更新特定知识库的基础信息。
  - **路径参数**: `id` (知识库 ID)
  - **Body**:
    ```typescript
    {
      name?: string,
      description?: string,
      isRequired?: boolean // 企业/团队必选标记
    }
    ```

- **`DELETE /knowledge/:id`**
  - **说明**: 向量模式开启时先清理 Pinecone namespace，再删除 MongoDB 知识库与知识项；向量清理失败保留 Mongo 数据。
  - **路径参数**: `id` (要删除的知识库 ID)

- **`POST /knowledge/:id/ingest`**
  - **说明**: 每个非空行解析为 Mongo 知识项（最多 200 条、总文本 100000 字符、单条 5000 字符）；可用 [required]/[recommended]/[optional] 标记级别，默认 recommended。同一文本重复提交幂等。向量同步可关闭，Mongo 仍可用于 Workflow。
  - **路径参数**: `id` (目标知识库 ID)
  - **Body**:
    ```typescript
    {
      content: string // 需要入库的长文本内容
    }
    ```
  - **返回 Data**:
    ```typescript
    {
      success: boolean,
      imported: number, // Mongo 导入数量
      chunks: number,   // 向量切片数量
      vectorized: boolean,
      failed: boolean, // 向量部分失败，不代表 Mongo 未保存
      message: string
    }
    ```

- **`POST /knowledge/:id/import/preview`**
  - Body：`{ content: string }`，规则解析规则同 ingest。仅预览，不落库。
  - 返回：`{ batchId: string, items: Array<{ title: string, content: string, constraintLevel: 'required' | 'recommended' | 'optional' }> }`。
- **`POST /knowledge/:id/import`**
  - Body：预览结果 `{ batchId, items, confirmInheritance?: boolean }`；可在确认前修改条目。标题 1~80 字符，正文 1~5000 字符，总正文最多 100000 字符。
  - 同知识库、同批次、同序号唯一；失败重试保持 batchId 和条目不变。已写入条目被改动时返回 409，请重新解析生成新批次。
  - 返回同 ingest。关闭向量时 message 为“已导入到知识库，语义向量未启用”。向量失败不阻止 Mongo 创作，支持条目重试。
- **`POST /knowledge/:id/items/:itemId/vector-sync`**
  - 无 Body；重试向量同步，不创建新 Mongo 条目。返回 `{ success, chunks, vectorized, failed, message }`。

- **`POST /knowledge/:id/items`**
  - **说明**: 在指定知识库下创建结构化知识项，按配置同步向量；失败时保留 Mongo，metadata.vectorSync 标识重试状态。
  - **路径参数**: `id` (知识库 ID)
  - **Body**:
    ```typescript
    {
      title: string,
      content: string,
      tags?: string[],
      constraintLevel?: 'required' | 'recommended' | 'optional',
      metadata?: Record<string, unknown>
    }
    ```
  - **返回 Data**:
    ```typescript
    {
      item: KnowledgeItem,
      ingest: {
        message: string,
        chunks: number
      }
    }
    ```

- **`GET /knowledge/:id/items`**
  - **说明**: 获取指定知识库下的知识项列表。
  - **路径参数**: `id` (知识库 ID)
  - **返回 Data**: `Array<KnowledgeItem>`

- **`GET /knowledge/:id/items/:itemId`**
  - **说明**: 获取指定知识项详情。
  - **路径参数**:
    - `id`: 知识库 ID
    - `itemId`: 知识项 ID
  - **返回 Data**: `KnowledgeItem`

- **`PUT /knowledge/:id/items/:itemId`**
  - **说明**: 更新知识项并移除旧向量；active 按配置重新同步，archived 不参与 Workflow，也不保留向量。
  - **路径参数**:
    - `id`: 知识库 ID
    - `itemId`: 知识项 ID
  - **Body**:
    ```typescript
    {
      title?: string,
      content?: string,
      tags?: string[],
      status?: 'active' | 'archived',
      metadata?: Record<string, any>
    }
    ```
  - **返回 Data**: `KnowledgeItem`

- **`DELETE /knowledge/:id/items/:itemId`**
  - **说明**: 向量模式开启时先移除条目向量，再删除 Mongo 记录；清理失败保留条目。
  - **路径参数**:
    - `id`: 知识库 ID
    - `itemId`: 知识项 ID
  - **返回 Data**: `{ success: boolean }`

- **`GET /knowledge/:id/records`**
  - **说明**: （高级诊断接口）从底层的 Pinecone 向量数据库中，利用 `listPaginated` 暴力遍历并拉取当前知识库名下的所有向量切片明细。
  - **路径参数**: `id` (目标知识库 ID)
  - **返回 Data**:
    ```typescript
    Array<{
      id: string // Pinecone 中存储的 Vector Chunk ID
      text: string // 该向量对应的明文切片
      metadata: any // 元数据信息（包含 enterpriseId, knowledgeId 等）
    }>
    ```

---

### 作品与导出模块 (/works)

- **`POST /works`**
  - **说明**: 将当前空间已完成且质检通过的工作流结果保存为同空间作品；个人私有，组织共享。首次创建 V1；同一 Workflow 后续成片仅创建者或管理员可追加版本，相同来源重复提交幂等，其他成员重复保存只返回已有作品。
  - **Body**:
    ```typescript
    {
      title: string,
      spaceId: string,
      description?: string,
      finalImageUrl: string,
      objectKey?: string,
      workflowId: string,
      qualityReport?: Record<string, any>,
      nodesSnapshot?: Record<string, any>,
      metadata?: Record<string, any>
    }
    ```
  - **返回 Data**: `Work & { versions: WorkVersion[] }`

- **`GET /works`**
  - **说明**: 个人空间只返回本人作品，组织空间返回有权限浏览的共享作品；列表填充 creatorId（含 email/profile），返回当前请求者的 canEdit。
  - **查询参数**: `spaceId`（默认 personal，其他值为团队/企业 ID）
  - **返回 Data**: `Array<Work & { canEdit: boolean }>`。Work 持久化真实 `spaceType/spaceId/enterpriseId/creatorId`，组织 ownerType/visibility 与空间一致；WorkVersion 继承同一 scope。

- **`GET /works/:id`**
  - **说明**: 获取作品详情和全部版本。
  - **路径参数**: `id` (作品 ID)
  - **返回 Data**: `Work & { versions: WorkVersion[] }`

- **`DELETE /works/:id`**
  - **说明**: 创建者或空间 OWNER/ADMIN 可删除作品及版本记录，Member 不可删除他人作品，Viewer 只读。
  - **路径参数**: `id` (作品 ID)
  - **返回 Data**: `{ success: boolean }`

- **`POST /works/:id/versions`** / **`POST /works/:id/versions/from-workflow`**
  - **说明**: 两个入口仅允许作品创建者或空间 OWNER/ADMIN，从同一空间已完成且质检通过的工作流创建版本；VIEWER 仅浏览/导出。旧客户端提交 imageUrl/objectKey/qualityReport 不再有效。
  - **Body**: `{ workflowId: string }`
  - **返回 Data**: `WorkVersion`
  - 作品签名、导出与删除只处理该作品的服务端对象路径；历史污染记录会被拒绝，须人工核查后修复。
  - 版本号由 Work.versionCounter 原子分配，当前成片指针仅向更高版本推进；失败或并发重复保存可能留下号码间隔，不会重复号码。
  - 新版本保存 `sourceObjectKey`、`sourceRunVersion`、`sourceRevisionId`、`promptPlan`、`feedback`、`qualityReport` 与 `createdAt`，均从可信服务端工作流获取。来源去重使用 workId/sourceWorkflowId/sourceObjectKey 唯一索引。

- **`GET /works/:id/versions`**
  - **说明**: 获取作品版本列表。
  - **路径参数**: `id` (作品 ID)
  - **返回 Data**: `Array<WorkVersion>`

- **`GET /works/:id/versions/:versionId`**
  - **说明**: 获取单个作品版本详情。
  - **路径参数**:
    - `id`: 作品 ID
    - `versionId`: 版本 ID
  - **返回 Data**: `WorkVersion`

- **`POST /works/:id/export`**
  - **说明**: 导出作品当前成片。暂仅支持 PNG；记录导出日志并返回下载地址。
  - **返回 Data**: `{ workId, exportLogId, format: 'png', fileName, downloadUrl }`
  - **路径参数**: `id` (作品 ID)
  - **Body**:
    ```typescript
    {
      format?: 'png'
    }
    ```

- **`POST /works/:id/versions/:versionId/export`**
  - **说明**: 导出指定历史版本；校验当前用户作品权限、版本所属作品、对象路径和 PNG 文件头，记录含 versionId 的导出日志。
  - **Body**: `{ format?: 'png' }`
  - **返回 Data**: `{ workId, versionId, exportLogId, format: 'png', fileName, downloadUrl }`
  - 附件名称为 `作品标题-V版本号.png`；作品详情读取时为各版本刷新预览签名。

## V1.5 合成与版本闭环

- 合成上传使用 multipart/form-data，PNG 分辨率必须与底图一致；图层数据必须匹配服务端艺术字候选和放置方案。
- `compose_logo` 原图以 `type: 'logo'`、`assetId` 图层接入；服务端重新核对素材权限、来源和区域。仅允许艺术字与已确认 Logo 区域的像素发生变化。
- 每次合成使用独立 runs/runVersion/composition/UUID.png，保留历史来源对象，不覆盖或删除旧 Revision 引用。
- WorkflowResult.revision 记录优化 id/round/feedback；Revision.result 保存本轮候选、合成与质检快照，完成后不再写入。`GET /workflow/:id/revisions` 刷新结果图片短时链接而不改写数据库记录。
- finalEvaluation 未通过时 Workflow 为 awaiting_user；节点执行完毕不等于可交付完成，只有 completed 且质检通过的结果可保存作品。
- 执行与验收说明见 [图文合成与作品版本验收](../../docs/compose-versions-v1.md)。

## V1.1 安全边界

- 登录与每次 JWT 鉴权检查账号存在且 status=active；停用/删除后已有 JWT 的后续请求返回 401。企业身份与角色以当前数据库成员关系为准。
- 当前没有修改密码/会话注销接口；前端退出清空本机会话。后续新增密码修改或服务端注销时，应在 JWT validate 边界增加会话版本校验，不引入 refresh-token 系统。
- personal 资源由 userId/creatorId 决定归属，与当前企业无关；新个人素材不写 enterpriseId，旧个人素材仍按创建者读取。
- POST /assets/upload 每次最多 1 张、10 MiB；仅接受 PNG/JPEG/WebP/GIF，sharp 校验真实格式和解码，像素上限 4000 万。不合法内容返回 400；超过传输大小限制返回 413。
- Workflow 浏览器缓存仅保留 workflowId；账号切换或退出清空 Workflow/User/Flow。旧缓存升级时丢弃，签名 URL、结果和节点输出不持久化。

## V1.6 可用性与健康检查

健康接口位于根路径，**不加 `/api` 前缀**，无需登录：

| 接口                   | 响应                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GET /health/live`     | 200，`data.status = "ok"`，仅检查进程                                                                        |
| `GET /health/ready`    | 200，`data.status = "ready"`，`data.checks` 包含 mongo/redis/bullmq/storage 的 ready 状态                    |
| readiness 任一依赖失败 | 503，`success = false`，`message = "依赖未就绪"`，`data.checks` 对失败依赖标记 unavailable；不返回地址或凭据 |

登录/注册、running 并发和同步重试额度拒绝返回 429，并设置 `Retry-After` 秒数。队列内生图额度拒绝保存为 failed 检查点并通过既有节点失败事件展示；今日额度按 UTC 次日恢复。Provider 有界重试前检查任务版本和取消，不自动重试付费生图。

新增持久化字段：User.runningWorkflowLeases（默认空字符串数组）和 Workflow.executionLease（可选执行令牌）。这些字段由服务端维护，客户端不能分配、续用或清除名额。现有工作流/节点/SSE 状态协议保持不变。

配置、部署与验收见 [V1 部署文档](../../docs/v1-deployment.md)，请求示例见 [health.http](rest-client/health.http)。
