# V1.4 主创作输入、参考素材与生成参数验收

对应执行包 `V1-个人创作闭环/04-主创作链路参考图与生成参数.md`，实施日期：2026-10-04。

## 输入与权限

首页保留知识库选择，新增个人上传图片选择器与画面比例。参考输入仅为 `references: [{ assetId, role }]`，支持 `logo/product/person/style`，最多 4 个不重复素材。选择器提供加载、空、失败重试、禁用和清空状态，并限制弹层大小。

API 创建工作流及执行 Brief 时都重新查询本人创建、本人拥有、个人私有的 PNG/JPEG/WebP Asset，校验服务端对象键。其他用户素材、外链记录、伪造对象键和非个人空间不能作为参考输入。执行前从对象存储读取图片字节，转换为供视觉模型读取的 Data URL；数据库不保存 Base64。

Workflow 新增 `references` 与 `generationConfig`；`result.references` 保存经校验的原图来源和结构化视觉特征。详情刷新读取地址，保留 Asset ID、原对象键、角色、名称及解析来源。

## 参考图策略

产品、人物、风格图采用“视觉模型提取可见颜色、形状、材质、构图 → Brief → Prompt”的统一策略。提取结果经过结构校验；解析失败明确报错。Agent 在初始及优化 Prompt 中保留参考约束，防止规划模型漏掉参考信息。

当前 Images API 提供单图 `image` 字段，并支持部分编辑模型。此次不使用直接图生图，统一策略允许多个不同用途素材进入同一创作；不会声称已将原图片直接传给生图模型。特征约束不保证像素级一致或人物身份还原。

Logo 标记为 `compose_logo`，保留原图 Asset ID 和对象键作为后续图层合成来源，明确要求底图不生成或模仿 Logo。选择器说明这一限制。本阶段没有新增自动 Logo 叠加；后续合成阶段应读取原图图层。

Demo 模式明确记录 `visualConstraints.source = demo` 和“未调用视觉模型”；真实视觉提取记录 `source = vision`，不能把 Demo 特征当成真实识别结果。

## Provider 参数与四候选

| 比例 | Kwai-Kolors/Kolors | Qwen/Qwen-Image |
| ---- | ------------------ | --------------- |
| 1:1  | 1024×1024          | 1328×1328       |
| 4:5  | 1024×1280          | 明确拒绝        |
| 3:4  | 768×1024           | 1140×1472       |
| 16:9 | 1280×720           | 1664×928        |
| 9:16 | 720×1280           | 928×1664        |

优先采用成对显式 width/height，其次按 aspectRatio 映射，最后使用已有 IMAGE_SIZE。显式尺寸与比例误差不能超过 4%。Kolors 自定义尺寸限每边 512～1440、16 的倍数；Qwen 当前仅接受上表尺寸。未知模型或不支持组合明确拒绝，不退回正方形。API DTO 的数值范围覆盖推荐 Qwen 尺寸，最终能力限制由 Agent 映射校验。反馈优化保留已确认的画面参数。

按 SiliconFlow [Images API](https://docs.siliconflow.cn/docs/api/images-generations-post) 与 [更新记录](https://docs.siliconflow.cn/docs/release-notes/overview) 核对：2026-09-30 已移除 batch_size，因此四候选通过四次单图请求生成。任一请求失败会报错，不伪造不足四张的成功结果；远程请求已发出时可能产生部分计费，应在授权的真实联调时关注。

每张候选使用随机候选 ID，持久化实际 model、seed、prompt、negativePrompt 和映射后的 generationConfig（含请求尺寸、步数及适用的 guidanceScale）。种子预留连续四张范围。日志仅记录模型、尺寸、种子与数量，不记录密钥或完整 Prompt。

对象键为 `workflows/<userId>/<workflowId>/runs/<runVersion>/candidates/<candidateId>.png`；重跑、反馈优化均生成新键。评分、推荐及候选选择继续使用原 contracts。Demo 生成真实 PNG 字节，尺寸和种子与 metadata 一致，模型标记为 Demo Provider。

## 下载与作品

新增 `POST /workflow/:id/candidates/:candidateId/download`（同样支持 `/workflows`），按本人工作流、当前轮候选 ID 与可信对象键签发十分钟下载地址，设置附件文件名。不要求已选定最终候选；他人或过期候选拒绝访问。

工作台预览使用当前 candidateId 下载。最终结果弹窗与正式导出均使用 `POST /works/:id/export`，签名携带附件文件名，避免跨域下载变成页面跳转。浏览器验收发现并修复作品列表填充 creatorId 后误用用户文档构造对象键的问题；签名仍使用 Mongoose 保存的原始创建者 ID，外来对象继续被拒绝。

接口说明及可填写示例见 `apps/api/API.md`、`apps/api/rest-client/workflow.http`。本次没有新增依赖、修改锁文件、创建 Conda 环境或修改本地 .env。

## 已执行验证

| 检查                                                | 结果                                                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @brand-flow/agent test`              | 26 项通过；覆盖两种比例的真实请求体映射、四次单图请求、视觉模型图片输入及异常输出、Demo 参数一致性         |
| `pnpm --filter @brand-flow/contracts test`          | 11 项通过                                                                                                  |
| `pnpm --filter @brand-flow/api test -- --runInBand` | 12 套、75 项通过；覆盖参考归属与执行时校验、DTO、候选下载、填充创建者后的作品签名及正式导出附件文件名      |
| `pnpm --filter @brand-flow/web test`                | Vitest 31 项及原生 SSE 1 项通过；包含参考选择/上限/失败重试、指定候选下载及失败后恢复                      |
| `pnpm build`                                        | Contracts、Agent、API、Web 四包通过                                                                        |
| Web、Contracts lint及所有 API/Agent 改动文件 lint   | 通过                                                                                                       |
| `pnpm lint`、API/Agent 完整 lint                    | 存量阻塞：API 109、Agent 231 项错误；30 个报错源文件与 HEAD 对照，忽略换行差异后完全一致，未增加本阶段错误 |

浏览器验收命令：`node scripts/smoke-workflow-browser.cjs mongodb://127.0.0.1:27018 <已有运行时 node_modules 路径> create`。复用现有 Node 24、Playwright 与本机 Edge，真实 JWT、Mongo 8.0、Redis 8、BullMQ、Controller/Service 和页面。创建独立临时数据库，Redis 6381 须为专用空队列，结束清理连接、数据库与队列。

两轮首页选择知识与产品参考，1:1/16:9 分别生成 1024×1024 与 1280×720 四候选，未选择最终候选前下载当前预览，纯图链路通过 finalEvaluation 并保存作品，正式作品从 Work/Export 下载真实 PNG，跨执行版本对象键不重复；16:9 反馈优化后保持原比例。另验证他人不能引用个人素材、Logo 来源保留。真实 HTTP Provider 请求未发送；参数请求体及视觉调用由自动化替身验证。

MinIO Docker Hub 镜像拉取被拒绝，Quay 镜像返回 401，本次浏览器对象存储使用测试替身，实际执行图片上传、读取、候选持久化和下载字节链路。真实 MinIO 的签名、过期与网络兼容尚未验证；获得可用镜像或本地服务后应补验。未调用付费 SiliconFlow 或 Pinecone。现有 Ant Design/React Flow 提示及构建大 chunk 提示未在本阶段扩展处理。

## Git

03 已按用户要求提交为 `3b53aa9 feat(workflow): 增强状态机任务恢复与执行幂等`。04 已完成上述验收，并按用户后续要求单独提交；05 在其后实施。本次未推送 02/03/04。
