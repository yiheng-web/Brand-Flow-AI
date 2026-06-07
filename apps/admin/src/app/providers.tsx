import { ConfigProvider, App as AntdApp, theme } from 'antd'
import type { ReactNode } from 'react'
import { useUiStore } from '../stores/ui.store'

interface AppProvidersProps {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  const appTheme = useUiStore((state) => state.theme)

  return (
    <ConfigProvider
      theme={{
        algorithm: appTheme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        },
        components: {
          Layout: {
            bodyBg: '#f5f7fb',
            headerBg: '#ffffff',
            siderBg: '#101828',
          },
          Menu: {
            darkItemBg: '#101828',
            darkSubMenuItemBg: '#101828',
          },
        },
      }}
    >
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  )
}
