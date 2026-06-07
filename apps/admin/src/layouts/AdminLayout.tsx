import {
  AuditOutlined,
  BankOutlined,
  BarChartOutlined,
  DashboardOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Avatar, Button, Dropdown, Layout, Menu, Space, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth.store'
import { useUiStore } from '../stores/ui.store'

const { Header, Content, Sider } = Layout

const menuItems = [
  {
    key: '/dashboard',
    icon: <DashboardOutlined />,
    label: 'Dashboard',
    permission: 'admin.dashboard.read',
  },
  { key: '/users', icon: <UserOutlined />, label: '用户管理', permission: 'admin.users.read' },
  {
    key: '/enterprises',
    icon: <BankOutlined />,
    label: '企业管理',
    permission: 'admin.enterprises.read',
  },
  {
    key: '/review-queue',
    icon: <TeamOutlined />,
    label: '审核队列',
    permission: 'admin.review.read',
  },
  { key: '/quota', icon: <BarChartOutlined />, label: '额度管理', permission: 'admin.quota.read' },
  {
    key: '/audit-logs',
    icon: <AuditOutlined />,
    label: '审计日志',
    permission: 'admin.audit.read',
  },
  {
    key: '/settings',
    icon: <SettingOutlined />,
    label: '系统配置',
    permission: 'admin.settings.read',
  },
]

export function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const collapsed = useUiStore((state) => state.collapsed)
  const setCollapsed = useUiStore((state) => state.setCollapsed)
  const adminUser = useAuthStore((state) => state.adminUser)
  const permissions = useAuthStore((state) => state.permissions)
  const logout = useAuthStore((state) => state.logout)

  const visibleMenuItems = menuItems
    .filter((item) => permissions.includes('*') || permissions.includes(item.permission))
    .map(({ permission: _permission, ...item }) => item)

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key)
  }

  const userMenu: MenuProps['items'] = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => {
        logout()
        navigate('/login')
      },
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsed={collapsed} width={232} breakpoint="lg">
        <div style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 20px' }}>
          <Typography.Text style={{ color: '#fff', fontWeight: 700 }}>
            {collapsed ? 'BF' : 'Brand-Flow Admin'}
          </Typography.Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={visibleMenuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            height: 56,
            padding: '0 20px',
            borderBottom: '1px solid #eaecf0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <Dropdown menu={{ items: userMenu }} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }}>
              <Avatar size="small" icon={<UserOutlined />} />
              <Typography.Text>{adminUser?.name ?? adminUser?.email ?? 'Admin'}</Typography.Text>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
