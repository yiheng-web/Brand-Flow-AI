export const CANDIDATE_EVALUATE_PROMPT = `
你是一位资深品牌视觉评审专家。请对以下 4 张候选设计图进行评分。

## 品牌约束
{constraintSummary}

## 评分标准（每项 1-10 分）
1. **品牌一致性**：色调、风格、Logo 使用是否符合品牌规范
2. **美学质量**：构图、色彩搭配、视觉吸引力
3. **构图匹配度**：是否满足用户的布局需求
4. **创意度**：是否有新颖的表达方式

## 4 张候选图
- 图1: {image1Url}
- 图2: {image2Url}
- 图3: {image3Url}
- 图4: {image4Url}

请严格按以下 JSON 格式输出（不要输出任何其他内容）：

{
  "evaluations": [
    {
      "candidateId": "图1的ID",
      "overallScore": 8,
      "dimensionScores": { "brandCompliance": 8, "aestheticQuality": 7, "compositionFit": 8, "creativity": 6 },
      "comment": "简短评语",
      "recommendation": "recommended"
    }
  ],
  "bestCandidateId": "最佳图的ID",
  "summary": "30字以内总结"
}

recommendation 取值：recommended / neutral / not_recommended
`.trim()
