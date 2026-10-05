# V2.2 企业、团队、成员与邀请生命周期

## 实现与权限

Web `/organization` 支持企业自助创建、资料编辑、停用/恢复、团队创建/编辑/归档/软删除/恢复、成员角色变更、移除/退出及所有权转移。`/invitations` 展示收到/发出的邀请，提供接受/拒绝/撤销。按钮使用服务端 permissions；写操作防重复提交，错误可重试。组织操作后重新加载空间；被移除或归档的当前空间回到个人空间，名称变更同步到顶部栏。

沿用 User.memberships，不引入第二套成员存储。新增 Invitation collection，包含所属企业/团队、邀请人、邮箱、目标角色、SHA-256 邀请码哈希、状态与有效期。邀请码原文只在创建响应中返回，后续列表不暴露哈希；站内邀请中心按账号邮箱处理，无邮件发送依赖。有效期 7 天，过期在查询/处理时持久化，保留审计历史，不使用 TTL 删除。

OWNER/ADMIN 管理组织资料；仅 OWNER 可授予 ADMIN、操作管理员和转移企业所有权，不能通过普通邀请或改角色产生 OWNER。转移目标必须已有直接企业 membership 且未达拥有企业额度；原 OWNER 降为 ADMIN。OWNER 不能直接退出、移除或降级，避免无所有者企业。移出/退出企业会同时撤销该企业的团队关系。接受团队邀请且缺少企业关系时，普通成员/管理员补齐企业 MEMBER，访客补齐企业 VIEWER；重复接受不会改变既有角色，也不会在退出后重新加入。

停用企业与归档团队保留全部数据、成员和邀请历史，禁止资源访问和业务写入。管理者可查看组织资料并恢复；停用企业下的团队不能独立恢复。团队 DELETE 与归档采用相同软归档策略。退出后旧 JWT 撤销企业上下文但保留有效账号身份，个人空间和邀请中心可继续使用；停用账号仍立即失效。

## 原子性与运行环境

成员、邀请接受/拒绝/撤销、所有权转移与组织状态变更使用 Mongo 事务；同企业先更新 membershipVersion，事务冲突重试后重新验证成员权限。创建企业和初始化 OWNER、创建团队和初始化 ADMIN 也在事务中完成。并发企业创建与转移争用用户文档，拥有额度在事务内重查。

- `ORG_MAX_OWNED_ENTERPRISES=5`：每个用户拥有企业的上限，可配置正整数；包含已停用企业。
- 必须使用支持事务的 MongoDB 副本集；独立 Mongo 实例不能完成组织写操作。
- 本地 Docker Compose 保持 Mongo 8.0.15，新增单节点 rs0 自动初始化与主节点健康检查；重建 mongodb 服务时保留原 volume。默认连接示例为 `mongodb://127.0.0.1:27017/brand_flow?replicaSet=rs0`。
- Compose 的 `localhost:27017` 地址面向宿主机运行的 API；容器化/生产部署应使用自己的可解析副本集成员地址及认证配置，不照搬本地成员地址。
- 本次未新增或升级项目依赖，无锁文件及 Conda 环境变更。

## 旧数据升级

历史 org Schema 把 `Types.ObjectId` 当成字段类型，实际形成 Mixed，可能同时保存字符串与 BSON ObjectId。现在 User 的成员与当前企业字段、Team.enterpriseId、Invitation 关联字段使用 `Schema.Types.ObjectId`。已有字符串关联需在部署新 API 前迁移，避免数据库查询漏匹配。

先备份并暂停旧版本组织写入；迁移脚本不读取 `.env`，明确指定连接及目标库。默认只检查，`--apply` 才写入。所有待迁移 ID 先验证，发现无效 ID 即失败；用户/团队转换在同一事务提交，可重复运行。原资源和成员角色保留。

```powershell
$env:ORG_MIGRATION_URI = 'mongodb://127.0.0.1:27017/?replicaSet=rs0'
$env:ORG_MIGRATION_DB = 'brand_flow'
node scripts/migrate-org-objectids.cjs
# 审阅检查结果并完成备份后，在维护窗口执行：
node scripts/migrate-org-objectids.cjs --apply
```

本次只在随机隔离测试库执行了迁移，没有操作现有业务库。邮箱注册/登录按 trim/lowercase 规范化，查找兼容历史大小写；升级前若存在大小写不同但同一邮箱的重复账号，应先人工确定有效账号。

## 接口与主要文件

完整请求和响应见 [API.md](../apps/api/API.md)，可复用 [org.http](../apps/api/rest-client/org.http) 测试新接口。

