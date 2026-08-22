import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ArtTextCandidate,
  ArtTextCompositionDraft,
  ArtTextPlacementPlan,
  ArtTextRegion,
  CandidateImage,
  CompositionLayer,
} from '@brand-flow/contracts'
import type { TPointerEvent } from 'fabric'
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Input, Space, Spin, Tag, message } from 'antd'
import { Canvas, FabricImage, Gradient, Group, Rect, Shadow, StaticCanvas, Textbox } from 'fabric'

import {
  createPlacementPlan,
  generateArtTextCandidates,
  saveComposition,
  selectArtTextCandidate,
} from '@/api/workflow'
import { colorTokens } from '@/design-system/tokens'

import styles from './ArtTextComposer.module.css'

interface ArtTextComposerProps {
  workflowId: string
  baseCandidate: CandidateImage
  draft?: ArtTextCompositionDraft
  onChanged: () => Promise<void>
}

const DISPLAY_MAX_WIDTH = 760
const DISPLAY_MAX_HEIGHT = 560
const MIN_REGION_WIDTH = 0.08
const MIN_REGION_HEIGHT = 0.05

const getThemeColor = (name: string, fallback: string) => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function createTextObject(candidate: ArtTextCandidate, width: number, height: number): Textbox {
  const spec = candidate.vectorSpec
  const angle = ((spec.gradient?.angle ?? 90) * Math.PI) / 180
  const centerX = width / 2
  const centerY = height / 2
  const fill = spec.gradient
    ? new Gradient<'linear'>({
        type: 'linear',
        coords: {
          x1: centerX - (Math.cos(angle) * width) / 2,
          y1: centerY - (Math.sin(angle) * height) / 2,
          x2: centerX + (Math.cos(angle) * width) / 2,
          y2: centerY + (Math.sin(angle) * height) / 2,
        },
        colorStops: [
          { offset: 0, color: spec.gradient.from },
          { offset: 1, color: spec.gradient.to },
        ],
      })
    : spec.fill
  return new Textbox(candidate.textContent, {
    width,
    fontFamily: spec.fontFamily,
    fontWeight: spec.fontWeight,
    textAlign: spec.textAlign,
    fill,
    stroke: spec.stroke,
    strokeWidth: spec.strokeWidth,
    paintFirst: spec.stroke ? 'stroke' : 'fill',
    fontSize: Math.max(18, height * 0.42),
    lineHeight: 1.05,
    shadow: spec.shadow
      ? new Shadow({
          color: spec.shadow.color,
          blur: spec.shadow.blur,
          offsetX: spec.shadow.offsetX,
          offsetY: spec.shadow.offsetY,
        })
      : undefined,
  })
}

function createArtTextGroup(candidate: ArtTextCandidate, width: number, height: number) {
  const text = createTextObject(candidate, width, height)
  text.set({ left: 0, top: 0 })
  text.initDimensions()
  const decorations = (candidate.vectorSpec.decorations ?? []).flatMap((decoration, index) => {
    const offset = index * Math.max(4, height * 0.035)
    if (decoration.type === 'highlight') {
      return [
        new Rect({
          left: width * 0.04,
          top: height * 0.3 + offset,
          width: width * 0.92,
          height: height * 0.38,
          rx: height * 0.08,
          ry: height * 0.08,
          fill: decoration.color,
          opacity: 0.24,
        }),
      ]
    }
    if (decoration.type === 'line') {
      return [
        new Rect({
          left: width * 0.08,
          top: Math.max(0, height * 0.88 - offset),
          width: width * 0.84,
          height: Math.max(2, height * 0.035),
          rx: 2,
          ry: 2,
          fill: decoration.color,
        }),
      ]
    }
    const size = Math.max(5, height * 0.1)
    return [
      new Rect({
        left: width * 0.02 + offset,
        top: height * 0.12,
        width: size,
        height: size,
        angle: 45,
        fill: decoration.color,
      }),
      new Rect({
        left: width * 0.94 - offset,
        top: height * 0.72,
        width: size,
        height: size,
        angle: 45,
        fill: decoration.color,
      }),
    ]
  })
  const group = new Group([...decorations, text], {
    selectable: false,
    evented: false,
    subTargetCheck: false,
  })
  return { group, text }
}

