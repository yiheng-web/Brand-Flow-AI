import { useEffect, useState } from 'react'
import { Button, Checkbox, Image, Select, Space, Typography } from 'antd'
import type { WorkflowReferenceInput } from '@brand-flow/contracts'
import { getAssets } from '@/api/assets'
import type { AssetData } from '@/api/assets'
import { EmptyState, ErrorState, LoadingState } from '@/design-system/components'
import styles from './ReferencePicker.module.css'

const ROLES = [
  { value: 'product', label: '产品' },
  { value: 'person', label: '人物' },
  { value: 'style', label: '风格' },
  { value: 'logo', label: 'Logo（后期合成）' },
]

export default function ReferencePicker({
  value,
  onChange,
  disabled,
}: {
  value: WorkflowReferenceInput[]
  onChange: (references: WorkflowReferenceInput[]) => void
  disabled: boolean
}) {
  const [assets, setAssets] = useState<AssetData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    getAssets('personal')
      .then((response) => {
        if (active) {
          setAssets(
            response.filter(
              (asset) =>
                asset.objectKey &&
                ['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType ?? ''),
            ),
          )
          setError(null)
          setLoading(false)
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : '素材加载失败')
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [attempt])
  if (loading) return <LoadingState label="正在加载个人参考素材…" />
  if (error)
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setLoading(true)
          setAttempt((number) => number + 1)
        }}
      />
    )
  return (
    <Space orientation="vertical" className={styles.picker}>
      <Typography.Text type="secondary">
        参考图用于提取视觉特征，不保证像素级还原。Logo 保留原素材供后续合成。
      </Typography.Text>
      {!assets.length && (
        <EmptyState description="暂无可用参考图片，请先在品牌素材中上传 PNG、JPEG 或 WebP" />
      )}
      {assets.map((asset) => {
        const selection = value.find((reference) => reference.assetId === asset._id)
        return (
          <Space key={asset._id} wrap>
            <Checkbox
              aria-label={`参考素材 ${asset.name}`}
              checked={Boolean(selection)}
              disabled={disabled || (!selection && value.length >= 4)}
              onChange={() =>
                onChange(
                  selection
                    ? value.filter((reference) => reference.assetId !== asset._id)
                    : [...value, { assetId: asset._id, role: 'product' }],
                )
              }
            >
              {asset.name}
            </Checkbox>
            <Image width={48} src={asset.signedUrl ?? asset.url} alt={asset.name} />
            {selection && (
              <Select
                aria-label={`${asset.name}参考用途`}
                value={selection.role}
                options={ROLES}
                disabled={disabled}
                onChange={(role) =>
                  onChange(
                    value.map((reference) =>
                      reference.assetId === asset._id ? { ...reference, role } : reference,
                    ),
                  )
                }
              />
            )}
          </Space>
        )
      })}
      <Button disabled={disabled} onClick={() => onChange([])}>
        清空参考素材
      </Button>
    </Space>
  )
}
