# Brand-Flow AI - 接口规范

## 1. 全局配置

*   **Base URL**: `http://localhost:3000/api`
*   **默认 Header**: `Content-Type: application/json`
*   **鉴权**: `Authorization: Bearer <JWT_TOKEN>` (除非标记了 `[无需鉴权]`，否则所有接口均需携带)
*   **统一返回格式**: 所有成功响应都会被包装在如下结构中：
    ```typescript
    interface ApiResponse<T = any> {
      success: true; // 请求是否成功
      data: T;       // 核心业务数据
    }
    ```

---

## 2. 公共数据类型

```typescript
type Role = 'owner' | 'admin' | 'member' | 'viewer';
type OwnerType = 'user' | 'team' | 'enterprise';
type Visibility = 'private' | 'team' | 'enterprise' | 'public';
type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed';

interface UserInfo {
  userId: string;        // 用户唯一标识 ID
  email: string;         // 用户登录邮箱
  nickname?: string;     // 用户昵称（选填）
  enterpriseId?: string; // 当前激活的企业 ID（选填）
  role?: Role;           // 用户在当前企业的角色权限（选填）
}
```

---

## 3. API 路由声明

### 身份鉴权模块 (/auth)

*   **`POST /auth/register`** `[无需鉴权]`
    *   **Body**: 
        ```typescript
        { 
          email: string,           // 注册邮箱地址
          password: string,        // 账户密码，长度 >= 6
          nickname?: string        // 用户昵称，长度 <= 20（选填）
        }
        ```
    *   **返回 Data**: `UserInfo`

*   **`POST /auth/login`** `[无需鉴权]`
    *   **Body**: 
        ```typescript
        { 
          email: string,     // 登录邮箱
          password: string   // 登录密码
        }
        ```
    *   **返回 Data**: 
        ```typescript
        { 
          access_token: string, // JWT 身份凭证
          user: UserInfo       // 登录用户信息
        }
        ```

*   **`GET /auth/profile`**
    *   **返回 Data**: `UserInfo`

---

### 组织与团队模块 (/org)

*   **`POST /org/enterprise`**
    *   **Body**: 
        ```typescript
        { 
          name: string,     // 企业名称，长度 <= 50
          logo?: string     // 企业 Logo 图片的 URL（选填）
        }
        ```

*   **`GET /org/enterprises`**
    *   **返回 Data**: 
        ```typescript
        Array<{ 
          id: string,       // 企业唯一 ID
          name: string,     // 企业名称
          logo?: string     // 企业 Logo URL（选填）
        }>
        ```

*   **`PUT /org/enterprise/:id/switch`**
    *   **路径参数**: `id` (需要切换到的目标企业 ID)
    *   **返回 Data**: `{ success: boolean }` // 切换成功标识

*   **`POST /org/team`** `[需 OWNER 或 ADMIN 角色]`
    *   **Body**: 
        ```typescript
        { 
          name: string,           // 团队名称，长度 <= 50
          description?: string    // 团队描述信息，长度 <= 200（选填）
        }
        ```

*   **`GET /org/teams`**
    *   **返回 Data**: 
        ```typescript
        Array<{ 
          id: string,             // 团队唯一 ID
          name: string,           // 团队名称
          description?: string    // 团队描述信息（选填）
        }>
        ```

---

### 素材与资产模块 (/assets)

*   **`POST /assets`**
    *   **Body**: 
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

*   **`GET /assets`**
    *   **返回 Data**: `Array<Asset>` // 资产对象数组

*   **`DELETE /assets/:id`**
    *   **路径参数**: `id` (要删除的资产 ID)

---

### 智能图文工作流模块 (/workflow)

*   **`POST /workflow/create`**
    *   **说明**: 触发异步 AI 执行，返回状态为 `pending`。
    *   **Body**: 
        ```typescript
        { 
          prompt: string,       // 用户的原始设计意图或提示词
          spaceId: string,      // 当前工作流关联的前端空间或画布 ID
          knowledgeId?: string  // 关联的专属知识库 ID（选填，提供后大模型会基于该知识库生成）
        }
        ```
    *   **返回 Data**: 
        ```typescript
        {
          id: string,               // 创建的工作流实例 ID
          status: WorkflowStatus,   // 初始状态（pending）
          prompt: string,           // 记录的原始提示词
          spaceId: string,          // 记录的空间 ID
          createdAt: string,        // 创建时间
          updatedAt: string         // 更新时间
        }
        ```

*   **`GET /workflow/:id`**
    *   **说明**: 获取工作流的详细信息以及挂载的 6 个节点数据。
    *   **路径参数**: `id` (目标工作流的实例 ID)
    *   **返回 Data**: 
        ```typescript
        {
          workflow: WorkflowResponse,
          nodes: Array<WorkflowNode> // 按时间顺序列出的 6 个真实图文生成节点（intentNode 等）的状态与产物
        }
        ```

