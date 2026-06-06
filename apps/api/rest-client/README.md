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
- `works.http`：作品接口
- `assets.http`：素材接口
- `org.http`：企业、团队、空间成员接口
- `workflow.http`：智能工作流接口
- `knowledge.http`：知识库接口
- `health.http`：根路径健康检查接口
- `storage.http`：对象存储预留测试；当前源码没有公开 `StorageController`
