import { useState } from 'react'
import { Modal, Upload, message } from 'antd'
import type { UploadFile, UploadProps } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { uploadAsset, type OwnerType, type Visibility } from '@/api/assets'

const { Dragger } = Upload

interface AssetUploadModalProps {
  open: boolean
  onClose: () => void
  ownerId: string
  ownerType: OwnerType
  visibility: Visibility
  onSuccess: () => void
}

const AssetUploadModal = ({
  open,
  onClose,
  ownerId,
  ownerType,
  visibility,
  onSuccess,
}: AssetUploadModalProps) => {
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [uploading, setUploading] = useState(false)

  const handleUpload = async () => {
    if (fileList.length === 0) {
      message.warning('请先选择文件')
      return
    }

    setUploading(true)

    try {
      await Promise.all(
        fileList.map((item) => {
          if (!item.originFileObj) throw new Error(`文件 ${item.name} 无法读取`)
          return uploadAsset({
            file: item.originFileObj,
            name: item.name.replace(/\.[^.]+$/, ''),
            type: 'image',
            ownerId,
            ownerType,
            visibility,
          })
        }),
      )
      message.success(`${fileList.length} 个文件上传成功`)
      setFileList([])
      onClose()
      onSuccess()
    } catch {
      message.error('素材上传失败，未成功的文件可直接重试')
    } finally {
      setUploading(false)
    }
  }

  const uploadProps: UploadProps = {
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
    onChange: (info) => {
      setFileList(info.fileList)
    },
    onRemove: (file) => {
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
