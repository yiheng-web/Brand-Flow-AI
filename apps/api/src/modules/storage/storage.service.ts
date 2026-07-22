import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl as createSignedUrl } from '@aws-sdk/s3-request-presigner'
import { SignedUrlOptions, StoredObject, StorageConfig, UploadObjectInput } from './storage.types'

@Injectable()
export class StorageService {
  private readonly client: S3Client
  private readonly config: StorageConfig

  constructor(configService: ConfigService) {
    this.config = this.loadConfig(configService)
    this.client = new S3Client({
      region: this.config.region,
      endpoint: this.buildEndpoint(),
      // MinIO uses path-style URLs reliably in local and private deployments.
      // Example: http://127.0.0.1:9000/bucket/key
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.config.accessKey,
        secretAccessKey: this.config.secretKey,
      },
    })
  }

  async uploadObject(input: UploadObjectInput): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        Metadata: input.metadata,
      }),
    )

    return {
      bucket: this.config.bucket,
      key: input.key,
      contentType: input.contentType,
      size: input.size,
    }
  }

  async importRemotePng(
    sourceUrl: string,
    input: Omit<UploadObjectInput, 'body' | 'contentType' | 'size'>,
  ): Promise<StoredObject> {
    if (sourceUrl.startsWith('data:image/png;base64,')) {
      const body = Buffer.from(sourceUrl.slice('data:image/png;base64,'.length), 'base64')
      return this.assertAndUploadPng(body, input)
    }
    const url = new URL(sourceUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('远程图片地址协议不受支持')
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok) throw new Error(`下载生成图片失败: HTTP ${response.status}`)
    const declaredSize = Number(response.headers.get('content-length') || 0)
    const maxBytes = 20 * 1024 * 1024
    if (declaredSize > maxBytes) throw new Error('生成图片超过 20MB 限制')
    return this.assertAndUploadPng(Buffer.from(await response.arrayBuffer()), input)
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      }),
    )
  }

  async getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    })

    // Buckets stay private in production; callers receive short-lived URLs
    // only after the business module has completed its permission checks.
    return createSignedUrl(this.client, command, {
      expiresIn: options?.expiresIn ?? this.config.signedUrlExpires,
    })
  }

  getObjectUrl(key: string): string {
    return `${this.buildEndpoint()}/${this.config.bucket}/${key}`
  }

  async getObjectPrefix(
    key: string,
    byteLength: number,
  ): Promise<{ contentType?: string; bytes: Uint8Array }> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Range: `bytes=0-${Math.max(0, byteLength - 1)}`,
      }),
    )
    const bytes = response.Body ? await response.Body.transformToByteArray() : new Uint8Array()
    return { contentType: response.ContentType, bytes }
  }

  async getObject(key: string): Promise<{ contentType?: string; bytes: Uint8Array }> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    )
    const bytes = response.Body ? await response.Body.transformToByteArray() : new Uint8Array()
    return { contentType: response.ContentType, bytes }
  }

  getBucket(): string {
    return this.config.bucket
  }

  private loadConfig(configService: ConfigService): StorageConfig {
    // Fail fast on required storage credentials so boot errors are explicit.
    const endpoint = this.getRequiredConfig(configService, 'MINIO_ENDPOINT')
    const accessKey = this.getRequiredConfig(configService, 'MINIO_ACCESS_KEY')
    const secretKey = this.getRequiredConfig(configService, 'MINIO_SECRET_KEY')
    const bucket = this.getRequiredConfig(configService, 'MINIO_BUCKET')

    return {
      region: configService.get<string>('MINIO_REGION') || 'us-east-1',
      endpoint,
      accessKey,
      secretKey,
      bucket,
      port: this.getNumberConfig(configService, 'MINIO_PORT', 9000),
      useSSL: this.getBooleanConfig(configService, 'MINIO_USE_SSL', false),
      signedUrlExpires: this.getNumberConfig(configService, 'MINIO_SIGNED_URL_EXPIRES', 900),
    }
  }

  private async assertAndUploadPng(
    body: Buffer,
    input: Omit<UploadObjectInput, 'body' | 'contentType' | 'size'>,
  ) {
    const maxBytes = 20 * 1024 * 1024
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    if (body.length > maxBytes || !body.subarray(0, 8).equals(pngSignature)) {
      throw new Error('生成服务未返回有效 PNG 文件')
    }
    return this.uploadObject({ ...input, body, size: body.length, contentType: 'image/png' })
  }

  private buildEndpoint(): string {
    const protocol = this.config.useSSL ? 'https' : 'http'
    return `${protocol}://${this.config.endpoint}:${this.config.port}`
  }

  private getRequiredConfig(configService: ConfigService, key: string): string {
    const value = configService.get<string>(key)
    if (!value) {
      throw new Error(`Missing required storage config: ${key}`)
    }
    return value
  }

  private getNumberConfig(configService: ConfigService, key: string, defaultValue: number): number {
    const value = configService.get<string>(key)
    if (!value) {
      return defaultValue
    }

    const parsedValue = Number(value)
    if (Number.isNaN(parsedValue)) {
      throw new Error(`Invalid numeric storage config: ${key}`)
    }

    return parsedValue
  }

  private getBooleanConfig(
    configService: ConfigService,
    key: string,
    defaultValue: boolean,
  ): boolean {
    const value = configService.get<string>(key)
    if (!value) {
      return defaultValue
    }

    return value.toLowerCase() === 'true'
  }
}
