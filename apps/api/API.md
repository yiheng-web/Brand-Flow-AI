# Brand-Flow AI - 接口规范

> V1 当前契约以 Swagger 与 `@brand-flow/contracts` 为准。工作流固定为
> `brief → brandConstraint → creativeDirection → prompt → generate → compose → finalEvaluation`。
> Workflow 状态为 `pending/running/awaiting_user/completed/failed`，节点另保留
> `queued/skipped/stale` 等执行语义。本文后部残留的旧六节点示例仅用于历史兼容，不应作为新代码依据。

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
type Visibility = 'private' | 'team' | 'enterprise' | 'public'
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

- **`POST /org/enterprise`**
  - **Body**:
    ```typescript
    {
      name: string,     // 企业名称，长度 <= 50
      logo?: string     // 企业 Logo 图片的 URL（选填）
    }
    ```

- **`GET /org/enterprises`**
  - **返回 Data**:
    ```typescript
    Array<{
      id: string // 企业唯一 ID
      name: string // 企业名称
      logo?: string // 企业 Logo URL（选填）
    }>
    ```

- **`PUT /org/enterprise/:id/switch`**
  - **路径参数**: `id` (需要切换到的目标企业 ID)
  - **返回 Data**: `{ success: boolean }` // 切换成功标识

- **`POST /org/team`** `[需 OWNER 或 ADMIN 角色]`
  - **Body**:
    ```typescript
    {
      name: string,           // 团队名称，长度 <= 50
      description?: string    // 团队描述信息，长度 <= 200（选填）
    }
    ```

- **`GET /org/teams`**
  - **返回 Data**:
    ```typescript
    Array<{
      id: string // 团队唯一 ID
      name: string // 团队名称
      description?: string // 团队描述信息（选填）
    }>
    ```

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
  - **权限拦截**: 该模块下所有接口（包括查询和更新）将严格校验企业边界（`entId`）与空间归属（`spaceId === 'personal'` 时严格校验 `userId`），越权访问将返回 `403 Forbidden`。
  - **Body**:
    ```typescript
    {
      prompt: string,       // 用户的原始设计意图或提示词
      spaceId: string,      // 当前工作流关联的前端空间或画布 ID
      selectedKnowledgeBaseIds?: string[] // 本次主动选择的知识库 ID，最多 3 个
    }
    ```
  - **返回 Data**:
    ```typescript
    {
      id: string,               // 创建的工作流实例 ID
      status: WorkflowStatus,   // 初始状态（pending）
      prompt: string,           // 记录的原始提示词
      spaceId: string,          // 记录的空间 ID
      userId: string,           // [新增] 创建者用户 ID
      entId?: string,           // [新增] 关联的企业 ID（如果是团队空间）
      createdAt: string,        // 创建时间
      updatedAt: string         // 更新时间
    }
    ```

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

- **`PUT /workflow/:id/nodes/:nodeType`**
  - **说明**: 用户手动修改某节点（如 Prompt 生成节点）的中间产物。该操作仅更新当前节点的数据记录，并将下游相关节点全部置为失效 (`stale`) 以清空旧产物，且**不会自动触发后续流程**。
  - **路径参数**:
    - `id`: 工作流 ID
    - `nodeType`: `intentNode` | `knowledgeNode` | `promptNode` | `generateNode` | `evaluateNode` | `finishNode`
  - **Body**: `Record<string, any>` (更新的具体节点 output)
  - **返回 Data**: 更新后的节点数据。

- **`POST /workflow/:id/nodes/:nodeType/run`**
  - **说明**: 指定某一节点重新执行。系统会自动计算并**跳过**该节点之前的所有已完成节点，将它们作为上下文状态喂给大模型，从指定的 `nodeType` 处实现断点接力重跑，并顺延执行后续所有节点。
  - **路径参数**:
    - `id`: 工作流 ID
    - `nodeType`: 节点类型标识
  - **返回 Data**: `{ success: boolean, message: string }`

