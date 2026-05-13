import { createBrowserRouter, Navigate } from 'react-router-dom'
import BasicLayout from '@/layouts/BasicLayout'
import Workspace from '@/pages/workspace/workspace'
import Home from '@/pages/home/home'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <BasicLayout />,
    children: [
      { index: true, element: <Navigate to="home" replace /> },
      { path: 'home', element: <Home /> },
      { path: 'workspace', element: <Workspace /> },
    ],
  },
])
