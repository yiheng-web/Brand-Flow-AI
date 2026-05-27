import { createBrowserRouter, Navigate } from 'react-router-dom'

import AppLayout from '@/layouts/AppLayout'
import AuthLayout from '@/layouts/AuthLayout'
import { AssetsPage } from '@/pages/assets'
import { HomePage } from '@/pages/home'
import { LoginPage, RegisterPage } from '@/pages/login'
import { ProfilePage } from '@/pages/profile'
import { SettingsPage } from '@/pages/settings'
import { WorkspacePage } from '@/pages/workspace'

export const router = createBrowserRouter([
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
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate replace to="/home" /> },
      { path: 'home', element: <HomePage /> },
      { path: 'workspace', element: <WorkspacePage /> },
      { path: 'assets', element: <AssetsPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <Navigate replace to="/home" /> },
])
