# V1 个人知识库运行与验收

个人库名称唯一键为 `spaceId + creatorId + name`；团队/企业库仍以 `spaceId + name` 唯一。重名返回 409。

## 索引迁移

API 启动时 `KnowledgeService.onModuleInit` 执行迁移：先补齐能确定归属的旧 personal 记录的 `spaceType`，检查归属，再建立新唯一索引，最后仅移除精确匹配的旧 `spaceId_1_name_1` 唯一索引。新索引建立失败会阻止启动，旧索引保留。需要 Mongo 的建表、更新和索引管理权限；不会使用 `syncIndexes` 删除其他索引。缺少 creator 或空间类型的异常记录须核对归属后修复再启动。

知识项新增 `sourceType: import` 与可选 `importKey`，后者按知识库建立部分唯一索引，普通手工条目不受影响。

## 导入与维护

Web 知识库详情支持手工新增、原文与来源查看、编辑、归档、启用、删除，以及 `.txt/.md` 或粘贴文本导入。每个非空行是一条规则；可用 `[required]`、`[recommended]`、`[optional]` 标记级别，默认 recommended。最多 200 条、文本 100000 字符、单条正文 5000 字符，超限拒绝并提示，不截断正文。

预览接口不落库；确认接口使用预览 UUID 批次与条目序号幂等写入 Mongo。部分失败时保留预览，原批次原内容重试不会重复创建。已经写入的条目被改动时返回 409，应重新解析生成新批次。旧 ingest 接口同样写入 Mongo，相同文本重复提交幂等。

默认 `KNOWLEDGE_VECTOR_MODE=disabled`，提示“已导入到知识库，语义向量未启用”，Workflow 直接读 Mongo。开启向量后以条目 ID 与切片序号生成稳定向量 ID，更新/重试前清理旧切片。同步失败保留 Mongo，并写入 `metadata.vectorSync.failed`，Web 可重试。删除时先清理向量；清理失败保留 Mongo 以便重试。真实 Pinecone/Embedding 验收需要另外配置凭据，本地测试不调用付费服务。

Workflow 复用现有 0~3 个个人知识库选择。active required 全量读取；recommended 与 optional 按创建时间、ID 排序，各最多 30 条。sources 包含 knowledgeBaseId/itemId。超长规则按 12000 字符预算逐批规划与质检，原始包完整保存在 Workflow；任一批质检失败则整体不通过。单条旧数据超过批次预算时明确报错，须拆成完整规则。

## 可重复的真实 Mongo 冒烟

先构建，再在显式指定的本机 Mongo 上运行：

```powershell
pnpm build:shared
pnpm --filter @brand-flow/api build
node scripts/smoke-knowledge.cjs mongodb://127.0.0.1:27018
```

脚本不读取 `.env`，强制关闭向量，仅允许本机显式端口。创建 `codex_knowledge_smoke_<时间戳>` 临时数据库，结束后删除该库。验证旧索引迁移、A/B 同名、同用户 409、B 越权 404、导入前不落库、重复确认幂等、持久化读取、31 条 required 与来源、无知识库工作流，以及知识项新增/编辑/归档/启用/删除。

## 本次验证记录（2026-10-04）

| 验证                                                         | 实际结果                                                                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @brand-flow/contracts test`                   | 10 项通过，包括导入解析与完整规则分批                                                                                |
| `pnpm --filter @brand-flow/api test -- --runInBand`          | 65 项通过，包括索引迁移、导入幂等、向量失败重试和清理失败保留 Mongo                                                  |
| `pnpm --filter @brand-flow/web test`                         | Vitest 20 项与原生 SSE 1 项通过；新增知识库页面交互测试                                                              |
| `pnpm --filter @brand-flow/agent test`                       | 23 项通过；超长规则每批均进入质检，最后一批失败时整体失败                                                            |
| `pnpm build`                                                 | 四个包全部构建成功                                                                                                   |
| Web / Contracts lint                                         | 通过                                                                                                                 |
| API / Agent lint、`pnpm lint`                                | 基线阻塞：API 109、Agent 231 个存量错误。对照 HEAD 的 30 个报错文件，两边均为 340 个错误；本次修改文件 ESLint 无错误 |
| `node scripts/smoke-knowledge.cjs mongodb://127.0.0.1:27018` | 在临时 Mongo 8.0 上通过；补验重复启动迁移、并发确认幂等、recommended/optional 各 30 条上限和 required 完整性         |
| `git diff --check`                                           | 通过                                                                                                                 |

Web 测试与全仓构建使用现有 Node 24 运行时，未修改依赖或锁文件。页面交互测试仅适配 jsdom 对 CSS calc/var 的计算限制，使用真实 Ant Design 组件与真实事件；未进行真实浏览器视觉验收。真实 Pinecone、Embedding 与付费模型流程未调用，失败补偿和分批门禁使用自动化 Mock 验证。规则批次数增加会增加模型请求次数和耗时。

Git：前置 01 已提交并推送为 `5f23eb9`；02 按用户要求单独提交，并包含用户指定的 `.gitignore` 改动。
