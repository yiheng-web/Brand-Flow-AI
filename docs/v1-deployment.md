# V1 开发、部署与恢复

## 运行环境与开发

使用 Node.js 24 LTS 和 pnpm 10.29.3。根 `engines`、`.node-version`、CI、开发脚本和 Dockerfile 已统一；不会修改本机默认 Node 或已有环境。

```powershell
pnpm install --frozen-lockfile
Copy-Item apps/api/.env.example apps/api/.env # 仅在文件尚不存在时执行
# 编辑自己的 .env，配置下述凭据；纯演示设置 BRAND_FLOW_DEMO_MODE=true
pnpm dev:all
```

启动脚本先检查 Node 和环境文件，再启动依赖、构建共享包、启动 watch。未配置模型密钥时，可显式使用 Demo；`--skip-key-check` 只支持界面调试，不会伪造真实模型成功。

开发依赖文件为 `apps/api/docker-compose.yml`，Mongo/Redis/MinIO 仅绑定本机端口。MinIO 初始化开启版本管理并禁用匿名访问，初始化失败会返回非零状态；SSE-S3 加密须由部署者配置 KMS 后另行启用。

## 必需配置

所有示例只包含占位值。生产环境文件保存在部署层，不能提交到 Git 或打入镜像。

| 配置                                                          | 说明                                                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `JWT_SECRET`                                                  | 独立强随机密钥，建议至少 32 字节；更换会使旧登录失效                               |
| `MONGODB_URI`                                                 | 可访问的 Mongo；生产 compose 使用带认证的内部地址                                  |
| `REDIS_HOST/PORT/PASSWORD/DB`                                 | BullMQ 与额度共用 Redis；需要持久化和独立密码                                      |
| `REDIS_QUEUE_PREFIX`                                          | 默认 `bull`；同一业务 API/Worker 必须一致，测试使用随机前缀                        |
| `MINIO_ENDPOINT/PORT/USE_SSL`                                 | MinIO 或 S3 兼容端点；生产使用 HTTPS                                               |
| `MINIO_ACCESS_KEY/SECRET_KEY/BUCKET/REGION`                   | 已创建的私有桶及授权凭据；readiness 需要 HeadBucket 权限                           |
| `MINIO_SIGNED_URL_EXPIRES`                                    | 默认短签名 900 秒；API 读取时重新签发                                              |
| `SILICONFLOW_API_KEY/BASE_URL/CHAT_MODEL/IMAGE_MODEL`         | 真实 Provider 配置；Demo 明确设为 `true` 才能使用演示输出                          |
| `SILICONFLOW_CHAT_TIMEOUT_MS / SILICONFLOW_VISION_TIMEOUT_MS` | 文本与视觉默认 60000 ms，禁止无限等待                                              |
| `IMAGE_GENERATION_TIMEOUT_MS`                                 | 生图默认 120000 ms                                                                 |
| `KNOWLEDGE_VECTOR_MODE`                                       | V1 默认 `disabled`，Mongo 品牌规则仍生效；启用语义检索另需 Pinecone/Embedding 配置 |
| `TRUST_PROXY_HOPS`                                            | 直连默认 0；生产示例内部 API 经唯一可信代理时设置 1                                |
| `CORS_ORIGIN`                                                 | 跨域时设置明确受信源；同源生产部署不需要                                           |

签名端点必须同时被 API 与浏览器访问。不要把返回 URL 中的内部主机名替换成公共主机名，这会破坏 SigV4；使用一致的公共存储域名及正确 DNS/代理。存储代理必须保留 Host、路径、查询参数及 Range。存储桶 CORS 只允许前端源的 GET/HEAD，必要时暴露 Content-Disposition/Content-Type；桶保持私有。

## 成本保护与恢复

| 配置                                         | 默认值与含义                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `AUTH_RATE_LIMIT / AUTH_RATE_WINDOW_SECONDS` | 每地址每登录/注册入口 10 次 / 60 秒；地址只保存摘要                                                       |
| `WORKFLOW_RUNNING_LIMIT`                     | 每用户 2 个 running，包含已入队任务；Mongo 原子名额不会因长时间排队过期                                   |
| `IMAGE_DAILY_LIMIT`                          | 每用户 UTC 每日 40 张；新四候选调用预先消耗 4，失败不退回可能已付费的额度                                 |
| `WORKFLOW_RETRY_LIMIT`                       | 每工作流每 30 天最多 20 次显式失败/完成/stale 节点重跑、反馈优化及已有艺术字重生成；首次 pending 节点不计 |
| `PROVIDER_MAX_ATTEMPTS`                      | 1–3，默认最多 3 次；候选质检最多 2 次；SDK 隐式重试关闭，生图不自动重试                                   |
| `WORKFLOW_RECOVERY_SECONDS`                  | 默认 900 秒后对账执行中断与无归属名额；后台每 60 秒扫描                                                   |

