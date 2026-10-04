# V1.5 图文合成、Revision 与作品版本验收

对应执行包 `V1-个人创作闭环/05-图文合成版本作品与质检闭环.md`，实施日期：2026-10-04。

## 合成与画布

纯图分支继续将 compose 标记为 skipped，不进入图文编辑。图文分支支持底图、四个艺术字候选、选择、框选或拖动缩放区域、计算放置方案、上传正式 PNG。已验证的 compose_logo 素材以原图叠加于右上方，每张使用独立 Logo 图层，记录 assetId、归一化区域和锁定状态。

每次挂载创建独立 DOM canvas 与 Fabric 实例；卸载先中止图片请求、移除事件和待渲染任务，再异步 dispose。容器尺寸有效后才初始化，图片尺寸为零时显示可重试错误。候选切换、URL 切换和 StrictMode 不复用尚在释放的画布。

真实浏览器复现并修复了三个具体阻塞：未定义 strokeWidth 导致 Fabric 缓存尺寸 NaN；Fabric 7 默认中心原点导致底图与图层偏移；默认 JSON 请求头导致 FormData 未上传 PNG 文件。对象坐标显式声明原点，描边使用数值默认值，合成 API 使用 multipart。艺术字阴影和描边裁切于用户确认区域；带裁切和子对象阴影的 Group 显式保留缓存，避免 Fabric 缺失裁切上下文。

服务端校验文件头、实际分辨率、可信底图、艺术字候选与放置方案；校验 Logo 来源、数量、去重、素材权限和区域。只有艺术字与已确认 Logo 区域可产生像素变化，不放宽底图篡改校验。Router 提供页面异常回退，合成区提供独立 ErrorBoundary 和重新打开入口。

## Revision 与不可变来源

初始结果标记 round=0；每次反馈优化创建新 Revision，并在 WorkflowResult.revision 保存 id/round/feedback。候选 metadata 保存 revisionId/revisionRound。Revision.result 保存本轮候选、合成和质检，质检通过才标记 completed；已完成 Revision 不再被当前工作流写回，未完成或失败轮次可继续。

候选沿用运行版本独立路径，合成使用 `workflows/用户/任务/runs/执行版本/composition/UUID.png`，保留历史来源对象。旧 Revision 读取时刷新结果图片的短时签名，只改变响应，不改写持久化快照。修正 Revision 和 WorkVersion 的关联 Schema 为真正的 ObjectId，避免 Mixed 类型使字符串查询查不到记录。

## 作品版本与质检

同一 Workflow 首次完成创建 Work 和 V1，后续优化完成自动追加 V2/V3。保存入口仅使用同用户、同 Space、completed 且质检通过的可信工作流，客户端图片、质检和归属字段不决定保存结果。

Work.versionCounter 原子分配版本号；currentVersionNo 只向更高版本推进，较慢请求不能覆盖最新成片。来源去重使用 workId/sourceWorkflowId/sourceObjectKey 唯一索引；并发重复提交返回已保存版本，并补偿删除本次多余上传对象。失败或重复竞争可能消耗号码并留下间隔，不复用已分配号码。旧作品首次追加时按已保存版本补齐计数；旧版本缺少的 Prompt/优化信息展示为未记录。

WorkVersion 保存独立 PNG 对象、来源对象键、执行版本、Revision ID、Prompt、优化反馈、节点、质检和时间。作品详情可点击版本查看这些内容，支持双版本图片与质检对比。指定版本导出接口为 `POST /works/:id/versions/:versionId/export`，校验版本所属作品、当前用户权限、对象路径与 PNG 头，下载名为 `标题-V版本号.png`。

工作台与详情页使用结构化质检展示总分、品牌一致性、需求符合度、构图、可读性、视觉质量、扣分问题与建议。finalEvaluation 未通过时工作流保持 awaiting_user，显示“当前结果不可交付”和继续优化入口，不触发作品保存或完成下载弹窗。

## 实际验证

| 验证                                    | 结果                                                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API 全量 Jest                           | 13 套、82 项通过，含可信来源、Space、一致性、并发计数、来源去重、关联 Schema、历史签名不改写快照、指定版本导出与权限                                       |
| Web Vitest `--maxWorkers=2`             | 16 套、36 项通过，含 StrictMode、URL 切换、卸载异步隔离、零尺寸、质检失败与版本切换/导出重试                                                               |
| Web 原生 SSE 测试                       | 1 项通过                                                                                                                                                   |
| Contracts / Agent 测试                  | 11 / 26 项通过                                                                                                                                             |
| `pnpm build`                            | Contracts、Agent、API、Web 四包成功                                                                                                                        |
| Web / Contracts lint、本次 API 修改文件 | 通过                                                                                                                                                       |
| API / Agent 完整 lint、`pnpm lint`      | API 102、Agent 231 项存量错误；28 个报错源文件与 04 提交对照，忽略换行后完全一致                                                                           |
| 开发构建真实 Edge                       | 纯图与图文、失败质检继续、艺术字与 Logo、两次优化三版本、旧 Revision 与图片字节不变、真实 Mongo 并发不同来源取得 V2/V3、重复保存、版本对比、逐版下载均通过 |
| production preview 真实 Edge            | 同一完整验收通过，无 Fabric 页面崩溃，PNG 文件头和版本附件名称正确                                                                                         |
| `git diff --check`                      | 通过                                                                                                                                                       |

默认高并发 Web 测试曾出现已有 CandidateDownloadButton 重试测试的时序失败；未修改或降低断言，限制为两个 worker 后全部通过。测试使用已有 Node 24，避免 Node 20 与现有 jsdom/undici 的兼容问题。

浏览器验证复用已有 Playwright 和本机 Edge，真实使用 JWT、Mongo 8.0、Redis 8、BullMQ、API Service 和页面。每次运行使用独立 Mongo 数据库与 BullMQ prefix，结束清理本次命名空间，不清空 Redis 全库。

```powershell
pnpm --filter @brand-flow/api build
pnpm --filter @brand-flow/web build
# 切换至已有 Node 24；runtimeModules 指向已有 Playwright 所在的 node_modules
node scripts/smoke-workflow-browser.cjs mongodb://127.0.0.1:27018 $runtimeModules compose
node scripts/smoke-workflow-browser.cjs mongodb://127.0.0.1:27018 $runtimeModules compose-preview
```

## 环境、部署与 Git

本次未新增依赖、未修改锁文件或本地 .env，未创建 Conda 环境。MinIO 镜像不可获取，浏览器使用对象存储替身并验证真实 PNG 字节读写；Provider 使用现有 Demo 模式，失败报告仅为测试注入。真实 MinIO 签名、过期、CORS 与付费模型质检尚未验证，部署前需补验。现有 Ant Design/React Flow 提示及构建大 chunk 提示仍存在。

部署时确保 WorkVersion 两个唯一索引已创建：workId/versionNo，以及仅含 sourceObjectKey 字符串记录的来源唯一索引。已有历史关联值为 ObjectId 的记录无需数据改写；缺少新快照字段的历史版本保留。保留的历史合成对象随 Revision/版本存续，未在本阶段引入额外对象垃圾回收任务。

按本次用户明确要求，04 已提交为 `3e37611 feat(create): 接入参考素材与真实生成参数`。05 已完成验收，按用户后续要求在 06 启动前单独提交；本次未推送。
