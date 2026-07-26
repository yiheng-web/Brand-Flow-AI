import {
  StateGraph,
  END,
  START,
  Annotation,
} from "@langchain/langgraph";

import { createIntentChain, IntentOutput } from "./chains/intent-chain";
import { createPromptChain, PromptChainOutput } from "./chains/prompt-chain";
import { createPromptEvaluationChain } from "./evaluate/prompt-evaluate.chain";
import type { EvaluationResult } from "./evaluate/evaluate-types";
import type { GenerateResult } from "../generate/generate-types";
import { generateService } from "../generate";
import { brandService } from "../brand";
import { conversationMemory } from "./memory/conversation-memory";
import { logger } from "../common/logger";
import { searchKnowledge } from "../retrieval";

// ============================================================
// 1. AgentState（保留 as any，同时导出类型定义）
// ============================================================

export interface AgentStateType {
  userQuery: string;
  context: Record<string, any> | undefined;
  intentResult: IntentOutput | undefined;
  knowledgeContext: string | undefined;
  promptResult: PromptChainOutput | undefined;
  generateResult: GenerateResult | undefined;
  evaluationResult: EvaluationResult | undefined;
  retryCount: number;
  status: "running" | "success" | "failed";
  error: string | undefined;
}

export const AgentState = Annotation.Root({
  userQuery: Annotation<string>({
    reducer: (prev: string, next: string) => next ?? prev,
  }),
  context: Annotation<Record<string, any> | undefined>({
    reducer: (prev: Record<string, any> | undefined, next: Record<string, any> | undefined) => next ?? prev,
    default: () => ({}),
  }),
  intentResult: Annotation<IntentOutput | undefined>({
    reducer: (prev: IntentOutput | undefined, next: IntentOutput | undefined) => next ?? prev,
  }),
  knowledgeContext: Annotation<string | undefined>({
    reducer: (prev: string | undefined, next: string | undefined) => next ?? prev,
  }),
  promptResult: Annotation<PromptChainOutput | undefined>({
    reducer: (prev: PromptChainOutput | undefined, next: PromptChainOutput | undefined) => next ?? prev,
  }),
  generateResult: Annotation<GenerateResult | undefined>({
    reducer: (prev: GenerateResult | undefined, next: GenerateResult | undefined) => next ?? prev,
  }),
  evaluationResult: Annotation<EvaluationResult | undefined>({
    reducer: (prev: EvaluationResult | undefined, next: EvaluationResult | undefined) => next ?? prev,
  }),
  retryCount: Annotation<number>({
    reducer: (prev: number, next: number) => (prev ?? 0) + (next ?? 0),
    default: () => 0,
  }),
  status: Annotation<"running" | "success" | "failed">({
    reducer: (prev: "running" | "success" | "failed", next: "running" | "success" | "failed") => next ?? prev,
    default: () => "running" as const,
  }),
  error: Annotation<string | undefined>({
    reducer: (prev: string | undefined, next: string | undefined) => next ?? prev,
  }),
}) as any;

// ============================================================
// 2. 节点函数（不再使用 AgentStateType 作为参数，改用 any，但内部仍是安全的）
// ============================================================

export async function intentNode(state: any): Promise<any> {
  if (state.context?.skipNodes?.includes('intentNode')) return {};
  if (state.status === "failed") {
    logger.warn(`[intentNode] 状态已失败，跳过`);
    return state;
  }
  try {
    const intentChain = createIntentChain();
    const result = await intentChain.invoke({
      userQuery: state.userQuery,
      context: state.context,
    });
    return { intentResult: result, status: "running" };
  } catch (error: any) {
    logger.error(`意图识别失败: ${error.message}`);
    return {
      status: "failed",
      error: `意图识别失败: ${error.message}`,
    };
  }
}