Redis 计数原子更新；Redis 不可用时新额度校验返回 503。运行名额绑定执行令牌，Mongo CAS 失败释放自己的名额，完成/等待用户/失败/取消释放名额；部分清理失败由后台对账补偿。老队列任务也要先取得名额才能调用 Provider。

429 返回可理解消息和 `Retry-After` 秒数，前端提示等待时间。Provider 超时或临时故障采用最多 3 次有界重试，重试前重新检查执行版本和取消；已经持久化的候选检查点继续复用。取消阻止后续节点及 API 控制的重试，已经发送给外部 Provider 的请求可能仍完成或计费。

BullMQ 自身处理 stalled job；后台仅将超过等待时间且没有 active/waiting/delayed 等可执行 job 的 running 工作流通过 CAS 转为 failed，保留结果和检查点供用户重试。用户名额分配与工作流 CAS 之间崩溃留下的孤儿令牌也会清理。多 API 实例可以并行对账，CAS 防止覆盖新执行。

## 生产构建与启动

在仓库根目录构建镜像，镜像只复制生产包；API 使用非 root 用户。

```powershell
docker build -f apps/api/Dockerfile -t brand-flow-api:v1-release .
docker build -f apps/web/Dockerfile -t brand-flow-web:v1-release .

$env:RELEASE_TAG = 'v1-release'
$env:API_ENV_FILE = '部署层环境文件的绝对路径'
$env:MONGO_USER = '部署数据库用户'
$env:MONGO_PASSWORD = '部署数据库密码'
$env:REDIS_PASSWORD = '部署Redis密码'
docker compose -f deploy/docker-compose.prod.yml config --quiet
docker compose -f deploy/docker-compose.prod.yml up -d
```

数据库密码作为 URI 字段须使用 URL 安全字符或事先编码。生产 compose 不发布 Mongo/Redis/API 端口，只将 Web 发布到 `127.0.0.1:8080`；公网 HTTPS 由部署层转发到这里。API 环境文件配置自己的私有 S3 桶，生产示例不创建或删除外部对象存储。

`deploy/nginx.conf` 提供 SPA fallback、`/api/` 和 `/health/` 转发，SSE 禁用缓冲和缓存、读写超时 600 秒。代理覆写转发地址头。如前面还有 HTTPS 网关，须在 Web 的 Nginx 配置中用 `set_real_ip_from` 指定该可信网关的准确 IP/CIDR，并设置 `real_ip_header X-Forwarded-For`，网关自身覆写客户端地址；否则默认按网关地址合并限流。不能信任任意来源的转发头，内部 API 也不能绕过可信代理直接暴露。

```powershell
Invoke-RestMethod http://localhost:8080/health/live
Invoke-RestMethod http://localhost:8080/health/ready
```

`live` 只检查进程，`ready` 并行检查 Mongo ping、Redis ping、BullMQ 队列查询和私有桶 HeadBucket；任一失败返回 503 和不含凭据的依赖状态，单次探测有 3 秒上界。普通响应遵循既有 `{success,data}` 包装，失败依赖状态位于 `data.checks`。

发布前备份 Mongo 与对象存储，Redis 使用持久化卷。保留上一发布标签；回滚时只将 `RELEASE_TAG` 指向已有旧镜像并 `up -d`，不删除数据卷，不强制重写 Git 历史。06 新增 User 的名额数组和 Workflow 的执行令牌，均为可选/默认空；回滚前暂停新写入并处理正在执行的任务，不让旧 Worker 与新 Worker 同时消费同一队列。

## 可重复验收

测试只连接专用本机 Mongo 27018、Redis 6381；请勿复用业务实例。先构建，再提供已安装 Playwright 的绝对模块目录和 Edge 浏览器。

```powershell
docker run -d --name codex-brand-flow-compose-mongo -p 127.0.0.1:27018:27017 mongo:8.0
docker run -d --name codex-brand-flow-compose-redis -p 127.0.0.1:6381:6379 redis:8-alpine
docker pull dxflrs/garage:v2.3.0
pnpm build
pnpm test:v1 mongodb://127.0.0.1:27018 '<已安装Playwright的node_modules绝对路径>'

# 在已构建以下测试镜像后验证真实生产启动和Nginx SSE
docker build -f apps/api/Dockerfile -t codex-brand-flow-api:v1-06 .
docker build -f apps/web/Dockerfile -t codex-brand-flow-web:v1-06 .
node scripts/smoke-deploy-v1.cjs
```

Garage 启动方式依据 [官方快速启动文档](https://garagehq.deuxfleurs.fr/documentation/quick-start/)；它仅作为真实 S3 兼容测试服务，不替换产品生产存储，也不声明 MinIO 已验收。测试使用随机数据库、队列前缀、桶凭据与带本任务标签的容器，退出时只清理自己创建的资源。所有模型业务使用 Demo，不产生付费调用。当前验收结论及外部待验项见 [发布清单](v1-release-checklist.md)。
