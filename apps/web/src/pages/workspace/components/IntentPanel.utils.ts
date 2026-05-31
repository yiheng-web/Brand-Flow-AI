/**
 * 意图解析面板 — 前端 Mock 工具函数
 *
 * 后端 AI 接口就绪后，替换此文件中的函数实现即可，
 * 组件代码无需改动。
 */

/** 中文停用词（过滤掉无明显语义的词） */
const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
  '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '那', '些',
  '做', '给', '为', '对', '从', '与', '及', '把', '被', '让', '将', '用',
  '以', '等', '及', '并', '且', '或', '但', '而', '因为', '所以', '虽然',
  '如果', '可以', '需要', '进行', '使用', '通过', '能够', '可能',
])

/** 中文标点 / 空格 / 分隔符正则 */
const SPLIT_REGEX = /[\s,，、。.．；;：:！!？?（()）【】\[\]「」{}／/\\|·×*#@&]+/

/**
 * 模拟从 prompt 中提取关键词
 * 规则：分词 → 过滤停用词 → 去重 → 取前 5 个
 */
export function mockExtractKeywords(prompt: string): string[] {
  const segments = prompt.split(SPLIT_REGEX).filter(Boolean)
  const words: string[] = []

  for (const seg of segments) {
    // 如果是纯英文/数字，直接保留
    if (/^[a-zA-Z0-9]+$/.test(seg)) {
      words.push(seg)
    } else {
      // 中文：按字符逐个拆分为单字词（更精细的 NLP 分词留给后端）
      for (const char of seg) {
        const trimmed = char.trim()
        if (trimmed && !STOP_WORDS.has(trimmed) && /[\u4e00-\u9fff]/.test(trimmed)) {
          words.push(trimmed)
        }
      }
    }
  }

  // 去重
  const unique = [...new Set(words)]
  return unique.slice(0, 8)
}

/**
 * 模拟推断场景类型
 * 规则：关键词匹配 → 返回场景名称
 */
export function mockInferSceneType(prompt: string): string {
  const rules: [RegExp, string][] = [
    [/户外|海滩|自然|风景|旅游|旅行/, '户外/旅游场景'],
    [/夏日|夏天|清凉|冰|冷饮|消暑/, '夏日/清凉场景'],
    [/冬日|冬天|圣诞|雪|寒冷|暖/, '冬日/温暖场景'],
    [/极简|简约|干净|留白|现代/, '极简风格'],
    [/国潮|国风|传统|中国风|水墨|书法/, '国潮/传统风格'],
    [/节日|促销|大促|优惠|打折|活动/, '节日/促销场景'],
    [/海报|广告|宣传|推广/, '宣传海报场景'],
    [/科技|数码|智能|未来|AI/, '科技/未来风格'],
    [/美食|餐饮|咖啡|饮品|蛋糕|食品/, '美食/餐饮场景'],
    [/潮牌|街头|嘻哈|潮流/, '潮牌/街头风格'],
  ]

  for (const [pattern, scene] of rules) {
    if (pattern.test(prompt)) {
      return scene
    }
  }

  return '通用场景'
}