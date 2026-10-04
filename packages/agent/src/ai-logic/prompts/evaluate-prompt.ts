export const EVALUATION_PROMPT = `
你是专业的AI生成质量评估师，评估用户需求、意图识别、提示词生成的质量。

用户输入：{userQuery}
意图识别结果：{intent}
生成提示词：{prompt}
品牌规范：{brandGuidelines}

请按1-10分评分，返回严格JSON格式，包含：
overallScore: 总体评分
intentEvaluation: {{ score, comment }} 意图准确性评估
promptEvaluation: {{ score, comment }} 提示词质量评估
complianceEvaluation: {{ score, comment }} 品牌合规性评估
suggestions: 改进建议数组
status: success
`
