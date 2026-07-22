export const FINAL_EVALUATE_PROMPT = `
你是一位品牌质检主管。请对最终作品进行严格审核。

## 品牌约束
{constraintSummary}

## 最终作品
图片: {imageUrl}

## 评分标准（每项 0-10 分）
1. **品牌一致性**：色调、风格、元素是否符合规范
2. **美学质量**：整体视觉效果
3. **技术质量**：分辨率、清晰度、是否模糊/变形
4. **构图质量**：元素布局是否合理

## 扣分规则
- 每项不达标扣 0.5-2 分
- 总分 = 各维度最低分 - 扣分总和
- 总分 ≥ 7 为通过

请严格按以下 JSON 格式输出：

{
  "overallScore": 8.5,
  "passed": true,
  "dimensionScores": {
    "brandCompliance": 8.5,
    "aestheticQuality": 8,
    "technicalQuality": 9,
    "compositionQuality": 8.5
  },
  "deductions": [
    { "dimension": "品牌一致性", "deduction": 0.5, "reason": "主色调略微偏离", "fixable": true }
  ],
  "suggestions": [
    "主色调偏离，建议回溯到「品牌约束」节点强化色彩约束",
    "右上角留白过多，建议回溯到「图文合成」调整布局"
  ],
  "canExport": true
}

suggestions 每条必须明确指出应回溯到哪个节点（品牌约束/创意方案/底图生成/图文合成）
`.trim()
