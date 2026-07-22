import { Document } from '@langchain/core/documents'
import { Pinecone } from '@pinecone-database/pinecone'
import { PineconeStore } from '@langchain/pinecone'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { createOpenAIEmbeddings } from './common/openai-config'

export interface IngestMetadata {
  enterpriseId: string
  knowledgeId: string
  [key: string]: any
}

/**
 * 将长文本切片并存入 Pinecone 向量数据库
 * @param text 纯文本内容
 * @param metadata 必须包含 enterpriseId 和 knowledgeId 标签
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

  // 4. 使用与主工作流相同的 OpenAI 凭据生成向量
  const embeddings = createOpenAIEmbeddings()

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
 * @param filter 必须包含 enterpriseId 进行安全过滤
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

  const embeddings = createOpenAIEmbeddings()

  const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex,
    namespace: filter.knowledgeId,
    filter: {
      enterpriseId: filter.enterpriseId,
    },
  })

  const results = await vectorStore.similaritySearch(query, k)
  return results
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
