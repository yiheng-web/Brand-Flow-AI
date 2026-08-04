/**
 * 应用路由配置
 *
 * 路由结构：
 * - /login     → AuthLayout + LoginPage    （登录页，不带侧边栏）
 * - /register  → AuthLayout + RegisterPage （注册页，不带侧边栏）
 * - /          → AuthGuard 鉴权守卫
 *   - 未登录  → 自动重定向到 /login
 *   - 已登录  → AppLayout 壳层
 *     - /home      → 首页
 *     - /workspace → 工作台
 *     - /brand     → 品牌档案
 *     - /tasks     → 任务空间（列表页）
 *     - /tasks/:id  → 任务详情
 *     - /works      → 作品空间（列表页）
 *     - /works/:id  → 作品详情
 *     - /notifications → 消息通知
 *     - /profile    → 个人中心
 */

import { createBrowserRouter, Navigate } from 'react-router-dom'
import AuthGuard from '@/router/AuthGuard'
import AppLayout from '@/layouts/AppLayout'
import AuthLayout from '@/layouts/AuthLayout'
import Workspace from '@/pages/workspace/workspace'
import BrandPage from '@/pages/brand'
import Home from '@/pages/home/home'
import LoginPage from '@/pages/login/login'
import RegisterPage from '@/pages/login/register'
import ProfilePage from '@/pages/profile/profile'
import TasksPage from '@/pages/tasks/tasks'
import TaskDetailPage from '@/pages/tasks/TaskDetail'
import WorksPage from '@/pages/works/works'
import WorkDetailPage from '@/pages/works/WorkDetail'
import NotificationsPage from '@/pages/notifications/notifications'

export const router = createBrowserRouter([
  /* 公开路由：无需登录即可访问 */
  {
    path: '/login',
    element: <AuthLayout />,
    children: [{ index: true, element: <LoginPage /> }],
  },
  {
    path: '/register',
    element: <AuthLayout />,
    children: [{ index: true, element: <RegisterPage /> }],
  },

  /* 受保护路由：需登录后才能访问，未登录自动跳转 /login */
  {
    path: '/',
    element: <AuthGuard />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/home" replace /> },
          { path: 'home', element: <Home /> },
          { path: 'workspace', element: <Workspace /> },
          { path: 'brand', element: <BrandPage /> },
          { path: 'tasks', element: <TasksPage /> },
          { path: 'tasks/:taskId', element: <TaskDetailPage /> },
          { path: 'works', element: <WorksPage /> },
          { path: 'works/:workId', element: <WorkDetailPage /> },
          { path: 'notifications', element: <NotificationsPage /> },
          { path: 'profile', element: <ProfilePage /> },
        ],
      },
    ],
  },
])