function ArtTextPreview({ candidate }: { candidate: ArtTextCandidate }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const canvas = new StaticCanvas(ref.current, { width: 280, height: 120 })
    const { group } = createArtTextGroup(candidate, 244, 90)
    group.set({ left: 18, top: 15 })
    const scale = Math.min(1, 244 / Math.max(group.width, 1), 90 / Math.max(group.height, 1))
    group.scale(scale)
    canvas.add(group)
    canvas.renderAll()
    return () => {
      void canvas.dispose()
    }
  }, [candidate])

  return <canvas ref={ref} className={styles.previewCanvas} aria-label="艺术字候选预览" />
}

function dataUrlToFile(dataUrl: string): Promise<File> {
  return fetch(dataUrl)
    .then((response) => response.blob())
    .then((blob) => new File([blob], 'composition.png', { type: 'image/png' }))
}

export default function ArtTextComposer({
  workflowId,
  baseCandidate,
  draft,
  onChanged,
}: ArtTextComposerProps) {
  const canvasElementRef = useRef<HTMLCanvasElement>(null)
  const canvasRef = useRef<Canvas | null>(null)
  const regionObjectRef = useRef<Rect | null>(null)
  const safeMarginObjectRef = useRef<Rect | null>(null)
  const artTextObjectRef = useRef<Group | null>(null)
  const backplateObjectRef = useRef<Rect | null>(null)
  const originalSizeRef = useRef({ width: 1024, height: 1024 })
  const drawingRef = useRef<{ startX: number; startY: number } | null>(null)
  const regionModeRef = useRef(false)
  const [textContent, setTextContent] = useState(draft?.textContent ?? '')
  const [stylePrompt, setStylePrompt] = useState(draft?.stylePrompt ?? '')
  const [region, setRegion] = useState<ArtTextRegion | null>(
    draft?.region ?? draft?.placement?.region ?? null,
  )
  const [placement, setPlacement] = useState<ArtTextPlacementPlan | null>(draft?.placement ?? null)
  const [loading, setLoading] = useState(false)
  const [canvasReady, setCanvasReady] = useState(false)
  const selectedCandidate = useMemo(
    () => draft?.candidates.find((item) => item.id === draft.selectedArtTextCandidateId),
    [draft],
  )

  useEffect(() => {
    if (!canvasElementRef.current) return
    let disposed = false
    const canvas = new Canvas(canvasElementRef.current, {
      preserveObjectStacking: true,
      selection: false,
    })
    canvasRef.current = canvas

    const syncRegion = (rect: Rect) => {
      const width = canvas.getWidth()
      const height = canvas.getHeight()
      const next = {
        x: Math.max(0, rect.left / width),
        y: Math.max(0, rect.top / height),
        width: Math.min(1, rect.getScaledWidth() / width),
        height: Math.min(1, rect.getScaledHeight() / height),
      }
      next.x = Math.min(next.x, 1 - next.width)
      next.y = Math.min(next.y, 1 - next.height)
      setRegion(next)
      setPlacement(null)
    }

    const loadBase = async () => {
      const image = await FabricImage.fromURL(baseCandidate.imageUrl, { crossOrigin: 'anonymous' })
      if (disposed) return
      const originalWidth = image.width || 1024
      const originalHeight = image.height || 1024
      originalSizeRef.current = { width: originalWidth, height: originalHeight }
      const scale = Math.min(
        DISPLAY_MAX_WIDTH / originalWidth,
        DISPLAY_MAX_HEIGHT / originalHeight,
        1,
      )
      canvas.setDimensions({ width: originalWidth * scale, height: originalHeight * scale })
      image.set({
        left: 0,
        top: 0,
        scaleX: scale,
        scaleY: scale,
        selectable: false,
        evented: false,
      })
      canvas.add(image)
      canvas.sendObjectToBack(image)
      const safeMargin = new Rect({
        left: canvas.getWidth() * 0.05,
        top: canvas.getHeight() * 0.05,
        width: canvas.getWidth() * 0.9,
        height: canvas.getHeight() * 0.9,
        fill: 'transparent',
        stroke: getThemeColor('--color-white', colorTokens.white),
        strokeWidth: 1,
        strokeDashArray: [5, 5],
        opacity: 0.7,
        selectable: false,
        evented: false,
      })
      safeMarginObjectRef.current = safeMargin
      canvas.add(safeMargin)
      canvas.renderAll()
      setCanvasReady(true)
    }
    void loadBase().catch(() => message.error('底图加载失败，无法进入框选模式'))

    const handleMouseDown = (event: { e: TPointerEvent; target?: unknown }) => {
      if (!regionModeRef.current || event.target === regionObjectRef.current) return
      const point = canvas.getScenePoint(event.e)
      if (regionObjectRef.current) canvas.remove(regionObjectRef.current)
      if (artTextObjectRef.current) canvas.remove(artTextObjectRef.current)
      const rect = new Rect({
        left: point.x,
        top: point.y,
        width: 1,
        height: 1,
        fill: getThemeColor('--color-primary-shadow-soft', colorTokens.primaryOverlaySoft),
        stroke: getThemeColor('--color-primary', colorTokens.primary),
        strokeWidth: 2,
        strokeDashArray: [8, 6],
        lockRotation: true,
      })
      regionObjectRef.current = rect
      drawingRef.current = { startX: point.x, startY: point.y }
      canvas.add(rect)
      canvas.setActiveObject(rect)
    }
    const handleMouseMove = (event: { e: TPointerEvent }) => {
      const drawing = drawingRef.current
      const rect = regionObjectRef.current
      if (!drawing || !rect) return
      const point = canvas.getScenePoint(event.e)
      const x = Math.max(0, Math.min(point.x, canvas.getWidth()))
      const y = Math.max(0, Math.min(point.y, canvas.getHeight()))
      rect.set({
        left: Math.min(x, drawing.startX),
        top: Math.min(y, drawing.startY),
        width: Math.abs(x - drawing.startX),
        height: Math.abs(y - drawing.startY),
      })
      rect.setCoords()
      canvas.requestRenderAll()
    }
    const handleMouseUp = () => {
      const rect = regionObjectRef.current
      if (!drawingRef.current || !rect) return
      drawingRef.current = null
      regionModeRef.current = false
      if (
        rect.width / canvas.getWidth() < MIN_REGION_WIDTH ||
        rect.height / canvas.getHeight() < MIN_REGION_HEIGHT
      ) {
        canvas.remove(rect)
        regionObjectRef.current = null
        setRegion(null)
        message.warning('框选区域过小，请重新框选')
        return
      }
      syncRegion(rect)
    }
    const handleObjectModified = (event: { target?: unknown }) => {
      if (event.target !== regionObjectRef.current || !regionObjectRef.current) return
      const rect = regionObjectRef.current
      const minScaleX = (canvas.getWidth() * MIN_REGION_WIDTH) / Math.max(rect.width, 1)
      const minScaleY = (canvas.getHeight() * MIN_REGION_HEIGHT) / Math.max(rect.height, 1)
      const maxScaleX = canvas.getWidth() / Math.max(rect.width, 1)
      const maxScaleY = canvas.getHeight() / Math.max(rect.height, 1)
      rect.set({
        scaleX: Math.max(minScaleX, Math.min(rect.scaleX, maxScaleX)),
        scaleY: Math.max(minScaleY, Math.min(rect.scaleY, maxScaleY)),
      })
      const maxLeft = canvas.getWidth() - rect.getScaledWidth()
      const maxTop = canvas.getHeight() - rect.getScaledHeight()
      rect.set({
        left: Math.max(0, Math.min(rect.left, maxLeft)),
        top: Math.max(0, Math.min(rect.top, maxTop)),
      })
      rect.setCoords()
      syncRegion(rect)
    }
    canvas.on('mouse:down', handleMouseDown)
    canvas.on('mouse:move', handleMouseMove)
    canvas.on('mouse:up', handleMouseUp)
    canvas.on('object:modified', handleObjectModified)

    return () => {
      disposed = true
      canvas.dispose()
      canvasRef.current = null
    }
  }, [baseCandidate.id, baseCandidate.imageUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvasReady || !canvas || !region) return
    const existing = regionObjectRef.current
    if (existing) canvas.remove(existing)
    const rect = new Rect({
      left: region.x * canvas.getWidth(),
      top: region.y * canvas.getHeight(),
      width: region.width * canvas.getWidth(),
      height: region.height * canvas.getHeight(),
      fill: getThemeColor('--color-primary-shadow-soft', colorTokens.primaryOverlaySoft),
      stroke: getThemeColor('--color-primary', colorTokens.primary),
      strokeWidth: 2,
      strokeDashArray: [8, 6],
      lockRotation: true,
    })
    regionObjectRef.current = rect
    canvas.add(rect)
    canvas.renderAll()
  }, [canvasReady, region])

  const renderPlacedText = (plan: ArtTextPlacementPlan, candidate: ArtTextCandidate) => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (artTextObjectRef.current) canvas.remove(artTextObjectRef.current)
    if (backplateObjectRef.current) canvas.remove(backplateObjectRef.current)
    const regionWidth = plan.region.width * canvas.getWidth()
    const regionHeight = plan.region.height * canvas.getHeight()
    const { group, text } = createArtTextGroup(candidate, regionWidth, regionHeight)
    const radians = (Math.abs(plan.rotation) * Math.PI) / 180
    const rotatedWidth =
      Math.abs(group.width * Math.cos(radians)) + Math.abs(group.height * Math.sin(radians))
    const rotatedHeight =
      Math.abs(group.width * Math.sin(radians)) + Math.abs(group.height * Math.cos(radians))
    const fitScale =
      Math.min(
        1,
        regionWidth / Math.max(rotatedWidth, 1),
        regionHeight / Math.max(rotatedHeight, 1),
      ) * plan.scale
    const regionLeft = plan.region.x * canvas.getWidth()
    const regionTop = plan.region.y * canvas.getHeight()
    const originX = plan.horizontalAlign
    const originY = plan.verticalAlign === 'middle' ? 'center' : plan.verticalAlign
    group.set({
      left:
        plan.horizontalAlign === 'left'
          ? regionLeft
          : plan.horizontalAlign === 'right'
            ? regionLeft + regionWidth
            : regionLeft + regionWidth / 2,
      top:
        plan.verticalAlign === 'top'
          ? regionTop
          : plan.verticalAlign === 'bottom'
            ? regionTop + regionHeight
            : regionTop + regionHeight / 2,
      originX,
      originY,
      scaleX: fitScale,
      scaleY: fitScale,
      angle: plan.rotation,
      opacity: plan.opacity,
      globalCompositeOperation: plan.blendMode,
      selectable: false,
      evented: false,
    })
    text.set({ textAlign: plan.horizontalAlign })
    if (plan.contrastEnhancement?.type === 'shadow' && !candidate.vectorSpec.shadow) {
      text.set({
        shadow: new Shadow({
          color: plan.contrastEnhancement.color,
          blur: 16 * plan.contrastEnhancement.strength,
          offsetX: 3,
          offsetY: 4,
        }),
      })
    }
    if (plan.contrastEnhancement?.type === 'stroke') {
      text.set({
        stroke: plan.contrastEnhancement.color,
        strokeWidth: Math.max(
          candidate.vectorSpec.strokeWidth ?? 0,
          6 * plan.contrastEnhancement.strength,
        ),
        paintFirst: 'stroke',
      })
    }
    if (plan.contrastEnhancement?.type === 'backplate') {
      const backplate = new Rect({
        left: plan.region.x * canvas.getWidth(),
        top: plan.region.y * canvas.getHeight(),
        width: regionWidth,
        height: regionHeight,
        rx: 12,
        ry: 12,
        fill: plan.contrastEnhancement.color,
        opacity: Math.min(0.7, 0.25 + plan.contrastEnhancement.strength * 0.35),
        selectable: false,
        evented: false,
      })
      backplateObjectRef.current = backplate
      canvas.add(backplate)
    }
    artTextObjectRef.current = group
    canvas.add(group)
    group.setCoords()
    const bounds = group.getBoundingRect()
    const shiftX =
      bounds.left < regionLeft
        ? regionLeft - bounds.left
        : bounds.left + bounds.width > regionLeft + regionWidth
          ? regionLeft + regionWidth - (bounds.left + bounds.width)
          : 0
    const shiftY =
      bounds.top < regionTop
        ? regionTop - bounds.top
        : bounds.top + bounds.height > regionTop + regionHeight
          ? regionTop + regionHeight - (bounds.top + bounds.height)
          : 0
    group.set({ left: group.left + shiftX, top: group.top + shiftY })
    group.setCoords()
    if (regionObjectRef.current) canvas.bringObjectToFront(regionObjectRef.current)
    canvas.renderAll()
  }

  useEffect(() => {
    if (placement && selectedCandidate && canvasReady)
      renderPlacedText(placement, selectedCandidate)
  }, [placement, selectedCandidate, canvasReady])

  const handleGenerate = async () => {
    if (!textContent.trim()) return message.warning('请输入需要生成的文字')
    if (!stylePrompt.trim()) return message.warning('请输入期望的艺术字风格')
    setLoading(true)
    try {
      await generateArtTextCandidates(workflowId, {
        baseCandidateId: baseCandidate.id,
        textContent,
        stylePrompt,
      })
      await onChanged()
      message.success('已生成四个艺术字候选')
    } catch {
      await onChanged().catch(() => undefined)
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = async (candidate: ArtTextCandidate) => {
    setLoading(true)
    try {
      await selectArtTextCandidate(workflowId, candidate.id)
      setRegion(draft?.region ?? region)
      setPlacement(null)
      await onChanged()
    } catch {
      await onChanged().catch(() => undefined)
    } finally {
      setLoading(false)
    }
  }

  const handlePlan = async () => {
    if (!selectedCandidate || !region) return
    setLoading(true)
    try {
      const next = await createPlacementPlan(workflowId, selectedCandidate.id, region)
      setPlacement(next)
      renderPlacedText(next, selectedCandidate)
      await onChanged()
    } catch {
      // 选择与框选区域保留在本地，用户可以直接重新计算。
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    const canvas = canvasRef.current
    if (!canvas || !selectedCandidate || !placement || !artTextObjectRef.current) return
    setLoading(true)
    try {
      const regionObject = regionObjectRef.current
      const safeMarginObject = safeMarginObjectRef.current
      regionObject?.set({ visible: false })
      safeMarginObject?.set({ visible: false })
      canvas.discardActiveObject()
      canvas.renderAll()
      let file: File
      try {
        const multiplier = originalSizeRef.current.width / canvas.getWidth()
        file = await dataUrlToFile(canvas.toDataURL({ format: 'png', multiplier }))
      } finally {
        regionObject?.set({ visible: true })
        safeMarginObject?.set({ visible: true })
        canvas.renderAll()
      }
      const layers: CompositionLayer[] = []
      if (placement.contrastEnhancement?.type === 'backplate') {
        layers.push({
          id: 'backplate',
          type: 'backplate',
          name: '对比度底板',
          visible: true,
          locked: true,
          region: placement.region,
        })
      }
      layers.push(
        {
          id: 'background',
          type: 'background',
          name: '底图',
          visible: true,
          locked: true,
          region: { x: 0, y: 0, width: 1, height: 1 },
        },
        {
          id: 'art-text',
          type: 'art_text',
          name: '艺术字',
          visible: true,
          locked: false,
          region: placement.region,
          content: selectedCandidate.textContent,
          candidateId: selectedCandidate.id,
          vectorSpec: selectedCandidate.vectorSpec,
        },
      )
      const saved = await saveComposition(workflowId, {
        file,
        baseCandidateId: baseCandidate.id,
        selectedArtTextCandidateId: selectedCandidate.id,
        textContent: draft?.textContent ?? textContent,
        stylePrompt: draft?.stylePrompt ?? stylePrompt,
        placement,
        layers,
        width: originalSizeRef.current.width,
        height: originalSizeRef.current.height,
      })
      await onChanged()
      if (saved.finalEvaluation.passed) {
        message.success('真实 PNG 已生成、上传并通过品牌质检')
      } else {
        message.warning('PNG 已生成，但品牌质检未通过，请按建议调整区域或艺术字')
      }
    } catch {
      await onChanged().catch(() => undefined)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteRegion = () => {
    const canvas = canvasRef.current
    if (regionObjectRef.current) canvas?.remove(regionObjectRef.current)
    if (artTextObjectRef.current) canvas?.remove(artTextObjectRef.current)
    if (backplateObjectRef.current) canvas?.remove(backplateObjectRef.current)
    regionObjectRef.current = null
    artTextObjectRef.current = null
    backplateObjectRef.current = null
    setRegion(null)
    setPlacement(null)
  }

  return (
    <Spin spinning={loading} tip="AI 正在处理">
      <div className={styles.root}>
        <section className={styles.inputPanel}>
          <div>
            <h2>图文合成</h2>
            <p>文字内容会逐字保留，AI 仅生成受控样式和区域内放置参数。</p>
          </div>
          <Input.TextArea
            value={textContent}
            onChange={(event) => setTextContent(event.target.value)}
            placeholder="输入需要生成的文字，支持换行"
            maxLength={120}
            showCount
            autoSize={{ minRows: 2, maxRows: 5 }}
          />
          <Input.TextArea
            value={stylePrompt}
            onChange={(event) => setStylePrompt(event.target.value)}
            placeholder="期望的艺术字风格，例如：清爽冰感、圆润醒目、蓝白高光"
            maxLength={300}
            showCount
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
          <Button type="primary" icon={<ReloadOutlined />} onClick={() => void handleGenerate()}>
            {draft?.candidates.length ? '重新生成四个候选' : '生成四个候选'}
          </Button>
        </section>

        {draft?.candidates.length === 4 && (
          <section>
            <h3>选择艺术字</h3>
            <div className={styles.candidateGrid}>
              {draft.candidates.map((candidate) => (
                <Card
                  key={candidate.id}
                  className={
                    candidate.id === draft.selectedArtTextCandidateId ? styles.selected : ''
                  }
                  cover={<ArtTextPreview candidate={candidate} />}
                >
                  <p>{candidate.styleSummary}</p>
                  <Space wrap>
                    {candidate.dominantColors.map((color) => (
                      <Tag key={color} color={color}>
                        {color}
                      </Tag>
                    ))}
                  </Space>
                  <Button
                    block
                    type={candidate.id === draft.selectedArtTextCandidateId ? 'primary' : 'default'}
                    onClick={() => void handleSelect(candidate)}
                  >
                    {candidate.id === draft.selectedArtTextCandidateId ? '已选择' : '选择此艺术字'}
                  </Button>
                </Card>
              ))}
            </div>
          </section>
        )}

        {selectedCandidate && (
          <section>
            <div className={styles.canvasToolbar}>
              <div>
                <h3>框选放置区域</h3>
                <p>区域可拖拽和缩放；虚线框不会出现在最终 PNG 中。</p>
              </div>
              <Space wrap>
                <Button
                  onClick={() => {
                    regionModeRef.current = true
                    message.info('请在底图上拖拽框选')
                  }}
                >
                  开始框选
                </Button>
                <Button icon={<DeleteOutlined />} disabled={!region} onClick={handleDeleteRegion}>
                  删除区域
                </Button>
                <Button disabled={!region} onClick={() => void handlePlan()}>
                  AI 计算放置方案
                </Button>
              </Space>
            </div>
            <div className={styles.canvasShell}>
              <canvas ref={canvasElementRef} />
            </div>
            {!region && (
              <Alert type="info" showIcon message="请先点击“开始框选”，再在底图上拖拽区域" />
            )}
            {placement && (
              <div className={styles.confirmBar}>
                <span>
                  缩放 {placement.scale} · 旋转 {placement.rotation}° · {placement.horizontalAlign}
                </span>
                <Button type="primary" onClick={() => void handleExport()}>
                  确认合成并生成 PNG
                </Button>
              </div>
            )}
          </section>
        )}
      </div>
    </Spin>
  )
}
