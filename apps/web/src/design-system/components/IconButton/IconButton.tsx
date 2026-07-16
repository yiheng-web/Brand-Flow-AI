import type { ReactNode } from 'react'
import { Button, Tooltip } from 'antd'

interface IconButtonProps {
  label: string
  icon: ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'default' | 'primary' | 'text'
  size?: 'small' | 'middle' | 'large'
}

export const IconButton = ({
  label,
  icon,
  onClick,
  disabled,
  type = 'text',
  size = 'middle',
}: IconButtonProps) => (
  <Tooltip title={label}>
    <Button
      aria-label={label}
      icon={icon}
      onClick={onClick}
      disabled={disabled}
      type={type}
      size={size}
    />
  </Tooltip>
)
