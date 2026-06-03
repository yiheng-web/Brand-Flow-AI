export interface UploadObjectInput {
  key: string
  body: Buffer
  contentType: string
  size?: number
  metadata?: Record<string, string>
}

export interface StoredObject {
  bucket: string
  key: string
  contentType: string
  size?: number
}

export interface SignedUrlOptions {
  expiresIn?: number
}

export interface StorageConfig {
  region: string
  endpoint: string
  port: number
  useSSL: boolean
  accessKey: string
  secretKey: string
  bucket: string
  signedUrlExpires: number
}
