import type { ReactNode } from 'react'
import { Modal } from 'antd'

interface ModalShellProps {
  title: string
  open: boolean
  children: ReactNode
  confirmLoading?: boolean
  onCancel: () => void
  onOk?: () => void
}

export function ModalShell({
  title,
  open,
  children,
  confirmLoading,
  onCancel,
  onOk,
}: ModalShellProps) {
  return (
    <Modal
      cancelText="取消"
      confirmLoading={confirmLoading}
      okText="确认"
      open={open}
      title={title}
      onCancel={onCancel}
      onOk={onOk}
    >
      {children}
    </Modal>
  )
}
