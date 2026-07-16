import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

// 引入全局样式，保证应用启动后基础样式立即生效。
import './index.css'
import { router } from './router'

// 创建 React 根节点，并把路由应用挂载到 index.html 中的 #root 容器。
createRoot(document.getElementById('root')!).render(
  // StrictMode 会在开发环境帮助发现潜在问题，不会影响生产环境渲染结果。
  <StrictMode>
    {/* RouterProvider 根据 router 配置渲染当前页面路由。 */}
    <RouterProvider router={router} />
  </StrictMode>,
)