- **`GET /workflow/:id/stream`**
  - **说明**: （核心推荐）基于 Server-Sent Events (SSE) 的流式接口，用于实时监听大模型各节点的执行状态与结果。
  - **路径参数**: `id` (目标工作流的实例 ID)
  - **鉴权方式**: 通过 `Authorization: Bearer <JWT_TOKEN>` 请求头（若前端无法直接设置，请使用 fetch-event-source）
  - **返回格式**: `text/event-stream` (流式输出，注：该接口已在全局拦截器中配置放行，不会被包裹在 `ApiResponse` 结构中)
  - **事件返回包格式 (JSON)**:
    - **`connected`** 事件 (SSE 成功连接):
      ```typescript
      { type: 'connected', workflowId: string }
      ```
    - **`node_started`** 事件 (预留：单个节点开始执行，暂由前端逻辑自推导):
      ```typescript
      { type: 'node_started', nodeType: string }
      ```
    - **`node_progress`** 事件 (预留：大模型流式生成中的增量输出):
      ```typescript
      { type: 'node_progress', nodeType: string, delta: string }
      ```
    - **`node_completed`** 事件 (单个节点正常执行完毕):
      ```typescript
      { type: 'node_completed', nodeType: string, data: Record<string, any> } // 返回节点的最终产物
      ```
    - **`node_failed`** 事件 (预留：单个节点执行异常中断):
      ```typescript
      { type: 'node_failed', nodeType: string, error: string }
      ```
    - **`node_skipped`** 事件 (触发重跑时，上游已被跳过的节点):
      ```typescript
      { type: 'node_skipped', nodeType: string } // 明确通知前端该节点已跳过，无需更新本地数据
      ```
    - **`workflow_failed`** 事件 (工作流级执行异常中断):
      ```typescript
      { type: 'workflow_failed', error: string }
      ```
    - **`workflow_completed`** 事件 (全流程执行完毕):
      ```typescript
      { type: 'workflow_completed', data: Record<string, any> } // 工作流的最终聚合状态
      ```

---

### 知识库与向量检索模块 (/knowledge)

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
      isRequired?: boolean   // 仅企业空间管理员可设置
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
      description?: string
    }
    ```

- **`DELETE /knowledge/:id`**
  - **说明**: 删除指定的知识库，不仅删除 MongoDB 记录，后续还会同步清空 Pinecone 中对应的底层向量切片数据。
  - **路径参数**: `id` (要删除的知识库 ID)

- **`POST /knowledge/:id/ingest`**
  - **说明**: 将大段品牌规范/忌讳文本粉碎、切片、Embedding，并打上对应的标签存入 Pinecone 的专属 Namespace 中。
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
      chunks: number    // 本次成功切出的向量块数量
    }
    ```

- **`POST /knowledge/:id/items`**
  - **说明**: 在指定知识库下创建一条结构化知识项，并同步写入向量库。
  - **路径参数**: `id` (知识库 ID)
  - **Body**:
    ```typescript
    {
      title: string,
      content: string,
      tags?: string[],
      metadata?: Record<string, any>
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
  - **说明**: 更新指定知识项。若更新 `content`，会同步重新写入向量库。
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
  - **说明**: 删除指定知识项的 MongoDB 记录。
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
  - **说明**: 将本人已完成且质检通过的工作流结果保存为私有作品，并自动创建第 1 个作品版本。
  - **Body**:
    ```typescript
    {
      title: string,
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
  - **说明**: 获取当前用户在指定 Space 中创建的私有作品列表。
  - **返回 Data**: `Array<Work>`

- **`GET /works/:id`**
  - **说明**: 获取作品详情和全部版本。
  - **路径参数**: `id` (作品 ID)
  - **返回 Data**: `Work & { versions: WorkVersion[] }`

- **`DELETE /works/:id`**
  - **说明**: 删除作品及其版本记录。
  - **路径参数**: `id` (作品 ID)
  - **返回 Data**: `{ success: boolean }`

- **`POST /works/:id/versions`**
  - **说明**: 为作品新增一个版本，并将作品当前展示图更新为该版本。
  - **路径参数**: `id` (作品 ID)
  - **Body**:
    ```typescript
    {
      imageUrl: string,
      objectKey?: string,
      sourceWorkflowId?: string,
      nodesSnapshot?: Record<string, any>,
      qualityReport?: Record<string, any>
    }
    ```
  - **返回 Data**: `WorkVersion`

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
  - **说明**: 导出作品。V1.0 暂仅支持 PNG；接口会记录导出日志并返回下载地址。
  - **路径参数**: `id` (作品 ID)
  - **Body**:
    ```typescript
    {
      format?: 'png'
    }
    ```
  - **返回 Data**:
    ```typescript
    {
      workId: string,
      exportLogId: string,
      format: 'png',
      fileName: string,
      downloadUrl: string
    }
    ```
