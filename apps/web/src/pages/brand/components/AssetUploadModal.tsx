import { useState } from 'react'
import { Modal, Upload, message } from 'antd'
import { InboxOutlined } from '@ant-design/icons'

const { Dragger } = Upload

interface AssetUploadModalProps {
  open: boolean
  onClose: () => void
}

const AssetUploadModal = ({ open, onClose }: AssetUploadModalProps) => {
  const [fileList, setFileList] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)

  const handleUpload = async () => {
    if (fileList.length === 0) {
      message.warning('请先选择文件')
      return
    }

    setUploading(true)

    const formData = new FormData()
    fileList.forEach((file) => {
      formData.append('files', file.originFileObj || file)
    })

    // TODO: POST /api/assets/upload
    console.log('上传图片素材:', fileList)
    // const res = await api.uploadAssets(formData)

    // 模拟上传
    await new Promise((resolve) => setTimeout(resolve, 1000))

    message.success(`${fileList.length} 个文件上传成功`)
    setFileList([])
    setUploading(false)
    onClose()
  }

  const uploadProps = {
    name: 'file',
    multiple: true,
    accept: 'image/*',
    fileList,
    beforeUpload: (file: File) => {
      // 限制图片大小 10MB
      const isLt10M = file.size / 1024 / 1024 < 10
      if (!isLt10M) {
        message.error('图片大小不能超过 10MB')
        return Upload.LIST_IGNORE
      }
      return false // 阻止自动上传
    },
    onChange: (info: any) => {
      setFileList(info.fileList)
    },
    onRemove: (file: any) => {
      setFileList((prev) => prev.filter((f) => f.uid !== file.uid))
    },
  }

  return (
    <Modal
      title="上传图片素材"
      open={open}
      onCancel={onClose}
      onOk={handleUpload}
      confirmLoading={uploading}
      okText="上传"
      cancelText="取消"
      destroyOnClose
      width={520}
    >
      <Dragger {...uploadProps}>
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
        <p className="ant-upload-hint">支持单个或批量上传，图片大小不超过 10MB</p>
      </Dragger>
    </Modal>
  )
}

export default AssetUploadModal
