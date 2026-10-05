# V2.4 组织共享素材、作品与工作流验收

实施日期：2026-10-05；对应 [04 执行文档](Brand-Flow-AI-3阶段-Codex执行包/V2-组织协作闭环/04-共享素材作品与组织工作流.md)。

## 1. 完成内容

团队可读取并选择本团队和所属企业图片，企业工作流可选择企业图片；组织作品不再按创建者排除其他成员。素材、工作流、作品、历史版本和导出均执行服务端权限与对象归属校验。素材页、作品页及首页最近作品隔离空间请求，团队作品显示创建者，工作台显示实际工作流空间。

## 2. 关键决策

| 资源                     | 个人                                                    | 团队                                           | 企业                                           |
| ------------------------ | ------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| 可见素材                 | 本人 private                                            | 本团队 team + 所属企业 enterprise              | 本企业 enterprise                              |
| 可见作品                 | 本人                                                    | 本团队成员有读权限时共享                       | 本企业成员有读权限时共享                       |
| 素材管理                 | 本人                                                    | 当前团队 OWNER/ADMIN                           | 当前企业 OWNER/ADMIN                           |
| 作品编辑、删除、追加版本 | 本人                                                    | 创建者或当前空间 OWNER/ADMIN，仍需 manageWorks | 创建者或当前空间 OWNER/ADMIN，仍需 manageWorks |
| Viewer                   | 浏览、导出组织作品；不可修改组织资源、创建组织 Workflow | 同左                                           | 同左                                           |

- `public` 原实现仅企业内可见，没有互联网公开业务，统一为 `enterprise`；新请求使用 `public` 返回 400。
- 组织 Workflow 不自动共享个人图片。先将图片上传到目标团队/企业；跨团队、跨企业、个人→组织参考均拒绝。
- 个人知识参考保留 03 的规则：本人主动选择、组织必选及冲突再校验；素材地址沉淀知识库仅允许同一空间，防止扩大素材可见范围。
- 同空间成员可以保存共享 Workflow 的可信成片；一个 Workflow 只对应一个 Work。已有作品的其他成员重复保存只返回原作品，不能增加版本。创建者/管理员可追加同空间其他 Workflow 的版本。
- 作品对象路径继续使用原作品创建者和 Work ID。管理员追加版本不会改变对象命名空间，`createdBy` 记录实际操作者。收藏仍仅允许作品创建者操作。
- 引用在创建、执行、读取快照/Revision 和合成 Logo 时重新查询；不信任持久化或客户端提供的签名 URL。刷新签名保留已分析的视觉特征。

## 3. 主要文件

- API：`assets.service.ts`、`workflow-references.service.ts`、`workflow.service.ts`、`workflow.processor.ts`、`works.service.ts`，复用 `AuthorizationService`。
- Schema/DTO：Asset、Work、WorkVersion、ExportLog 和素材/作品响应；关联 ID 使用真实 Mongoose ObjectId，而非 Mixed。
- Web：`AssetsPanel`、`SaveToKnowledgeModal`、`ReferencePicker`、首页、作品列表、工作台及对应 API 类型。
- 回归：`works/index.test.tsx`、参考素材测试、`scripts/smoke-collab-resources.cjs`；迁移：`scripts/migrate-collab-resources.cjs`。
- API 契约及可执行请求样例同步于 [API.md](../apps/api/API.md) 与 `apps/api/rest-client`。

## 4. 接口与模型

- 未新增 HTTP 路由。`GET /assets?spaceId=...` 增加实际资源的 `canManage`；团队管理员的企业素材按钮按企业权限计算。
- `GET /works?spaceId=...` 按真实空间读取，列表 `creatorId` 填充 `_id/email/profile`；详情仍返回 ID。作品返回 `canEdit`，组织 scope 与 ownerType/visibility 一致。
- WorkVersion 新写入 `spaceType/spaceId/enterpriseId`，从已授权 Work 继承；旧版本缺少 scope 时按父作品解释。读取、删除及导出同时核对来源 Workflow 空间和对象路径，错误记录拒绝处理。
- `POST /works` 和版本接口忽略客户端质检、预览内容；只读服务端已完成且质检通过的同空间 Workflow，拒绝客户端替换对象键。原子版本号、来源唯一索引及失败补偿保留；清理失败有日志。
- `Visibility` 只接受 private/team/enterprise；ObjectId 类型变更要求迁移已有字符串关联。

## 5. 自动化验证

