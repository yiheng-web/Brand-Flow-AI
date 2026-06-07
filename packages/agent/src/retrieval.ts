import { Document } from '@langchain/core/documents'
import { Pinecone } from '@pinecone-database/pinecone'
import { PineconeStore } from '@langchain/pinecone'
import { OpenAIEmbeddings } from '@langchain/openai'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

export interface IngestMetadata {
  enterpriseId?: string
  knowledgeId: string
  knowledgeBaseId?: string
  knowledgeItemId?: string
  scope?: 'personal' | 'team' | 'enterprise'
  ownerUserId?: string
  teamId?: string
  visibility?: 'private' | 'team' | 'enterprise'
  status?: string
  type?: string
  [key: string]: any
}

/**
 * 将长文本切片并存入 Pinecone 向量数据库
 * @param text 纯文本内容
 * @param metadata 必须包含 knowledgeId 标签，并建议包含 scope / visibility / status 等权限过滤字段
 */
export async function ingestDocument(text: string, metadata: IngestMetadata) {
  // 1. 初始化 Pinecone 客户端
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY as string,
  })
  const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME as string)

  // 2. 切片器：按 500 个字符切片，保留 100 字符重叠度防止切断句子
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 100,
  })

  const docs = await splitter.createDocuments([text])

  // 3. 为每一块打上归属标签
  const docsWithMetadata = docs.map((doc: Document) => ({
    ...doc,
    metadata,
  }))

  // 4. 初始化 Embedding 模型 (兼容 SiliconFlow)
  const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
    },
    // 默认使用硅基流动的向量模型，如果环境变量未配则回退
    modelName: process.env.EMBEDDING_MODEL_NAME || 'BAAI/bge-m3',
  })

  // 5. 调用 LangChain 存入 Pinecone
  await PineconeStore.fromDocuments(docsWithMetadata, embeddings, {
    pineconeIndex,
    namespace: metadata.knowledgeId, // 使用知识库 ID 作为命名空间，提升后续单一库的检索效率
  })

  return { success: true, chunks: docsWithMetadata.length }
}

/**
 * 从 Pinecone 检索相关知识
 * @param query 用户提问
 * @param filter 必须包含 knowledgeId，并可包含 enterpriseId / scope / status 等安全过滤字段
 * @param k 返回的切片数量
 */
export async function searchKnowledge(
  query: string,
  filter: IngestMetadata,
  k: number = 3,
): Promise<Document[]> {
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY as string,
  })
  const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME as string)

  const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
    },
    modelName: process.env.EMBEDDING_MODEL_NAME || 'BAAI/bge-m3',
  })

  const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex,
    namespace: filter.knowledgeId,
    filter: buildMetadataFilter(filter),
  })

  const results = await vectorStore.similaritySearch(query, k)
  return results
}

function buildMetadataFilter(filter: IngestMetadata) {
  const metadataFilter: Record<string, unknown> = {}

  for (const key of [
    'enterpriseId',
    'teamId',
    'ownerUserId',
    'knowledgeBaseId',
    'knowledgeItemId',
    'scope',
    'visibility',
    'status',
    'type',
  ]) {
    if (filter[key] !== undefined) {
      metadataFilter[key] = filter[key]
    }
  }

  return metadataFilter
}

/**
 * 遍历并拉取 Pinecone 对应 Namespace 的所有记录
 * @param knowledgeId 作为 namespace
 */
export async function listKnowledgeRecords(
  knowledgeId: string,
): Promise<Array<{ id: string; text: string; metadata: any }>> {
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY as string,
  })
  const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME as string)
  const ns = pineconeIndex.namespace(knowledgeId)

  // 1. 获取所有 Vector IDs
  let vectorIds: string[] = []
  try {
    const listResult = await ns.listPaginated()
    if (listResult.vectors) {
      vectorIds = listResult.vectors.map((v) => v.id).filter((id): id is string => id !== undefined)
    }
  } catch (e: any) {
    throw new Error(`列出 Pinecone 记录失败 (可能需开启 Serverless / 升级 SDK): ${e.message}`)
  }

  if (vectorIds.length === 0) return []

  // 2. 批量拉取详细数据 (含有 metadata.text)
  const fetchResult = await ns.fetch(vectorIds)

  const records = Object.values(fetchResult.records).map((record) => ({
    id: record.id,
    text: (record.metadata?.text as string) || '', // LangChain Store 通常把 pageContent 存在这里
    metadata: record.metadata as any,
  }))

  return records
}