export async function knowledgeNode(state: any): Promise<any> {
  if (state.context?.skipNodes?.includes('knowledgeNode')) return {};
  if (state.status === "failed") {
    logger.warn(`[knowledgeNode] 状态已失败，跳过`);
    return state;
  }
  try {
    let brandContextText = "";
    const enterpriseId = state.context?.enterpriseId;
    const knowledgeId = state.context?.knowledgeId;

    if (enterpriseId && knowledgeId) {
      logger.info(`[knowledgeNode] 触发向量检索，查询: ${state.userQuery}`);
      try {
        const docs = await searchKnowledge(state.userQuery, { enterpriseId, knowledgeId }, 3);
        brandContextText = docs.map(d => d.pageContent).join("\n\n");
      } catch (e: any) {
        logger.warn(`[knowledgeNode] 向量检索异常，降级使用本地配置: ${e.message}`);
      }
    }

    if (!brandContextText) {
      brandContextText = brandService.formatBrandContext().formattedBrandText;
    }

    const sessionId = state.context?.sessionId;
    const history = sessionId
      ? conversationMemory.getFormattedHistory(sessionId)
      : "";

    const knowledgeContext = [
      brandContextText,
      history ? `对话历史：\n${history}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    return { knowledgeContext, status: "running" };
  } catch (error: any) {
    logger.error(`知识获取失败: ${error.message}`);
    return {
      status: "failed",
      error: `知识获取失败: ${error.message}`,
    };
  }
}

export async function promptNode(state: any): Promise<any> {
  if (state.context?.skipNodes?.includes('promptNode')) return {};
  if (state.status === "failed") {
    logger.warn(`[promptNode] 状态已失败，跳过`);
    return state;
  }
  try {
    const promptChain = createPromptChain();
    const result = await promptChain.invoke({
      userQuery: state.userQuery,
      intent: state.intentResult?.intent ?? "其他",
      brandGuidelines: state.knowledgeContext ?? brandService.formatBrandContext().formattedBrandText,
      context: state.knowledgeContext,
    });
    return { promptResult: result, status: "running" };
  } catch (error: any) {
    logger.error(`提示词生成失败: ${error.message}`);
    return {
      status: "failed",
      error: `提示词生成失败: ${error.message}`,
    };
  }
}

export async function generateNode(state: any): Promise<any> {
  if (state.context?.skipNodes?.includes('generateNode')) return {};
  if (state.status === "failed") {
    logger.warn(`[generateNode] 状态已失败，跳过`);
    return state;
  }
  try {
    const intent = state.intentResult?.intent;
    const generateType =
      intent === "图片生成"
        ? "image"
        : intent === "品牌描述"
        ? "text"
        : "brand_material";

    if (!state.promptResult) {
      return {
        status: "failed",
        error: "缺少 promptResult，无法生成",
      };
    }

    const result = await generateService.executeGenerate({
      promptData: state.promptResult,
      generateType,
      sessionId: state.context?.sessionId,
    });

    if (state.context?.sessionId) {
      conversationMemory.addMessage({
        sessionId: state.context.sessionId,
        message: {
          role: "assistant",
          content: result.content.slice(0, 500),
          timestamp: Date.now(),
        },
      });
    }

    return {
      generateResult: result,
      status: result.success ? "running" : "failed",
      error: result.success ? undefined : result.message ?? "生成返回失败",
    };
  } catch (error: any) {
    logger.error(`内容生成失败: ${error.message}`);
    return {
      status: "failed",
      error: `内容生成失败: ${error.message}`,
    };
  }
}

export async function evaluateNode(state: any): Promise<any> {
  if (state.context?.skipNodes?.includes('evaluateNode')) return {};
  if (state.status === "failed") {
    logger.warn(`[evaluateNode] 状态已失败，跳过`);
    return state;
  }
  try {
    const evalChain = createPromptEvaluationChain();
    const result = await evalChain.invoke({
      userQuery: state.userQuery,
      intentResult: state.intentResult!,
      promptResult: state.promptResult!,
      brandGuidelines: state.knowledgeContext,
    });
    return {
      evaluationResult: result,
      retryCount: 1,
      status: "running",
    };
  } catch (error: any) {
    logger.error(`评估失败: ${error.message}`);
    return {
      evaluationResult: {
        overallScore: 1,
        intentEvaluation: { score: 1, comment: "评估异常" },
        promptEvaluation: { score: 1, comment: "评估异常" },
        complianceEvaluation: { score: 1, comment: "评估异常" },
        suggestions: ["评估系统异常，请检查"],
        status: "failed",
      },
      retryCount: 1,
      status: "failed",      
      error: `评估失败: ${error.message}`,
    };
  }
}

// ============================================================
// 3. 条件路由
// ============================================================
export function routeAfterEvaluation(state: any): "promptNode" | "finishNode" {
  if (state.status === "failed") {
    return "finishNode";
  }
  const retryCount = state.retryCount ?? 0;
  const score = state.evaluationResult?.overallScore ?? 1;
  const THRESHOLD = 6;

  if (score < THRESHOLD && retryCount < 2) {
    return "promptNode";
  }

  return "finishNode";  // ← 先经过 finishNode 设置终态
}

// 新增节点终态判断
export async function finishNode(state: any): Promise<any> {
  if (state.status === "failed") {
    logger.warn(`[finishNode] 上游节点已标记失败: ${state.error}`);
    return {};  // 不修改任何字段
  }
  const score = state.evaluationResult?.overallScore ?? 1;
  const threshold = 6;
  const isSuccess = score >= threshold;

  logger.info(`[finishNode] 最终得分 ${score}，结果: ${isSuccess ? "成功" : "未达标"}`);

  // 存储助手消息 (如果还没存)
  // 把用户消息也存入记忆
  if (state.context?.sessionId) {
    conversationMemory.addMessage({
      sessionId: state.context.sessionId,
      message: {
        role: "user",
        content: state.userQuery.slice(0, 500),
        timestamp: Date.now(),
      },
    });
  }

  return {
    status: isSuccess ? "success" : "failed",
    error: isSuccess ? undefined : `评估得分 ${score} 未达到阈值 ${threshold}`,
  };
}

// ============================================================
// 4. 构建 LangGraph
// ============================================================
export function createAgentGraph():any {
  const workflow = new StateGraph(AgentState)
    .addNode("intentNode", intentNode)
    .addNode("knowledgeNode", knowledgeNode)
    .addNode("promptNode", promptNode)
    .addNode("generateNode", generateNode)
    .addNode("evaluateNode", evaluateNode)
     .addNode("finishNode", finishNode)  // ← 新增
    .addEdge(START, "intentNode")
    .addEdge("intentNode", "knowledgeNode")
    .addEdge("knowledgeNode", "promptNode")
    .addEdge("promptNode", "generateNode")
    .addEdge("generateNode", "evaluateNode")
    .addConditionalEdges("evaluateNode", routeAfterEvaluation, {
      promptNode: "promptNode",
      finishNode: "finishNode",       // ← 改为到 finishNode
    })
    .addEdge("finishNode", END);

  return workflow.compile();
}

// ============================================================
// 5. 便捷调用
// ============================================================
export async function runAgent(params: {
  userQuery: string;
  context?: Record<string, any>;
}): Promise<AgentStateType> {
  const graph = createAgentGraph();
  const initialState: Partial<AgentStateType> = {
    userQuery: params.userQuery,
    context: params.context ?? {},
    retryCount: 0,
    status: "running",
  };

  const finalState = await graph.invoke(initialState);
  return finalState as AgentStateType;
}
