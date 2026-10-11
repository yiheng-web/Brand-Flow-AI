import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, Input, InputNumber, Modal, Select, Switch } from 'antd'
import type { CreateTaskRequest, TaskData } from '@brand-flow/contracts'
import { createTask, taskCommand } from '@/api/tasks'
import { getSpaceMembers } from '@/api/org'
import type { SpaceMemberData } from '@/api/org'
import { getKnowledgeList } from '@/api/knowledge'
import type { KnowledgeData } from '@/api/knowledge'
import { getAssets } from '@/api/assets'
import type { AssetData } from '@/api/assets'

type Fields = {
  title: string
  description?: string
  prompt: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  deadline?: string
  assigneeId?: string
  needsComposition: boolean
  channel?: string
  width?: number
  height?: number
  knowledgeIds?: string[]
  assetIds?: string[]
}
export default function TaskCreate({
  teamId,
  onClose,
  onCreated,
}: {
  teamId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [form] = Form.useForm<Fields>()
  const [members, setMembers] = useState<SpaceMemberData[]>([])
  const [knowledge, setKnowledge] = useState<KnowledgeData[]>([])
  const [assets, setAssets] = useState<AssetData[]>([])
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const busy = useRef(false)
  const savedTask = useRef<TaskData | undefined>(undefined)
  const [requestId] = useState(() => crypto.randomUUID())
  useEffect(() => {
    let active = true
    Promise.all([getSpaceMembers(teamId), getKnowledgeList(teamId), getAssets(teamId)])
      .then(([nextMembers, nextKnowledge, nextAssets]) => {
        if (active) {
          setMembers(nextMembers.filter((member) => member.role !== 'viewer'))
          setKnowledge(nextKnowledge)
          setAssets(nextAssets)
          setError(undefined)
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : '创建资料加载失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [teamId, revision])
  const handleSave = async (dispatch: boolean) => {
    if (busy.current) return
    busy.current = true
    setSaving(true)
    try {
      const values = await form.validateFields()
      if (dispatch && !values.assigneeId) {
        setError('正式派发请选择负责人')
        return
      }
      const body: CreateTaskRequest = {
        requestId,
        teamId,
        title: values.title.trim(),
        description: values.description,
        priority: values.priority,
        deadline: values.deadline ? new Date(values.deadline).toISOString() : undefined,
        requirementSnapshot: {
          prompt: values.prompt.trim(),
          needsComposition: values.needsComposition,
          channel: values.channel,
          generationConfig: { width: values.width, height: values.height },
          selectedKnowledgeBaseIds: values.knowledgeIds,
          references: values.assetIds?.map((assetId) => ({ assetId, role: 'style' })),
        },
      }
      const task = savedTask.current ?? (await createTask(body))
      savedTask.current = task
      if (dispatch) {
        try {
          await taskCommand(task, 'assign', { assigneeId: values.assigneeId })
        } catch (reason: unknown) {
          onCreated()
          setError(
            `草稿已保存，派发失败，请到详情重新派发：${reason instanceof Error ? reason.message : '请求失败'}`,
          )
          return
        }
      }
      onCreated()
      onClose()
    } catch (reason: unknown) {
      if (reason instanceof Error) setError(reason.message)
    } finally {
      busy.current = false
      setSaving(false)
    }
  }
  return (
    <Modal
      open
      title="创建团队任务"
      onCancel={saving ? undefined : onClose}
      footer={
        <>
          <Button disabled={saving || loading || !!error} onClick={() => void handleSave(false)}>
            保存草稿
          </Button>
          <Button
            type="primary"
            loading={saving}
            disabled={loading || !!error}
            onClick={() => void handleSave(true)}
          >
            正式派发
          </Button>
        </>
      }
    >
      {error && (
        <Alert
          type="error"
          title={error}
          action={
            <Button
              onClick={() => {
                setLoading(true)
                setRevision((value) => value + 1)
              }}
            >
              重新加载
            </Button>
          }
        />
      )}
      <Form
        form={form}
        layout="vertical"
        disabled={saving || loading}
        initialValues={{ priority: 'normal', needsComposition: false }}
      >
        <Form.Item name="title" label="标题" rules={[{ required: true, whitespace: true }]}>
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item name="description" label="说明">
          <Input.TextArea maxLength={5000} />
        </Form.Item>
        <Form.Item
          name="prompt"
          label="品牌与创作要求"
          rules={[{ required: true, whitespace: true }]}
        >
          <Input.TextArea />
        </Form.Item>
        <Form.Item name="assigneeId" label="负责人">
          <Select
            allowClear
            options={members.map((member) => ({
              value: member.userId,
              label: member.nickname || member.email,
            }))}
          />
        </Form.Item>
        <Form.Item name="priority" label="优先级">
          <Select
            options={['low', 'normal', 'high', 'urgent'].map((value) => ({ value, label: value }))}
          />
        </Form.Item>
        <Form.Item name="deadline" label="截止时间">
          <Input type="datetime-local" />
        </Form.Item>
        <Form.Item name="channel" label="投放渠道">
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item name="needsComposition" label="图文输出" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="width" label="输出宽度">
          <InputNumber min={512} max={2048} />
        </Form.Item>
        <Form.Item name="height" label="输出高度">
          <InputNumber min={512} max={2048} />
        </Form.Item>
        <p>企业和团队强制知识会自动继承。</p>
        <Form.Item name="knowledgeIds" label="附加知识库">
          <Select
            mode="multiple"
            maxCount={3}
            options={knowledge
              .filter((item) => !item.isRequired)
              .map((item) => ({ value: item._id, label: item.name }))}
          />
        </Form.Item>
        <Form.Item name="assetIds" label="风格参考素材">
          <Select
            mode="multiple"
            maxCount={4}
            options={assets.map((item) => ({ value: item._id, label: item.name }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
