import React from 'react'
import { useFlowStore } from '../../store/useFlowStore'
import { Button } from 'antd'

const Workspace: React.FC = () => {
  // 按需提取状态，Zustand 会自动处理性能优化
  const activeNodeId = useFlowStore((state) => state.activeNodeId)
  const setActiveNode = useFlowStore((state) => state.setActiveNode)

  return (
    <div>
      <Button type="primary" onClick={() => setActiveNode('node-1')}>
        选中节点 1
      </Button>
      <p>当前活动节点: {activeNodeId}</p>
    </div>
  )
}

export default Workspace
