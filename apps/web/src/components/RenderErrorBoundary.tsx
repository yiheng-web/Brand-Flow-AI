import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { Alert, Button } from 'antd'

export default class RenderErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; attempt: number }
> {
  state = { failed: false, attempt: 0 }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('局部组件渲染失败', error, info.componentStack)
  }
  render() {
    if (this.state.failed)
      return (
        <Alert
          type="error"
          title="编辑区域暂时不可用"
          description="已保存的任务仍然保留，可以重新打开编辑器。"
          action={
            <Button
              onClick={() =>
                this.setState(({ attempt }) => ({ failed: false, attempt: attempt + 1 }))
              }
            >
              重新打开编辑器
            </Button>
          }
        />
      )
    return <div key={this.state.attempt}>{this.props.children}</div>
  }
}
