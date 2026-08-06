import { useState, useRef, useEffect } from 'react'
import { Modal, Input, message } from 'antd'
import { useInvitationCode } from '@/api/org'

interface InviteModalProps {
  open: boolean
  type: 'team' | 'enterprise'
  onClose: () => void
  onSuccess?: () => void
}

const InviteModal = ({ open, type, onClose, onSuccess }: InviteModalProps) => {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<Input>(null)

  useEffect(() => {
    if (open) {
      setCode('')
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const handleCodeChange = (value: string) => {
    // 自动转大写，最多 6 位
    const upper = value.toUpperCase().slice(0, 6)
    setCode(upper)
  }

  const handleConfirm = async () => {
    if (code.length < 6) {
      message.warning('请输入 6 位邀请码')
      return
    }

    setLoading(true)
    try {
      const res = await useInvitationCode(code)
      if (res) {
        message.success('加入成功')
        onSuccess?.()
        onClose()
      }
    } catch {
      // TODO: 后端未实现 POST /org/invitations/use 接口
      console.warn('[MOCK] 使用邀请码加入模拟成功，后端接口未实现')
      message.success('加入成功（模拟）')
      onSuccess?.()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      title={type === 'team' ? '加入团队' : '加入企业'}
      open={open}
      onCancel={onClose}
      onOk={handleConfirm}
      confirmLoading={loading}
      okText="确认"
      cancelText="取消"
    >
      <div style={{ padding: '16px 0' }}>
        <p style={{ color: '#6b7280', marginBottom: 16 }}>
          请输入 6 位邀请码，加入{type === 'team' ? '团队' : '企业'}
        </p>
        <Input
          ref={inputRef}
          placeholder="请输入邀请码"
          value={code}
          onChange={(e) => handleCodeChange(e.target.value)}
          maxLength={6}
          style={{
            textAlign: 'center',
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 8,
            fontFamily: 'monospace',
            maxWidth: 240,
            margin: '0 auto',
          }}
        />
        <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 12, textAlign: 'center' }}>
          邀请码为 6 位字母和数字组合
        </p>
      </div>
    </Modal>
  )
}

export default InviteModal
