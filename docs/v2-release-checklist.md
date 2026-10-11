# V2 组织协作发布清单

验收日期：2026-10-11。分支：codex/UI。范围：V2.1～V2.5，并回归 V1 个人闭环。

## 发布条件

- [x] 企业/团队创建、编辑、归档/停用、恢复、邀请接受/拒绝/撤销、角色变更、退出/移除及 Owner 转移。
- [x] Owner/Admin/Member/Viewer/Outsider 的真实 HTTP 多租户矩阵；团队管理员不能读取企业/其他团队审计。
- [x] 企业/团队/个人知识继承、强制规则冲突、38 条强制规则完整保留、导入幂等和并发规则冲突。
- [x] 共享素材、组织 Workflow、共享作品、版本继承与导出；个人、同企业其他团队、其他企业资源隔离。
- [x] 审计记录操作者、租户、资源、事件和脱敏状态；组织事务失败不留下角色变化、审计或通知部分提交。
- [x] 通知本人查询、未读数、已读幂等及他人通知 404；不提供客户端指定 actor/recipient 的写接口。
- [x] 真实 MongoDB 8.0 副本集、Redis 8、Garage v2.3.0 S3 集成；真实 BullMQ 七节点团队 Demo 创作至 Viewer 下载。
- [x] V1 双账号、限额、取消/重试、孤儿对账、SSE/刷新/关闭恢复、图文合成、优化三版本、PNG 下载回归。
- [x] 最终根 lint/test/build 与整合 test:v2 复核。

## 验证命令

| 验证           | 最终结果                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm lint`    | 4 包通过                                                                                             |
| `pnpm test`    | API 19 文件/133 项；Web 20 文件/53 项及1项 Node SSE；Contracts13项；Agent27项，全部通过              |
| `pnpm build`   | 4 包通过；仅已有 Web 分包大小警告                                                                    |
| `pnpm test:v1` | 全部通过，真实 Mongo/Redis/Garage S3/Edge，包括生产 preview 合成与版本下载                           |
| `pnpm test:v2` | 全部通过，组织生命周期、知识继承、协作资源/审计/通知、真实团队队列与 S3、Edge390px、非法 ID 请求矩阵 |

验收中修正了新 Schema 的真实 ObjectId 定义、事务内多通知顺序写入及空 metadata 持久化；补充审计失败回滚检查。旧 V1 队列验收 fixture 的构造参数已同步到当前 AuthorizationService，非法 ID 矩阵所用 Workflow 列表转发也已补齐。首轮失败均已修正并重新通过，未删除或放宽断言。

使用仓库要求的 Node24+、pnpm10.29.3。先构建共享包和 API，不修改本地 .env。

```powershell
pnpm lint
pnpm test
pnpm build
pnpm test:v1 mongodb://127.0.0.1:27018 <Playwright-node_modules路径>
pnpm test:v2 mongodb://127.0.0.1:27019 <Playwright-node_modules路径>
```

27018/27019 必须是专用测试 Mongo 副本集，Redis6381 必须是专用测试实例；不可把业务数据库映射到这些端口。V2 脚本只接受27019并创建随机数据库和队列前缀，V1/V2 各自清理其测试资源。S3 fixture 只删除自己创建且身份匹配的随机 Garage 容器。浏览器使用已安装 Playwright 与本机 Edge。

本次临时 Mongo 容器内部端口为27019，副本集通告127.0.0.1:27019；外部27018/27019映射同一测试实例，避免通告一个宿主机无法访问的27017端口。

## 安全回归矩阵

执行包没有附编号审计原文；以下按 V1.1、V2.1、V2.4 指定的历史漏洞行为覆盖 F01 与 F04/F05/F06，不凭编号推断其他问题。

| 历史行为/边界                                                                     | 可复现检查                                                                              | 结果                                                 |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| F01 作品版本引用/删除其他用户 objectKey，禁用账号和旧 JWT                         | API security/Works 测试；V1 浏览器双账号；V2 污染 Work/Version/sourceWorkflow/objectKey | 拒绝跨用户/租户和伪造对象来源                        |
| F04/F05/F06 非团队成员企业 Viewer 创建团队 Workflow、企业 Viewer 借团队旧角色升权 | authorization.service.spec、smoke-org、协作五角色矩阵                                   | 403，不进入队列                                      |
| F04/F05/F06 ADMIN 邀请或改角色授予 OWNER                                          | smoke-org、成员/邀请 Jest                                                               | 拒绝；Owner 只能通过专用原子转移                     |
| F04/F05/F06 public 素材及 ownerType/visibility/enterpriseId 混用绕过管理权限      | smoke-collab-resources                                                                  | 错配/public DTO 拒绝；历史 public 迁移为真实企业可见 |
| 非法 ObjectId                                                                     | 组织、邀请、成员、素材、知识、Workflow、作品/版本/导出、审计游标、通知请求矩阵          | 400/404；故障注入的业务500另行验证事务回滚           |
| 组织知识读写/冲突隔离                                                             | smoke-knowledge-org                                                                     | Owner/Admin 写，Member/Viewer 只读；不遗漏强制规则   |
| 审计 actor 与通知 recipient 伪造                                                  | DTO 禁止附加字段；事务 actor 与 JWT 一致；收件人查询限定                                | 拒绝；仅管理员按租户读审计                           |

## 数据与部署

新增 `auditlogs` 与 `notifications` collection，由 OrgModule 注册模型和索引。无需迁移已有审计/通知；旧组织与协作资源仍按 [生命周期迁移](org-lifecycle.md) 和 [协作资源迁移](collab-resources.md) 先 dry-run、备份再应用。此次仅在随机测试库验证迁移，未迁移业务数据。

审计与组织/知识数据库写入同事务，审计不可读写接口修改。共享素材对象先删除，再提交数据库记录删除和审计；S3 与 Mongo 不能形成分布式事务，数据库失败会保留记录，重试完成删除。向量删除失败仍保留 Mongo 数据并报告失败；Mongo 失败后语义向量可能需要重新同步。按现有知识同步状态重试，不隐藏错误。

检查生产 Mongo 副本集、Redis/BullMQ、私有 MinIO/S3 Bucket、JWT_SECRET、限额配置及 readiness。停用/归档资源保留供恢复；审计读取按当前管理权限。新通知无复杂实时推送，也不新增通知页面；V3 可复用 ActivityService 和 API。

## 交付范围与限制

本阶段新增 Org ActivityService、审计/通知 Schema/DTO、读取接口；接入 Org/Membership/Invitation/Knowledge/Assets Service；同步 Web API 类型、REST 请求示例和 test:v2 入口。没有新增依赖或修改锁文件，没有创建 Conda 环境。

模型全程 Demo，向量模式 disabled；未进行生产 MinIO/S3、Pinecone、付费 Provider 或生产压测。现有 Ant Design 弃用和 React Flow 警告、Web 500KB 分包警告仍存在，非本阶段阻塞。上线需验证实际生产服务配置、备份与回滚，不以本机集成替代生产联调。

已签发的 S3 链接在其 TTL 内仍有效；成员降级/退出会立即撤销新的 API 访问和签名请求，不会撤销已经发出的对象签名。

回滚应用前备份 Mongo；保留新审计/通知 collection，旧应用可忽略它们，避免丢失追踪记录。组织/协作关联迁移的回滚需要备份恢复，不能仅降级应用。
