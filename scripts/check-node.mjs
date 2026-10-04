const major = Number(process.versions.node.split('.')[0])
if (major < 24) {
  console.error(`当前 Node ${process.versions.node} 不受支持，请使用 Node.js 24 LTS 或更新版本。`)
  process.exit(1)
}
