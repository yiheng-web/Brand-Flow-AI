import { message } from 'antd'

export async function copyImageUrl(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    message.success('链接已复制')
  } catch {
    message.error('复制失败')
  }
}

export function downloadImage(url: string) {
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.download = 'brand-flow-result.png'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  message.info('若下载失败，将在新标签页打开图片')
  window.open(url, '_blank', 'noopener,noreferrer')
}
