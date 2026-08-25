# Local Resume Performance Benchmark

本目录只包含本地 Benchmark 辅助代码，不连接真实后端、对象存储、模型服务或企业内网。

运行修复后完整基准并生成报告：

```powershell
pnpm benchmark:all
```

保留修复前证据时使用：

```powershell
$env:BENCHMARK_PHASE = 'before'
pnpm benchmark:resume
Remove-Item Env:BENCHMARK_PHASE
```

基准固定执行 3 次预热和 20 次有效测量。Agent Streaming 使用本地 Node HTTP SSE
Server；素材签名 URL 使用 50ms ± 10ms 固定 seed 的 Mock 延迟；任何外部服务均不会被调用。
