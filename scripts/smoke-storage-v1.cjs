const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { resolve } = require('node:path')
const { randomBytes } = require('node:crypto')
const apiRequire = createRequire(resolve(__dirname, '../apps/api/package.json'))
const { ConfigService } = apiRequire('@nestjs/config')
const { StorageService } = apiRequire('./dist/modules/storage/storage.service')
const { startS3Fixture } = require('./garage-fixture.cjs')

async function main() {
  const access = `GK${randomBytes(16).toString('hex')}`
  const secret = randomBytes(32).toString('hex')
  const fixture = await startS3Fixture(access, secret, 'v1-test')
  const storage = new StorageService(
    new ConfigService({
      MINIO_ENDPOINT: '127.0.0.1',
      MINIO_PORT: fixture.port,
      MINIO_ACCESS_KEY: access,
      MINIO_SECRET_KEY: secret,
      MINIO_BUCKET: 'v1-test',
      MINIO_REGION: 'us-east-1',
    }),
  )
  const key = '个人空间/签名测试.png'
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 42])
  try {
    await storage.checkReady()
    await storage.uploadObject({ key, body: bytes, contentType: 'image/png' })
    const url = await storage.getSignedUrl(key, { downloadName: '作品-V1.png' })
    const full = await fetch(url)
    assert.equal(full.status, 200)
    assert.deepEqual(Buffer.from(await full.arrayBuffer()), bytes)
    assert.match(full.headers.get('content-disposition'), /attachment/)
    const range = await fetch(url, { headers: { Range: 'bytes=0-7' } })
    assert.equal(range.status, 206)
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(0, 8))
    const tampered = new URL(url)
    tampered.searchParams.set('X-Amz-Expires', '10000')
    assert.equal((await fetch(tampered)).status, 403)
    assert.equal(
      (await fetch(`http://127.0.0.1:${fixture.port}/v1-test/${encodeURIComponent(key)}`)).status,
      403,
    )
    const short = await storage.getSignedUrl(key, { expiresIn: 2 })
    assert.equal((await fetch(short)).status, 200)
    await new Promise((done) => setTimeout(done, 2500))
    const expired = await fetch(short)
    assert.equal(expired.status, 400)
    assert.match(await expired.text(), /Date is too old/)
    await storage.deleteObject(key)
    assert.equal((await fetch(await storage.getSignedUrl(key))).status, 404)
    console.log(
      'PASS：真实AWS SDK经HTTP访问Garage v2.3.0真实S3兼容服务：私有访问、SigV4、Range、篡改拒绝、到期和删除；生产MinIO/S3待联调',
    )
  } finally {
    storage.client.destroy()
    await fixture.close()
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
