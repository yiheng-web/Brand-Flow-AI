import { ConfigService } from '@nestjs/config'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { StorageService } from './storage.service'

jest.mock('@aws-sdk/client-s3')
jest.mock('@aws-sdk/s3-request-presigner')

type EnvMap = Record<string, string | undefined>

describe('StorageService', () => {
  const sendMock = jest.fn()

  const createConfigService = (overrides: EnvMap = {}): ConfigService => {
    const env: EnvMap = {
      MINIO_REGION: 'cn-shanghai',
      MINIO_ENDPOINT: '127.0.0.1',
      MINIO_PORT: '9000',
      MINIO_USE_SSL: 'false',
      MINIO_ACCESS_KEY: 'brandflow_admin',
      MINIO_SECRET_KEY: 'strong-password',
      MINIO_BUCKET: 'brand-flow-assets',
      MINIO_SIGNED_URL_EXPIRES: '900',
      ...overrides,
    }

    return {
      get: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(S3Client as jest.Mock).mockImplementation(() => ({
      send: sendMock,
    }))
    ;(PutObjectCommand as unknown as jest.Mock).mockImplementation((input: unknown) => ({
      command: 'PutObjectCommand',
      input,
    }))
    ;(DeleteObjectCommand as unknown as jest.Mock).mockImplementation((input: unknown) => ({
      command: 'DeleteObjectCommand',
      input,
    }))
    ;(GetObjectCommand as unknown as jest.Mock).mockImplementation((input: unknown) => ({
      command: 'GetObjectCommand',
      input,
    }))
    ;(getSignedUrl as jest.Mock).mockResolvedValue('signed-url')
  })

  it('creates an S3-compatible client for MinIO', () => {
    new StorageService(createConfigService())

    expect(S3Client).toHaveBeenCalledWith({
      region: 'cn-shanghai',
      endpoint: 'http://127.0.0.1:9000',
      forcePathStyle: true,
      credentials: {
        accessKeyId: 'brandflow_admin',
        secretAccessKey: 'strong-password',
      },
    })
  })

  it('uses https when MINIO_USE_SSL is true', () => {
    new StorageService(createConfigService({ MINIO_USE_SSL: 'true' }))

    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://127.0.0.1:9000',
      }),
    )
  })

  it('falls back to us-east-1 when MINIO_REGION is not configured', () => {
    new StorageService(createConfigService({ MINIO_REGION: undefined }))

    expect(S3Client).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'us-east-1',
      }),
    )
  })

  it('uploads an object to the configured bucket', async () => {
    const service = new StorageService(createConfigService())
    const body = Buffer.from('file')

    const result = await service.uploadObject({
      key: 'assets/personal/user_1/asset_1/original.png',
      body,
      contentType: 'image/png',
      size: body.length,
      metadata: { source: 'test' },
    })

    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: 'brand-flow-assets',
      Key: 'assets/personal/user_1/asset_1/original.png',
      Body: body,
      ContentType: 'image/png',
      Metadata: { source: 'test' },
    })
    expect(sendMock).toHaveBeenCalledWith({
      command: 'PutObjectCommand',
      input: {
        Bucket: 'brand-flow-assets',
        Key: 'assets/personal/user_1/asset_1/original.png',
        Body: body,
        ContentType: 'image/png',
        Metadata: { source: 'test' },
      },
    })
    expect(result).toEqual({
      bucket: 'brand-flow-assets',
      key: 'assets/personal/user_1/asset_1/original.png',
      contentType: 'image/png',
      size: body.length,
    })
  })

  it('deletes an object from the configured bucket', async () => {
    const service = new StorageService(createConfigService())

    await service.deleteObject('assets/test.png')

    expect(DeleteObjectCommand).toHaveBeenCalledWith({
      Bucket: 'brand-flow-assets',
      Key: 'assets/test.png',
    })
    expect(sendMock).toHaveBeenCalledWith({
      command: 'DeleteObjectCommand',
      input: {
        Bucket: 'brand-flow-assets',
        Key: 'assets/test.png',
      },
    })
  })

  it('generates a signed URL with the default expiration', async () => {
    const service = new StorageService(createConfigService())

    const url = await service.getSignedUrl('assets/test.png')

    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: 'brand-flow-assets',
      Key: 'assets/test.png',
    })
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      {
        command: 'GetObjectCommand',
        input: {
          Bucket: 'brand-flow-assets',
          Key: 'assets/test.png',
        },
      },
      { expiresIn: 900 },
    )
    expect(url).toBe('signed-url')
  })

  it('allows a custom signed URL expiration', async () => {
    const service = new StorageService(createConfigService())

    await service.getSignedUrl('assets/test.png', { expiresIn: 60 })

    expect(getSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      expiresIn: 60,
    })
  })

  it('reads an object prefix together with its MIME type', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    sendMock.mockResolvedValueOnce({
      ContentType: 'image/png',
      Body: { transformToByteArray: jest.fn().mockResolvedValue(bytes) },
    })
    const service = new StorageService(createConfigService())

    const result = await service.getObjectPrefix('works/final.png', 8)

    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: 'brand-flow-assets',
      Key: 'works/final.png',
      Range: 'bytes=0-7',
    })
    expect(result).toEqual({ contentType: 'image/png', bytes })
  })

  it('builds a path-style object URL', () => {
    const service = new StorageService(createConfigService())

    expect(service.getObjectUrl('assets/test.png')).toBe(
      'http://127.0.0.1:9000/brand-flow-assets/assets/test.png',
    )
  })

  it('returns the configured bucket name', () => {
    const service = new StorageService(createConfigService())

    expect(service.getBucket()).toBe('brand-flow-assets')
  })

  it('fails fast when required config is missing', () => {
    expect(() => new StorageService(createConfigService({ MINIO_BUCKET: undefined }))).toThrow(
      'Missing required storage config: MINIO_BUCKET',
    )
  })

  it('fails fast when numeric config is invalid', () => {
    expect(() => new StorageService(createConfigService({ MINIO_PORT: 'invalid' }))).toThrow(
      'Invalid numeric storage config: MINIO_PORT',
    )
  })
})
