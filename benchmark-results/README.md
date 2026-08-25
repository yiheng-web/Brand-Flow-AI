# Resume Benchmark Results

本目录由 `pnpm benchmark:all` 在本地生成。所有量化数据均来自实际运行，不连接外部服务。

## Files

- [environment.md](./environment.md)：硬件、运行时、commit 与边界。
- [raw-results.json](./raw-results.json)：修复后原始统计。
- [raw-results.before-fix.json](./raw-results.before-fix.json)：修复前失败证据。
- [benchmark-summary.md](./benchmark-summary.md)：完整方法、统计、解释与限制。
- [resume-metrics.md](./resume-metrics.md)：仅包含可安全写入简历的 Level B 数据。
- [interview-notes.md](./interview-notes.md)：面试追问说明。

## Reproduce

```powershell
pnpm install --frozen-lockfile
pnpm benchmark:all
```

修复前行为通过只读 legacy snapshot 重现；不会回退生产代码。Benchmark 默认 3 次预热、20 次有效运行。

## Outcome

- After PASS：5 项；After FAIL：0 项。
- 修复前发现：SSE 边界 2 个失败；契约解析错误接收未知事件。
- 简历数据证据等级：全部 Level B；没有 Level A 生产数据。
