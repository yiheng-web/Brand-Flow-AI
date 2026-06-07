# VS Code REST Client 接口测试

这个目录用于存放 VS Code REST Client 的接口测试文件。

## 使用方式

1. 在 VS Code 安装插件：`REST Client`
2. 打开 `*.http` 文件
3. 点击每个请求上方的 `Send Request`

## 环境变量

接口地址、Token 等公共变量放在 `env.http`：

```http
@baseUrl = http://localhost:3000
@accessToken = 替换成你的登录 token
```

其他请求文件可以直接使用：

```http
GET {{baseUrl}}/works
Authorization: Bearer {{accessToken}}
```

## 文件建议

- `auth.http`：登录、注册、刷新 Token
- `admin.http`：平台运营后台接口，包含后台登录、Dashboard、用户管理、企业管理、审核队列、审计日志
- `works.http`：作品接口
- `assets.http`：素材接口
- `org.http`：企业、团队、空间成员、SpaceContext、企业品牌规则、企业策略接口
- `workflow.http`：智能工作流接口，包含 personal/team/enterprise space、`selectedKnowledgeBaseIds`、节点更新与 SSE 示例
- `knowledge.http`：知识库接口，包含 personal/team/enterprise 空间、available 查询、知识项类型与状态示例
- `health.http`：根路径健康检查接口
- `storage.http`：对象存储预留测试；当前源码没有公开 `StorageController`

## 当前关键接口约定

### Workflow 创建

新版 Workflow 创建必须传 `spaceId`：

```json
{
  "prompt": "制作一张夏日海报",
  "spaceId": "personal",
  "selectedKnowledgeBaseIds": []
}
```

兼容旧字段：

```json
{
  "prompt": "制作一张夏日海报",
  "spaceId": "personal",
  "knowledgeId": "知识库ID"
}
```

后端会在创建时解析 `SpaceContext`，并保存：

```text
spaceType
ownerUserId
teamId
enterpriseId
selectedKnowledgeBaseIds
requiredKnowledgeBaseIds
callableKnowledgeBaseIds
brandRulesSnapshot
policiesSnapshot
```

### SpaceContext

可以使用以下接口检查某个空间下的权限和企业策略：

```http
GET {{baseUrl}}/org/spaces/{{spaceId}}/context
Authorization: Bearer {{accessToken}}
```
