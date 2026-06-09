# VS Code REST Client 接口测试

这个目录用于存放后端接口测试文件，适配当前 `Workspace + Space + Membership` 架构。

## 使用方式

1. 在 VS Code 安装插件：`REST Client`
2. 启动 API 服务
3. 打开 `*.http` 文件
4. 点击每个请求上方的 `Send Request`

## 推荐测试顺序

优先使用 `api-flow.http` 跑主流程：

```text
注册或登录
复制 access_token
GET /org/workspaces
GET /org/spaces
复制一个真实 spaceId
创建知识库
创建知识项
创建素材
创建工作流
保存作品
```

## 当前核心变量

```http
@baseUrl = http://localhost:3000/api
@accessToken = paste-login-or-switch-token-here
@workspaceId = paste-current-workspace-id-here
@spaceId = paste-space-id-from-get-org-spaces-here
@knowledgeId = paste-knowledge-id-here
@assetId = paste-asset-id-here
@workflowId = paste-workflow-id-here
@workId = paste-work-id-here
```

注意：`spaceId` 必须来自 `GET /org/spaces` 返回的真实 MongoDB ID，不能写 `personal`、`team` 这类字符串。

## 文件说明

- `api-flow.http`：完整主流程测试
- `auth.http`：注册、登录、当前用户
- `org.http`：工作区、团队、空间、成员邀请
- `knowledge.http`：知识库和知识项
- `assets.http`：素材创建、上传、沉淀知识库
- `workflow.http`：工作流创建、节点更新、SSE
- `works.http`：作品保存、版本、导出
- `health.http`：健康检查
- `storage.http`：对象存储预留测试；当前源码没有公开 `StorageController`

## 重要约束

- 切换 workspace 后，必须把返回的新 `access_token` 复制到 `@accessToken`。
- 创建知识库、素材、工作流时都必须传 `spaceId`。
- 创作页获取知识库下拉框应该使用 `GET /knowledge/selectable?spaceId={{spaceId}}`。
- 保存作品只传 `workflowId`，不要传 `spaceId / ownerId / ownerType / visibility`。
