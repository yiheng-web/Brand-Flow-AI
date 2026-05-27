import { Switch } from 'antd'

import styles from './SettingsPage.module.css'

export function SettingsPage() {
  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>系统设置</h1>
      <section className={styles.card}>
        <div className={styles.row}>
          <div>
            <div className={styles.label}>流式节点进度</div>
            <div className={styles.desc}>在工作台中实时展示 Agent 运行状态。</div>
          </div>
          <Switch defaultChecked />
        </div>
        <div className={styles.row}>
          <div>
            <div className={styles.label}>模型失败时启用本地 fallback</div>
            <div className={styles.desc}>缺少外部密钥时仍然可以完整演示 6 节点流程。</div>
          </div>
          <Switch defaultChecked />
        </div>
      </section>
    </div>
  )
}
