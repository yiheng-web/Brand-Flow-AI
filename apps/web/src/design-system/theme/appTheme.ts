import type { ThemeConfig } from 'antd'

import { colorTokens, motionTokens } from '../tokens'

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: colorTokens.primary,
    colorInfo: colorTokens.info,
    colorSuccess: colorTokens.success,
    colorWarning: colorTokens.warning,
    colorError: colorTokens.error,
    colorText: colorTokens.textPrimary,
    colorTextSecondary: colorTokens.textSecondary,
    colorBorder: colorTokens.border,
    colorBgBase: colorTokens.pageBackground,
    colorBgContainer: colorTokens.surface,
    borderRadius: 10,
    borderRadiusLG: 16,
    controlHeight: 40,
    fontSize: 14,
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    motionDurationFast: `${motionTokens.fast / 1000}s`,
    motionDurationMid: `${motionTokens.normal / 1000}s`,
    motionDurationSlow: `${motionTokens.slow / 1000}s`,
  },
  components: {
    Button: {
      borderRadius: 10,
      controlHeight: 40,
      fontWeight: 500,
      primaryShadow: 'none',
    },
    Card: {
      borderRadiusLG: 16,
      boxShadowTertiary: 'none',
    },
    Input: {
      borderRadius: 10,
      activeShadow: '0 0 0 3px rgba(11, 87, 208, 0.14)',
    },
    Modal: {
      borderRadiusLG: 20,
    },
    Tooltip: {
      borderRadius: 8,
    },
  },
}