- `packages/contracts/src/organization.ts`：生命周期状态、邀请数据与创建响应；authorization 新增 manageOrganization/transferOwnership。
- `apps/api/src/modules/org`：组织生命周期、统一授权、InvitationService、MembershipService 与相关 Schema/DTO/Controller。
- `apps/api/src/modules/auth`：邮箱规范化、撤销失效企业 JWT 上下文。
- `apps/web/src/pages/organization`、`pages/invitations`、`api/org.ts`、`store/useUserStore.ts`：管理页、邀请中心、接口类型与刷新回退。
- `scripts/smoke-org.cjs`、`scripts/migrate-org-objectids.cjs`：真实 Mongo/浏览器回归及旧数据升级。

## 可重复的真实验证

`smoke-org.cjs` 只接受回环地址 27019 的专用 Mongo 副本集，随机创建 `codex_org_*` 库，结束后删除该测试库，不读取业务 `.env`、不调用模型。账号注册/登录调用真实 AuthService；组织 HTTP 使用真实 Nest Controller、JWT Strategy、Policy、Mongoose 和事务。隔离了与本阶段无关的 Redis 限流、队列和模型模块。

```powershell
pnpm --filter @brand-flow/api build
node scripts/smoke-org.cjs mongodb://127.0.0.1:27019
# 追加已有 Playwright 的 node_modules 路径，同时使用本机 Edge 验证 UI：
node scripts/smoke-org.cjs mongodb://127.0.0.1:27019 <playwright-node_modules>
```

真实 HTTP 验证覆盖：创建企业/团队→邀请未注册邮箱→注册接受→进入团队→ADMIN 改角色→退出/移除→OWNER 转移→原 OWNER 退出；并发接受幂等、首次访客不获得企业写权限、跨企业伪造 membership 不进入成员列表、其他邮箱/邀请码拒绝、重复邀请/过期/撤销/拒绝、邀请人撤权、停用/恢复、软归档资源保留、故障注入事务回滚、创建/转移额度、旧字符串迁移与无效 ID 中止、null DTO 拒绝。故障回滚测试主动抛出一次异常，500 为预期测试结果，检查成员和邀请均未部分提交。

真实 Edge 验证覆盖：UI 创建企业/团队、邀请未注册邮箱、对方注册后在邀请中心接受、先更新企业 JWT 再进入团队、双方刷新后状态一致、普通成员的管理按钮禁用，以及组织/邀请页 390px 窄屏无横向溢出。未逐一在浏览器点击全部角色/转移/停用按钮，其余生命周期由真实 HTTP 与页面单测验证。

页面单测保留真实 Ant Design 组件，沿用已有知识库测试的 jsdom calc/var 样式处理；布局和权限按钮另由真实 Edge 验证。单测不是浏览器布局验收的替代。

## 02 执行结果（2026-10-05）

使用本机已有 Node.js 24.19.0、pnpm 10.29.3 和 Playwright/Edge；Docker 引擎不可用，真实数据库测试使用 [MongoDB 官方 Windows 便携包](https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-windows-zip/) 8.0.15 启动专用副本集，未安装服务或改动业务数据库。

| 验证                                                                                                      | 实际结果                                                                                |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm --filter @brand-flow/api test -- --runInBand`                                                       | 17 个文件、126 项测试通过                                                               |
| `pnpm --filter @brand-flow/api test -- --runInBand membership.service.spec.ts invitation.service.spec.ts` | 共享事务入口调整后，相关 11 项测试再次通过                                              |
| `pnpm --filter @brand-flow/web test`                                                                      | 18 个 Vitest 文件、48 项测试及 1 项 Node SSE 测试通过                                   |
| `pnpm --filter @brand-flow/contracts test`                                                                | build 与 12 项测试通过                                                                  |
| `pnpm lint`、`pnpm build`                                                                                 | 四包全部通过；Web 保留既有大于 500 kB 分包提示                                          |
| `pnpm --filter @brand-flow/web lint`、`pnpm --filter @brand-flow/web build`                               | 最终页面及状态契约通过；窄屏样式另由真实浏览器复验                                      |
| `pnpm exec eslint scripts/smoke-org.cjs scripts/migrate-org-objectids.cjs`                                | 通过                                                                                    |
| `docker compose -f apps/api/docker-compose.yml config --quiet`                                            | 配置校验通过；未启动真实 Docker 容器，引擎不可用                                        |
| `node scripts/smoke-org.cjs mongodb://127.0.0.1:27019 <playwright-node_modules>`                          | 真实 Mongo HTTP、旧数据迁移/幂等/无效 ID 中止、故障回滚、Edge 页面及 390px 窄屏全部通过 |
| `git diff --check`                                                                                        | 通过                                                                                    |

部署前需配置副本集，并在备份和维护窗口后执行旧关联 ID 迁移；业务库迁移未在本次执行。下一阶段共享资源及协作任务可复用本阶段 Policy、成员关系、Invitation 状态和软归档约束。提交范围仅包含本阶段代码、契约、测试、文档及运行配置，提交标题为 `feat(org): 完成企业团队成员邀请生命周期`。
