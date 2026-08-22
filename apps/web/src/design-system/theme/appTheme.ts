import type { ThemeConfig } from 'antd'

import { colorTokens, motionTokens, radiusTokens, typographyTokens } from '../tokens'

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
    borderRadius: radiusTokens.control,
    borderRadiusLG: radiusTokens.card,
    controlHeight: 40,
    fontSize: typographyTokens.body,
    fontFamily:
      'Inter, "Google Sans", "Noto Sans SC", Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
    motionDurationFast: `${motionTokens.fast / 1000}s`,
    motionDurationMid: `${motionTokens.normal / 1000}s`,
    motionDurationSlow: `${motionTokens.slow / 1000}s`,
  },
  components: {
    Button: {
      borderRadius: radiusTokens.control,
      controlHeight: 40,
      fontWeight: 500,
      primaryShadow: 'none',
    },
    Card: {
      borderRadiusLG: radiusTokens.card,
      boxShadowTertiary: 'none',
    },
    Input: {
      borderRadius: radiusTokens.control,
      activeShadow: '0 0 0 3px rgba(11, 87, 208, 0.14)',
    },
    Modal: {
      borderRadiusLG: radiusTokens.panel,
    },
    Tooltip: {
      borderRadius: 8,
    },
  },
}