*   **`PUT /workflow/:id/nodes/:nodeType`**
    *   **说明**: 用户手动修改某节点（如 Prompt 生成节点）的中间产物。该操作仅更新当前节点的数据记录，并将下游相关节点全部置为失效 (`stale`) 以清空旧产物，且**不会自动触发后续流程**。
    *   **路径参数**: 
        *   `id`: 工作流 ID
        *   `nodeType`: `intentNode` | `knowledgeNode` | `promptNode` | `generateNode` | `evaluateNode` | `finishNode`
    *   **Body**: `Record<string, any>` (更新的具体节点 output)
    *   **返回 Data**: 更新后的节点数据。

*   **`POST /workflow/:id/nodes/:nodeType/run`**
    *   **说明**: 指定某一节点重新执行。系统会自动计算并**跳过**该节点之前的所有已完成节点，将它们作为上下文状态喂给大模型，从指定的 `nodeType` 处实现断点接力重跑，并顺延执行后续所有节点。
    *   **路径参数**: 
        *   `id`: 工作流 ID
        *   `nodeType`: 节点类型标识
    *   **返回 Data**: `{ success: boolean, message: string }`

*   **`GET /workflow/:id/stream`**
    *   **说明**: （核心推荐）基于 Server-Sent Events (SSE) 的流式接口，用于实时监听大模型各节点的执行状态与结果。
    *   **路径参数**: `id` (目标工作流的实例 ID)
    *   **鉴权方式**: 通过 `Authorization: Bearer <JWT_TOKEN>` 请求头（若前端无法直接设置，请使用 fetch-event-source）
    *   **返回格式**: `text/event-stream` (流式输出，注：该接口已在全局拦截器中配置放行，不会被包裹在 `ApiResponse` 结构中)
    *   **事件返回包格式 (JSON)**:
        *   **`connected`** 事件 (SSE 成功连接):
            ```typescript
            { type: 'connected', workflowId: string }
            ```
        *   **`node_started`** 事件 (预留：单个节点开始执行，暂由前端逻辑自推导):
            ```typescript
            { type: 'node_started', nodeType: string }
            ```
        *   **`node_progress`** 事件 (预留：大模型流式生成中的增量输出):
            ```typescript
            { type: 'node_progress', nodeType: string, delta: string }
            ```
        *   **`node_completed`** 事件 (单个节点正常执行完毕):
            ```typescript
            { type: 'node_completed', nodeType: string, data: Record<string, any> } // 返回节点的最终产物
            ```
        *   **`node_failed`** 事件 (预留：单个节点执行异常中断):
            ```typescript
            { type: 'node_failed', nodeType: string, error: string }
            ```
        *   **`node_skipped`** 事件 (触发重跑时，上游已被跳过的节点):
            ```typescript
            { type: 'node_skipped', nodeType: string } // 明确通知前端该节点已跳过，无需更新本地数据
            ```
        *   **`workflow_failed`** 事件 (工作流级执行异常中断):
            ```typescript
            { type: 'workflow_failed', error: string }
            ```
        *   **`workflow_completed`** 事件 (全流程执行完毕):
            ```typescript
            { type: 'workflow_completed', data: Record<string, any> } // 工作流的最终聚合状态
            ```

---

### 知识库与向量检索模块 (/knowledge)

*   **`POST /knowledge`**
    *   **说明**: 为当前企业创建一个新的知识库。
    *   **Body**: 
        ```typescript
        { 
          name: string,          // 知识库名称
          description?: string   // 知识库描述
        }
        ```

*   **`GET /knowledge`**
    *   **说明**: 获取当前企业下的所有知识库列表。
    *   **返回 Data**: 
        ```typescript
        Array<{ _id: string, name: string, description: string }>
        ```

*   **`GET /knowledge/:id`**
    *   **说明**: 获取特定知识库的详情。
    *   **路径参数**: `id` (知识库 ID)

*   **`PUT /knowledge/:id`**
    *   **说明**: 更新特定知识库的基础信息。
    *   **路径参数**: `id` (知识库 ID)
    *   **Body**: 
        ```typescript
        { 
          name?: string, 
          description?: string 
        }
        ```

*   **`DELETE /knowledge/:id`**
    *   **说明**: 删除指定的知识库，不仅删除 MongoDB 记录，后续还会同步清空 Pinecone 中对应的底层向量切片数据。
    *   **路径参数**: `id` (要删除的知识库 ID)

*   **`POST /knowledge/:id/ingest`**
    *   **说明**: 将大段品牌规范/忌讳文本粉碎、切片、Embedding，并打上对应的标签存入 Pinecone 的专属 Namespace 中。
    *   **路径参数**: `id` (目标知识库 ID)
    *   **Body**: 
        ```typescript
        { 
          content: string   // 需要入库的长文本内容
        }
        ```
    *   **返回 Data**: 
        ```typescript
        { 
          success: boolean, 
          chunks: number    // 本次成功切出的向量块数量
        }
        ```

*   **`GET /knowledge/:id/records`**
    *   **说明**: （高级诊断接口）从底层的 Pinecone 向量数据库中，利用 `listPaginated` 暴力遍历并拉取当前知识库名下的所有向量切片明细。
    *   **路径参数**: `id` (目标知识库 ID)
    *   **返回 Data**: 
        ```typescript
        Array<{
          id: string,       // Pinecone 中存储的 Vector Chunk ID
          text: string,     // 该向量对应的明文切片
          metadata: any     // 元数据信息（包含 enterpriseId, knowledgeId 等）
        }>
        ```
