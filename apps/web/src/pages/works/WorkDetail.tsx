import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button, Tag, Empty, Modal, message, Image, Collapse, Descriptions, Tooltip } from 'antd'
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  CloudUploadOutlined,
  EyeOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import {
  getWorkDetail,
  shareWork,
  downloadWork,
  retryWork,
  WORK_STATUS_MAP,
  SPACE_TYPE_MAP,
  type WorkData,
  type CandidateImage,
  type WorkVersion,
} from '@/api/work'
import styles from './works.module.css'

const { Panel } = Collapse

const WorkDetail = () => {
  const { workId } = useParams<{ workId: string }>()
  const navigate = useNavigate()

  const [work, setWork] = useState<WorkData | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [showQualityReport, setShowQualityReport] = useState(false)

  /* ============================
      加载作品详情
   ============================ */
  const loadWork = async () => {
    if (!workId) return
    setLoading(true)
    try {
      const res = await getWorkDetail(workId)
      setWork(res)
    } catch {
      console.warn('[MOCK] 使用模拟作品数据，后端接口未实现')
      setWork(getMockWork())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWork()
  }, [workId])

  /* ============================
      操作处理
   ============================ */
  const handleDownload = async () => {
    if (!workId) return
    try {
      const res = await downloadWork(workId)
      if (res?.url) {
        window.open(res.url, '_blank')
      }
      message.success('下载开始')
    } catch {
      console.warn('[MOCK] 下载模拟')
      message.success('下载已开始（模拟）')
    }
  }

  const handleShare = async () => {
    if (!workId) return
    Modal.confirm({
      title: '提交到创作空间',
      content: '提交后作品将共享给团队成员，是否确认？',
      okText: '确认提交',
      onOk: async () => {
        try {
          await shareWork(workId)
          message.success('已提交到创作空间')
          loadWork()
        } catch {
          console.warn('[MOCK] 提交模拟成功')
          message.success('已提交到创作空间（模拟）')
        }
      },
    })
  }

  const handleRetry = () => {
    if (!workId) return
    Modal.confirm({
      title: '重试生成',
      content: '将重新生成该作品，之前的结果将被覆盖。',
      okText: '确认重试',
      onOk: async () => {
        try {
          await retryWork(workId)
          message.success('已提交重试')
          loadWork()
        } catch {
          console.warn('[MOCK] 重试模拟成功')
          message.success('已提交重试（模拟）')
          setWork((prev) => (prev ? { ...prev, status: 'in_progress' } : null))
        }
      },
    })
  }

  const handleViewVersion = (version: WorkVersion) => {
    setPreviewImage(version.imageUrl)
  }

  /* ============================
      渲染候选图
   ============================ */
  const renderCandidateImage = (candidate: CandidateImage) => {
    const isRetry = candidate.isRetry
    const scoreColor =
      candidate.score >= 80 ? 'success' : candidate.score >= 60 ? 'warning' : 'error'

    return (
      <div
        key={candidate.id}
        className={`${styles.candidateCard} ${isRetry ? styles.candidateRetry : ''}`}
        onClick={() => !isRetry && setPreviewImage(candidate.imageUrl)}
      >
        {isRetry ? (
          <div className={styles.candidateRetryOverlay}>
            <ReloadOutlined />
            <span>重试</span>
          </div>
        ) : (
          <>
            <img src={candidate.imageUrl} alt="candidate" className={styles.candidateImg} />
            <div className={styles.candidateScore}>
              <Tag
                color={
                  scoreColor === 'success' ? 'green' : scoreColor === 'warning' ? 'orange' : 'red'
                }
              >
                {candidate.score} 分
              </Tag>
            </div>
          </>
        )}
      </div>
    )
  }

  /* ============================
      渲染
   ============================ */
  if (loading) {
    return <div className={styles.loadingText}>加载中...</div>
  }

  if (!work) {
    return (
      <div className={styles.detailWrapper}>
        <Empty description="作品不存在" />
      </div>
    )
  }

  const statusInfo = WORK_STATUS_MAP[work.status]

  return (
    <div className={styles.detailWrapper}>
      {/* 返回按钮 */}
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/works')}
        className={styles.backBtn}
      >
        返回作品列表
      </Button>

      {/* 作品头 */}
      <div className={styles.detailHeader}>
        <div className={styles.detailTitleRow}>
          <h1 className={styles.detailTitle}>{work.title}</h1>
          <Tag color={statusInfo?.color || 'default'}>{statusInfo?.text}</Tag>
        </div>
        <div className={styles.detailActions}>
          {work.status === 'completed' && (
            <>
              <Button icon={<DownloadOutlined />} onClick={handleDownload}>
                下载
              </Button>
              <Button type="primary" icon={<CloudUploadOutlined />} onClick={handleShare}>
                提交创作空间
              </Button>
            </>
          )}
          {work.status === 'failed' && (
            <Button type="primary" danger icon={<ReloadOutlined />} onClick={handleRetry}>
              重试生成
            </Button>
          )}
        </div>
      </div>

      {/* 最终图片 */}
      {work.finalImageUrl && (
        <div className={styles.detailSection}>
          <h3 className={styles.sectionTitle}>最终图片</h3>
          <div className={styles.finalImageWrapper}>
            <Image
              src={work.finalImageUrl}
              alt={work.title}
              className={styles.finalImage}
              onClick={() => setPreviewImage(work.finalImageUrl!)}
            />
          </div>
        </div>
      )}

      {/* 创作信息 */}
      <div className={styles.detailSection}>
        <h3 className={styles.sectionTitle}>创作信息</h3>
        <Descriptions column={1} size="small" labelStyle={{ color: '#9ca3af', width: 120 }}>
          <Descriptions.Item label="原始需求">
            <div className={styles.sourceText}>{work.source}</div>
          </Descriptions.Item>
          <Descriptions.Item label="创作空间">
            {SPACE_TYPE_MAP[work.spaceType]}
            {work.spaceName ? ` · ${work.spaceName}` : ''}
          </Descriptions.Item>
          {work.knowledgeBases.length > 0 && (
            <Descriptions.Item label="知识库">
              {work.knowledgeBases.map((kb) => (
                <Tag key={kb.id}>{kb.name}</Tag>
              ))}
            </Descriptions.Item>
          )}
          {work.rules.length > 0 && (
            <Descriptions.Item label="规则">
              {work.rules.map((r) => (
                <Tag key={r.id} color="blue">
                  {r.name}
                  {r.version ? `v${r.version}` : ''}
                </Tag>
              ))}
            </Descriptions.Item>
          )}
          {work.selectedConcept && (
            <Descriptions.Item label="所选创意方案">{work.selectedConcept}</Descriptions.Item>
          )}
          {work.finalPrompt && (
            <Descriptions.Item label="最终 Prompt">
              <Tooltip title={work.finalPrompt}>
                <div className={styles.promptText}>{work.finalPrompt}</div>
              </Tooltip>
            </Descriptions.Item>
          )}
          {work.layoutConfig && work.layoutConfig.texts.length > 0 && (
            <Descriptions.Item label="排版配置">
              <div className={styles.layoutConfig}>
                {work.layoutConfig.texts.map((t, i) => (
                  <div key={t.id} className={styles.layoutTextItem}>
                    <span className={styles.layoutTextIdx}>{i + 1}.</span>
                    <span>{t.content}</span>
                    {t.fontSize && <span className={styles.layoutFont}>({t.fontSize}px)</span>}
                  </div>
                ))}
              </div>
            </Descriptions.Item>
          )}
          <Descriptions.Item label="创建时间">{formatDateTime(work.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{formatDateTime(work.updatedAt)}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* 历史版本 */}
      {work.versions.length > 0 && (
        <div className={styles.detailSection}>
          <h3 className={styles.sectionTitle}>历史版本</h3>
          <div className={styles.versionList}>
            {work.versions
              .slice()
              .reverse()
              .map((ver) => (
                <div key={ver.id} className={styles.versionItem}>
                  <div className={styles.versionInfo}>
                    <span className={styles.versionLabel}>v{ver.version}</span>
                    <span className={styles.versionTitle}>{ver.title}</span>
                    <span className={styles.versionTime}>{formatDateTime(ver.createdAt)}</span>
                  </div>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => handleViewVersion(ver)}
                  >
                    查看
                  </Button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 候选图与质检报告 */}
      <div className={styles.detailSection}>
        <h3 className={styles.sectionTitle}>候选图与质检报告</h3>
        {work.candidateImages.length === 0 ? (
          <div className={styles.emptyState}>
            <Empty description="暂无候选图" />
          </div>
        ) : (
          <>
            <div className={styles.candidateGrid}>
              {work.candidateImages.map(renderCandidateImage)}
            </div>

            {/* 展开查看详细评分 */}
            {work.qualityReport && (
              <div className={styles.qualityReport}>
                <Button type="link" onClick={() => setShowQualityReport(!showQualityReport)}>
                  {showQualityReport
                    ? '收起详细评分'
                    : `展开查看详细评分（总分 ${work.qualityReport.overallScore}）`}
                </Button>
                {showQualityReport && (
                  <div className={styles.qualityDimensions}>
                    {work.qualityReport.dimensions.map((dim) => (
                      <div key={dim.name} className={styles.qualityDimension}>
                        <div className={styles.qualityDimHeader}>
                          <span>{dim.name}</span>
                          <Tag
                            color={dim.score >= 80 ? 'green' : dim.score >= 60 ? 'orange' : 'red'}
                          >
                            {dim.score}
                          </Tag>
                        </div>
                        {dim.comment && (
                          <div className={styles.qualityDimComment}>{dim.comment}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* 图片预览 */}
      <Image style={{ display: 'none' }} src={previewImage || ''} alt="preview" />
      {previewImage && (
        <Modal
          open={true}
          footer={null}
          onCancel={() => setPreviewImage(null)}
          width="auto"
          centered
          closable={true}
          styles={{ body: { padding: 0 } }}
        >
          <img
            src={previewImage}
            alt="preview"
            style={{ maxWidth: '90vw', maxHeight: '85vh', display: 'block' }}
          />
        </Modal>
      )}
    </div>
  )
}

// ============================
// 工具函数
// ============================

function formatDateTime(dateStr: string) {
  const date = new Date(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`
}

/** Mock 数据 */
function getMockWork(): WorkData {
  return {
    _id: 'w1',
    title: '夏季促销主视觉',
    status: 'completed',
    source: '为夏季 8 月促销活动设计主视觉 Banner，突出夏日清凉感和促销氛围',
    spaceType: 'team',
    spaceName: '设计部',
    knowledgeBases: [{ id: 'kb1', name: '品牌规范 v2.0' }],
    rules: [{ id: 'r1', name: '设计规范', version: 'v1.2' }],
    selectedConcept: '方案 B',
    finalPrompt:
      'A vibrant summer promotional banner with bright colors, beach elements, and bold typography',
    layoutConfig: {
      texts: [
        { id: 't1', content: '夏日狂欢季', fontSize: 48 },
        { id: 't2', content: '全场 5 折起', fontSize: 32 },
        { id: 't3', content: '8.1-8.31', fontSize: 24 },
      ],
    },
    finalImageUrl: 'https://picsum.photos/seed/work1-final/800/500',
    candidateImages: [
      { id: 'c1', imageUrl: 'https://picsum.photos/seed/c1/300/200', score: 85 },
      { id: 'c2', imageUrl: 'https://picsum.photos/seed/c2/300/200', score: 72 },
      { id: 'c3', imageUrl: 'https://picsum.photos/seed/c3/300/200', score: 68 },
      { id: 'c4', imageUrl: 'https://picsum.photos/seed/c4/300/200', score: 0, isRetry: true },
    ],
    qualityReport: {
      overallScore: 85,
      dimensions: [
        { name: '品牌一致性', score: 90, comment: '色彩和字体符合规范' },
        { name: '视觉冲击力', score: 88 },
        { name: '信息传达', score: 80 },
        { name: '排版布局', score: 82 },
      ],
    },
    versions: [
      {
        id: 'v3',
        workId: 'w1',
        version: 3,
        title: '最终版',
        imageUrl: 'https://picsum.photos/seed/w1v3/600/400',
        createdAt: '2026-08-01T14:00:00Z',
      },
      {
        id: 'v2',
        workId: 'w1',
        version: 2,
        title: '排版修改',
        imageUrl: 'https://picsum.photos/seed/w1v2/600/400',
        createdAt: '2026-08-01T13:00:00Z',
      },
      {
        id: 'v1',
        workId: 'w1',
        version: 1,
        title: '候选图',
        imageUrl: 'https://picsum.photos/seed/w1v1/600/400',
        createdAt: '2026-08-01T12:00:00Z',
      },
    ],
    isArchived: false,
    createdBy: 'user_1',
    createdByName: '张三',
    createdAt: '2026-08-01T10:00:00Z',
    updatedAt: '2026-08-01T14:00:00Z',
  }
}

export default WorkDetail
