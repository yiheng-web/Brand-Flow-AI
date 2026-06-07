import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AdminLayout } from '../layouts/AdminLayout'
import { DashboardPage } from '../pages/DashboardPage'
import { EnterpriseDetailPage } from '../pages/EnterpriseDetailPage'
import { EnterprisesPage } from '../pages/EnterprisesPage'
import { LoginPage } from '../pages/LoginPage'
import { AuditLogsPage } from '../pages/AuditLogsPage'
import { QuotaPage } from '../pages/QuotaPage'
import { ReviewQueuePage } from '../pages/ReviewQueuePage'
import { SettingsPage } from '../pages/SettingsPage'
import { UserDetailPage } from '../pages/UserDetailPage'
import { UsersPage } from '../pages/UsersPage'
import { RequireAdminAuth } from './RequireAdminAuth'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <RequireAdminAuth>
        <AdminLayout />
      </RequireAdminAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'users/:userId', element: <UserDetailPage /> },
      { path: 'enterprises', element: <EnterprisesPage /> },
      { path: 'enterprises/:enterpriseId', element: <EnterpriseDetailPage /> },
      { path: 'review-queue', element: <ReviewQueuePage /> },
      { path: 'quota', element: <QuotaPage /> },
      { path: 'audit-logs', element: <AuditLogsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
])