均使用 Node 24.19.0、仓库 pnpm 10.29.3；没有新增依赖、修改锁文件或创建 Conda 环境。

| 命令                                                | 实际结果                                       |
| --------------------------------------------------- | ---------------------------------------------- |
| `pnpm --filter @brand-flow/api test -- --runInBand` | 18 组、128 项通过                              |
| `pnpm --filter @brand-flow/web test`                | 20 文件、53 项 Vitest + 1 项 Node SSE 测试通过 |
| `pnpm --filter @brand-flow/contracts test`          | 13 项通过                                      |
| `pnpm --filter @brand-flow/agent test`              | 27 项通过；网络与模型调用由既有测试 Mock       |
| `pnpm lint`                                         | 四包通过；未改动的 Agent 使用 Turbo 缓存       |
| `pnpm build`                                        | 四包通过；Web 有既有 500 kB 分包提示           |
| `git diff --check`                                  | 通过                                           |

新增 Web 回归验证：成员能查看他人作品、显示创建者但不能删除；迟到的团队请求不能覆盖个人作品；参考选择器查询当前组织空间。

## 6. 真实接口与浏览器验收

独立本机 MongoDB 8.0.15 副本集、随机测试数据库、真实 Nest/JWT/HTTP；对象存储使用明确的内存 Mock。没有连接业务 Mongo、真实 MinIO、Redis 队列或付费模型。

```powershell
node scripts/smoke-collab-resources.cjs mongodb://127.0.0.1:27019 <已有Playwright的node_modules路径>
```

脚本仅允许本机 27019 测试副本集。最后删除自己创建的随机数据库，并关闭浏览器、Vite、Nest；测试 Mongo 进程由启动方关闭。

验收通过：

- 同团队 Owner 上传，Member 使用团队产品和企业 Logo 创建 Workflow，Viewer 读取；非成员/其他企业拒绝。
- Viewer 上传、删除、创建 Workflow、追加版本均 403；普通成员不能删除他人 Work。
- 组织作品及创建者共享列表、管理员追加版本、同来源幂等、Viewer 指定版本导出正常。
- 跨企业资产/Workflow/Work、跨团队版本来源、伪造资产/作品对象键、版本 scope 或来源 Workflow 污染均拒绝。
- 个人素材向团队知识库沉淀拒绝；旧 public 和字符串 ObjectId、旧组织作品 owner、版本 scope 的迁移、重复执行及事务回滚通过。
- Edge：通过真实左侧菜单切换个人/团队/企业，素材与作品不串数据；团队首页只显示团队/企业参考；工作台显示实际“甲团队”；Viewer 素材与作品按钮只读。390 px 无横向溢出，截图已检查。

浏览器出现既有 Ant Design 弃用/静态 message 和 React Flow nodeTypes 提示，不影响上述流程。

## 7. Git 交付

基线：`93797e73872cdcae088b9ab972ae7a1e61bfd126`，开始时工作区干净，`codex/UI` 已同步 origin。

本阶段提交信息：`feat(collab): 打通组织素材作品与创作空间`。提交及推送结果、最终 SHA 在交付回复中给出；提交前检查暂存范围，不包含 `.env`、临时 Mongo、截图、dist 或缓存。

## 8. 部署注意与后续依赖

升级前备份数据库、暂停资源写入，在 Mongo 副本集上运行迁移。脚本默认检查，明确 `--apply` 才写入；一次事务完成，异常不提交。示例只填写自己环境的连接信息：

```powershell
$env:COLLAB_MIGRATION_URI = '<数据库连接地址>'
$env:COLLAB_MIGRATION_DB = '<业务数据库名>'
node scripts/migrate-collab-resources.cjs
node scripts/migrate-collab-resources.cjs --apply
```

脚本拒绝无效 ID、归属不明确的 public、缺少父作品、作品与真实组织不一致及跨空间版本来源。需核对并修复真实数据，不能跳过错误强行升级。迁移后再启动新服务；没有对业务数据库执行迁移。

真实 MinIO 的签名访问、桶权限和真实队列/模型创作尚未验证，需要在部署环境回归。签名 URL 在有效期内仍可使用，角色变更不能撤销已发出的存储签名；读取入口会重新授权。历史版本来源 Workflow 必须保留，缺失或跨空间记录需人工核查。

后续阶段复用真实资源 scope 与服务端能力字段，不能把前端 `canEdit/canManage` 当作鉴权凭据。
