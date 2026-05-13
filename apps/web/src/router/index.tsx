import { createBrowserRouter, Navigate } from 'react-router-dom'
import AppLayout from '@/layouts/AppLayout'
import AuthLayout from '@/layouts/AuthLayout'
import Workspace from '@/pages/workspace/workspace'
import Home from '@/pages/home/home'
import LoginPage from '@/pages/login/login'
import ProfilePage from '@/pages/profile/profile'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <AuthLayout />,
    children: [{ index: true, element: <LoginPage /> }],
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/login" replace /> },
      { path: 'home', element: <Home /> },
      { path: 'workspace', element: <Workspace /> },
      { path: 'profile', element: <ProfilePage /> },
    ],
  },
])
