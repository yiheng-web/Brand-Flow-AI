import type { ReactNode } from 'react'

import styles from '../workspace.module.css'

interface NodePanelFooterProps {
  children?: ReactNode
  rerunLabel?: string
  rerunDisabled?: boolean
  onReRun?: () => void | Promise<void>
}

const NodePanelFooter = ({
  children,
  rerunLabel = '重新运行该节点',
  rerunDisabled = false,
  onReRun,
}: NodePanelFooterProps) => {
  return (
    <div className={styles.rightFooter}>
      {children}
      <button
        type="button"
        className={styles.interceptBtn}
        disabled={rerunDisabled}
        onClick={() => {
          void onReRun?.()
        }}
      >
        {rerunLabel}
      </button>
    </div>
  )
}

export default NodePanelFooter
