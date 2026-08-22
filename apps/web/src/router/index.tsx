/* eslint-disable react-refresh/only-export-components */
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
 *     - /profile   → 个人中心
 */

import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import AuthGuard from '@/router/AuthGuard'
import AppLayout from '@/layouts/AppLayout'
import AuthLayout from '@/layouts/AuthLayout'
import Home from '@/pages/home/home'
import LoginPage from '@/pages/login/login'
import RegisterPage from '@/pages/login/register'
import { LoadingState } from '@/design-system/components'

const Workspace = lazy(() => import('@/pages/workspace/workspace'))
const BrandPage = lazy(() => import('@/pages/brand'))
const ProfilePage = lazy(() => import('@/pages/profile/profile'))
const KnowledgeListPage = lazy(() => import('@/pages/knowledge'))
const KnowledgeDetailPage = lazy(() => import('@/pages/knowledge/detail'))
const WorksPage = lazy(() => import('@/pages/works'))
const WorkDetailPage = lazy(() => import('@/pages/works/detail'))
const OrganizationPage = lazy(() => import('@/pages/organization'))
const deferred = (node: ReactNode) => <Suspense fallback={<LoadingState />}>{node}</Suspense>

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
          { path: 'workspace', element: deferred(<Workspace />) },
          { path: 'brand', element: deferred(<BrandPage />) },
          { path: 'knowledge', element: deferred(<KnowledgeListPage />) },
          { path: 'knowledge/:id', element: deferred(<KnowledgeDetailPage />) },
          { path: 'works', element: deferred(<WorksPage />) },
          { path: 'works/:id', element: deferred(<WorkDetailPage />) },
          { path: 'profile', element: deferred(<ProfilePage />) },
          { path: 'organization', element: deferred(<OrganizationPage />) },
        ],
      },
    ],
  },
])
