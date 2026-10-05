# V2.3 知识库继承与冲突执行报告

## 完成内容与决策

企业、团队和个人知识继续使用原有 Knowledge / KnowledgeItem 与统一授权服务。团队列表包含同企业知识、当前团队知识和自己的个人知识；其他团队、企业及用户的个人知识不能读取。组织 OWNER/ADMIN 维护知识，Member/Viewer 只读；个人空间保持自己的读写能力。

企业和团队均可设置 `isRequired`。创建团队工作流时自动加入两级必选库，再加入最多三个主动选择库；必选库不占主动选择名额。个人工作流不继承组织知识。首页将必选库显示为选中且不可取消。

采用原有 required / recommended / optional 协议。正文支持明确标签：

| 标签                | 示例               | 语义                                                       |
| ------------------- | ------------------ | ---------------------------------------------------------- |
| 品牌色              | `品牌色: #00A862`  | 同一强制颜色集合不能被下级改写；颜色支持六位十六进制与列表 |
| Logo禁用 / Logo使用 | `Logo禁用: 拉伸`   | 对相同操作的禁止与使用要求互斥                             |
| 必用文案 / 禁用文案 | `禁用文案: 最低价` | 对相同文案的必用与禁用互斥                                 |

标签可用换行或分号分隔。禁用项和必用文案映射为强制规则；不存在第二套 forbidden 状态。企业强制规则不可被团队/个人覆盖，团队强制规则不可被个人覆盖。单个明确的推荐/可选规则按个人 > 团队 > 企业优先；多个规则或夹杂未识别正文的条目完整保留，不擅自删除整条内容。

新增、编辑及导入对明确冲突返回 409，说明来源标题与冲突键，人工确认不能绕过。自然语言无法自动裁决时要求人工核对并确认；编辑正文必须重新确认。工作流合并再次检查，拒绝带有冲突的个人选择项或历史规则。全部强制规则保留，普通参考合并后各最多 30 条。Agent 原有分批逻辑继续保留全部规则及来源。

组织规则创建、编辑及批量导入复用现有企业事务锁，事务内重新授权；并发相反规则只能成功一个。事务提交后再同步向量，向量失败保留 Mongo 并可重试。个人空间保持原有非事务写入行为。

## 主要文件与契约

- `packages/contracts/src/knowledge-rules.ts`：明确规则解析、继承合并、内部与跨来源冲突、自然语言警告。
- `apps/api/src/modules/knowledge/knowledge.service.ts`：团队必选、作用域列表、事务校验、编辑重新确认、导入幂等；知识 Schema 的关联字段改为真正的 Mongoose ObjectId，沿用已有个人/组织唯一索引。
- `apps/api/src/modules/workflow/workflow.service.ts`、`workflow.processor.ts`：自动组合企业/团队必选库，主动选择自己的个人知识，查询包含租户归属，合并后限制普通参考。
- `apps/web/src/pages/knowledge`：来源筛选、继承说明、按实际来源权限禁用操作、异步空间切换竞态防护、确认入口和窄屏布局。
- `apps/web/src/pages/home/home.tsx`、`workspace/workspace.tsx`：必选库提示、工作流企业/团队/个人来源与规则正文。
- `apps/api/API.md`、`apps/api/rest-client/knowledge.http`：接口说明与真实请求示例。

没有新增路由或依赖。`POST /knowledge/:id/import` 增加可选布尔字段 `confirmInheritance`；单项写入沿用 `metadata.inheritanceConfirmed`。`BrandConstraintPackage.sources` 增加可选 `spaceType/spaceId`，约束条目增加可选 `sourceSpaceType/sourceSpaceId`，兼容历史无来源类型的结果。约束包可选 `warnings` 保留无法自动判定的自然语言警告，工作台显式提示核对。

## 验证

使用 Node 24 与仓库锁定的 pnpm 10.29.3：

| 命令                                                | 结果                                                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm --filter @brand-flow/contracts test`          | 13 项通过，覆盖颜色、Logo、文案、内部矛盾、来源优先级、跨团队隔离和完整分批 |
| `pnpm --filter @brand-flow/api test -- --runInBand` | 18 个文件、128 项通过                                                       |
| `pnpm --filter @brand-flow/web test`                | 19 个文件、50 项 Vitest 与 1 项 Node SSE 测试通过                           |
| `pnpm --filter @brand-flow/agent test`              | 27 项通过，使用已有 Demo/Mock，无付费模型调用                               |
| `pnpm build`、`pnpm lint`                           | 四个包通过；Web 保留既有大分块构建提示                                      |
| `git diff --check`                                  | 通过                                                                        |

初次 Web 回归发现导入 API 新增确认参数、按钮可访问名称导致两处测试断言不匹配；按实际契约修正后全量通过，未删除或降低断言。

可复现真实验收命令（仅接受专用本机 27019 测试副本集，随机库在 finally 删除）：

```powershell
node scripts/smoke-knowledge-org.cjs mongodb://127.0.0.1:27019
# 可选附加已有 Playwright 所在的 node_modules 路径，使用本机 Edge
node scripts/smoke-knowledge-org.cjs mongodb://127.0.0.1:27019 <已有Playwright的node_modules路径>
```

使用隔离 Mongo 8.0.15 副本集与真实 Nest/JWT/HTTP 验证：跨企业、跨团队、个人隔离；作用域唯一索引；OWNER/ADMIN 写入与 Member/Viewer 只读；新增和编辑冲突拒绝；自然语言确认及编辑后重新确认；35 条团队规则重复导入幂等；企业、团队、个人三来源工作流共 38 条强制规则完整保留；个人冲突不能绕过；并发相反文案仅一个成功。未连接项目业务数据库或读取 `.env`。

真实 Edge 验证空间切换、来源筛选、390px 布局、首页自动必选、冲突提示和失败后表单保留；未模拟 Knowledge HTTP 响应。

## 部署与限制

- 组织规则写入要求 Mongo 副本集，沿用 02 的部署条件。关联字段若历史存为字符串，部署前需核查并迁移为 BSON ObjectId；本阶段未自动修改业务数据库。
- 明确标签之外的复杂自然语言由人工确认；标签内容按精确值比较，不自动猜测颜色近义词、Logo 操作同义词或文案语义。
- 当前冲突检测逐对比较，规则达到数千条时需按键索引；同企业知识与成员变更共享事务锁，极高写入量时需评估拆分锁。
- 未执行真实 SiliconFlow / Pinecone 付费调用和完整生图链路；本阶段验证了真实知识数据与工作流约束装配，模型兼容性由现有 Mock/Demo 回归确认。
- 后续阶段可直接消费现有来源与继承结果；无新增包、锁文件或 Conda 环境。

Git 交付分支为 `codex/UI`，提交采用 `feat(knowledge): 支持企业团队规则继承与冲突`；实际提交 SHA 与推送结果在交付回复中给出。
