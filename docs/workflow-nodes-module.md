# Brand-Flow 节点流模块 PRD 与技术理解文档

> 适用对象：前端组、后端组、AI 逻辑组、产品/测试组  
> 文档目的：统一研发组对 Brand-Flow 节点流模块的理解，明确每个节点的产品目标、输入输出、用户操作、AI 处理方式、重跑规则和复杂节点实现边界。

---

## 1. 模块定位

Brand-Flow 的核心差异不是“也能 AI 生图”，而是将一次不可控的 AI 生图过程拆解为透明、可解释、可干预、可回溯的创作工作流。

节点流模块的产品目标：

1. 让用户看懂 AI 是如何理解需求的；
2. 让用户能在关键节点纠偏，而不是只能重写整段 Prompt；
3. 让品牌、团队、个人知识库内容能进入生成链路；
4. 让图像生成、图文合成、AI 质检形成闭环；
5. 让每次生成都能保存参数、版本和节点中间产物，便于复用与追溯。

一句话定义：

> 节点流是 Brand-Flow 的白盒化创作引擎，它把用户自然语言需求转化为结构化创作 Brief、知识库匹配结果、Prompt 方案、候选底图、图文合成结果和质检报告。

---

## 2. 推荐节点流总览

建议正式版本采用 6 个核心节点：

```text
1. 需求翻译节点
2. 知识库匹配节点
3. Prompt 生成节点
4. 图像生成节点
5. 排版与合成节点
6. AI 质检节点
```

其中：

- 「需求翻译节点」负责把用户输入转成结构化 Creative Brief；
- 「知识库匹配节点」负责从个人/团队/企业知识库中匹配可用素材、规则和 Prompt 模板；
- 「Prompt 生成节点」负责生成结构化 Image Prompt、Negative Prompt 和 Layout Plan；
- 「图像生成节点」负责生成 4 张候选底图；
- 「排版与合成节点」负责图文分离合成，避免 AI 直接生成乱码文字；
- 「AI 质检节点」负责分别评估 4 张候选图与最终合成图，并给出分数、扣分项和回溯建议。

后续高级版本可在「知识库匹配节点」和「Prompt 生成节点」之间新增「创意方案节点」，用于生成 2-3 个创作方向。但当前版本可以先把创意方案能力融合进 Prompt 生成节点中，降低开发复杂度。

---

## 3. 首页输入区与知识库选择方案

### 3.1 首页输入区推荐结构

首页不建议只放一个 Prompt 输入框，应在输入框上方增加「创作空间」和「知识库」选择。

推荐结构：

```text
当前创作空间：
[个人空间 / 某团队空间 / 某企业空间]

本次使用知识库：
[选择知识库，多选]

用户输入：
[请输入你想生成的内容...]

[开始创作]
```

### 3.2 先选空间，还是先选知识库？

建议流程：

```text
先选择创作空间 Space
再选择该空间下可用知识库 Knowledge Bases
```

原因：

1. Space 决定用户当前身份和权限；
2. Space 决定可见的知识库范围；
3. Space 决定作品归属；
4. Space 决定企业规则是否强制生效。

### 3.3 Space 类型

```ts
type SpaceType = 'personal' | 'team' | 'enterprise';
```

| Space 类型 | 可用知识库 | 默认规则 |
|---|---|---|
| personal | 个人知识库 | 默认使用最近一次选择的个人知识库 |
| team | 当前团队知识库 + 所属企业知识库 | 默认使用团队主知识库，企业知识库按企业策略强制或推荐启用 |
| enterprise | 企业知识库 | 默认使用企业主知识库 |

### 3.4 一次最多选择几个知识库？

建议正式版本限制：

```text
一次最多选择 3 个知识库。
```

推荐规则：

| 场景 | 选择上限 | 说明 |
|---|---:|---|
| 个人空间 | 1-2 个 | 避免个人知识库过多导致上下文混乱 |
| 团队空间 | 最多 3 个 | 企业主知识库 + 团队知识库 + 可选个人知识库 |
| 企业空间 | 最多 2 个 | 企业主知识库 + 企业专题知识库 |

为什么不建议无限多选：

1. RAG 检索噪音会变大；
2. Prompt 上下文会变长；
3. 规则冲突会增多；
4. 用户难以理解最终为什么生成这样的结果；
5. 成本和响应时间会上升。

### 3.5 推荐默认选择逻辑

#### C 端个人用户

```text
默认选择：个人空间 + 最近一次使用的个人知识库。
如果用户没有知识库，则允许直接输入提示词进入节点流。
```

#### 团队用户

```text
默认选择：当前团队空间 + 团队主知识库。
如果所属企业配置了强制企业知识库，则自动附加企业知识库，且不可取消。
```

#### 企业用户

```text
默认选择：企业空间 + 企业主知识库。
企业知识库通常为强制启用。
```

---

## 4. 节点一：需求翻译节点

### 4.1 节点目标

将用户随意输入的自然语言，翻译成结构化 Creative Brief，让用户确认 AI 是否理解正确。

该节点是 Brand-Flow 的「翻译官」能力核心。

### 4.2 卡片字段是写死还是 AI 自己分析？

建议采用：

```text
字段结构固定，字段内容由 AI 分析生成。
```

也就是说，前端展示卡片的栏目是固定的，例如：

```text
作品类型
目标平台
画面比例
目标受众
核心主体
场景环境
情绪基调
视觉风格
色彩倾向
文案需求
必须包含
必须避免
```

但每个栏目里的内容由 AI 根据用户输入自动生成。

这样做的原因：

1. 固定字段能保证前端 UI 稳定；
2. 固定字段能保证后端数据结构稳定；
3. AI 负责填充内容，保持灵活性；
4. 用户容易理解和修改；
5. 后续节点可以稳定消费这些字段。

### 4.3 技术实现方式

后端为需求翻译节点设计一个稳定 JSON Schema，调用大模型时要求模型严格按 Schema 输出。

建议输出结构：

```ts
interface CreativeBrief {
  projectType: {
    value: 'poster' | 'social_post' | 'banner' | 'product_ad' | 'cover' | 'other';
    label: string;
    confidence: number;
    source: 'user_input' | 'inferred' | 'default';
  };
  targetPlatform: {
    value: 'xiaohongshu' | 'wechat' | 'douyin' | 'bilibili' | 'ecommerce' | 'custom' | 'unknown';
    label: string;
    confidence: number;
    source: 'user_input' | 'inferred' | 'default';
  };
  aspectRatio: {
    value: '1:1' | '3:4' | '4:5' | '9:16' | '16:9' | 'custom';
    confidence: number;
    source: 'user_input' | 'inferred' | 'default';
  };
  targetAudience: string[];
  coreSubject: string;
  scene: string;
  mood: string[];
  visualStyle: string[];
  colorTone: string[];
  copywriting: {
    title?: string;
    subtitle?: string;
    slogan?: string;
    cta?: string;
  };
  mustInclude: string[];
  mustAvoid: string[];
  clarificationQuestions?: string[];
}
```

### 4.4 字段置信度

AI 应为关键字段返回 confidence。

示例：

```json
{
  "targetPlatform": {
    "value": "xiaohongshu",
    "label": "小红书",
    "confidence": 0.48,
    "source": "inferred"
  }
}
```

前端展示：

```text
发布平台：小红书
系统推测，置信度较低，可修改。
```

### 4.5 用户可操作内容

用户可以：

1. 修改字段值；
2. 添加标签；
3. 删除标签；
4. 修改文案；
5. 补充额外要求；
6. 确认进入下一节点。

### 4.6 节点输出

```ts
interface BriefNodeOutput {
  originalPrompt: string;
  creativeBrief: CreativeBrief;
  userEdited: boolean;
  editedAt?: Date;
}
```

---

## 5. 节点二：知识库匹配节点

### 5.1 节点命名

推荐使用：

```text
知识库匹配节点
```

原因：

1. 该名称兼容 C 端和 B 端；
2. C 端用户可能只是想调用自己的素材，不一定是品牌约束；
3. B 端企业场景下，该节点内部仍可包含品牌规则和强制项；
4. 「知识库匹配」比「品牌约束」更宽泛，更适合平台级产品。

前端面向用户可显示为：

```text
知识库匹配
```

在 B 端企业空间中可补充说明：

```text
已自动应用企业品牌规则。
```

### 5.2 节点目标

根据需求翻译节点输出的 Creative Brief，从用户选择的知识库中检索并推荐相关素材、文本、Prompt 模板和规则，形成可供后续节点调用的 Knowledge Match Package。

### 5.3 输入

```ts
interface KnowledgeMatchInput {
  spaceId: string;
  spaceType: 'personal' | 'team' | 'enterprise';
  selectedKnowledgeBaseIds: string[];
  creativeBrief: CreativeBrief;
  originalPrompt: string;
}
```

### 5.4 匹配内容类型

MVP/正式上线第一版建议匹配：

```text
Logo
图片素材
文本资料
Prompt 模板
禁用规则
标准色
参考案例
```

### 5.5 推荐结果分级

匹配结果分为 3 类：

| 分类 | 说明 | 用户是否可取消 |
|---|---|---|
| 强制使用 | 企业规则、主 Logo、禁用规则等 | 不可取消 |
| 推荐使用 | 高相关素材、标准色、产品图、Prompt 模板 | 可取消 |
| 可选参考 | 历史案例、灵感图、相似风格素材 | 可选 |

### 5.6 推荐理由

每个匹配项必须有推荐理由。

示例：

```text
素材：冰咖啡产品图 03
推荐理由：与需求中的“夏日、冰咖啡、清爽”高度匹配。
```

```text
规则：禁止暗黑复古风格
推荐理由：当前企业品牌规范要求新品宣传图保持明亮、年轻、清爽。
```

### 5.7 节点输出

```ts
interface KnowledgeMatchPackage {
  requiredItems: MatchedKnowledgeItem[];
  recommendedItems: MatchedKnowledgeItem[];
  optionalItems: MatchedKnowledgeItem[];
  selectedItems: MatchedKnowledgeItem[];
  colorRules: string[];
  logoRules: string[];
  copyRules: string[];
  styleRules: string[];
  negativeRules: string[];
  promptTemplates: MatchedKnowledgeItem[];
}

interface MatchedKnowledgeItem {
  id: string;
  knowledgeBaseId: string;
  type: string;
  title: string;
  content?: string;
  fileUrl?: string;
  thumbnailUrl?: string;
  matchScore: number;
  matchReason: string;
  required: boolean;
  selected: boolean;
}
```

### 5.8 用户可操作内容

用户可以：

1. 查看推荐理由；
2. 勾选/取消推荐项；
3. 选择可选参考项；
4. 切换知识库重新匹配；
5. 查看强制项但不能取消；
6. 确认进入 Prompt 生成节点。

---

## 6. 节点三：Prompt 生成节点

### 6.1 节点目标

将原始需求、Creative Brief 和 Knowledge Match Package 转化为结构化 Prompt 方案。

该节点不应只输出一大段 Prompt，而应拆分为多个模块，方便用户理解、编辑和后续节点消费。

### 6.2 Prompt 拆分原则

Prompt 需要拆成两类：

```text
Image Prompt：给图像生成模型使用，负责生成底图。
Layout Plan：给排版与合成节点使用，负责文字、Logo、版式规划。
```

关键原则：

```text
图像生成阶段默认不生成中文文字。
最终标题、Logo、卖点文案由排版与合成节点后期叠加。
```

### 6.3 结构化 Prompt 模块

前端建议展示以下模块：

```text
主体描述
场景背景
风格方向
构图方式
光影效果
品牌/知识库约束
文字安全区域
负面提示词
模型参数建议
```

### 6.4 输出结构

```ts
interface PromptPlan {
  imagePrompt: string;
  negativePrompt: string;
  promptSections: {
    subject: string;
    scene: string;
    style: string;
    composition: string;
    lighting: string;
    brandConstraints: string;
    textSafeArea: string;
  };
  layoutPlan: {
    templateIntent: 'top_title' | 'left_text_right_image' | 'center_title' | 'bottom_bar' | 'social_cover' | 'ecommerce';
    titlePosition: string;
    subtitlePosition?: string;
    logoPosition: string;
    safeArea: string;
    textHierarchy: string;
  };
  modelParams: {
    aspectRatio: string;
    generationMode: GenerationMode;
    candidateCount: number;
  };
  ruleWarnings?: string[];
}
```

### 6.5 用户可操作内容

用户可以：

1. 查看结构化 Prompt；
2. 修改 Image Prompt；
3. 修改 Negative Prompt；
4. 修改文字安全区域描述；
5. 修改推荐构图；
6. 一键恢复 AI 推荐；
7. 触发规则校验。

### 6.6 Prompt 规则校验

用户修改 Prompt 后，需要检测：

1. 是否违反企业/团队禁用规则；
2. 是否遗漏强制使用素材；
3. 是否要求模型直接生成中文文字；
4. 是否改变目标比例；
5. 是否删除必要主体；
6. 是否与 Creative Brief 冲突。

---

## 7. 节点四：图像生成节点

### 7.1 节点目标

根据 Prompt 生成节点输出的 Image Prompt 和 Negative Prompt，调用底层模型生成 4 张候选底图。

注意：该节点生成的是「底图」，不是最终图文成片。

### 7.2 前端“生成模式”与后端模型映射

普通用户不一定理解 Flux、SDXL、LoRA、Sampler 等模型概念。前端不建议直接让普通用户选择模型名称，而应展示更容易理解的生成模式。

前端展示：

```text
真实摄影
商业海报
插画风格
快速草稿
高质量精修
```

后端根据生成模式映射到具体模型与参数。

示例：

```ts
type GenerationMode =
  | 'realistic_photo'
  | 'commercial_poster'
  | 'illustration'
  | 'fast_draft'
  | 'high_quality';
```

映射示例：

```ts
const generationModeMap = {
  realistic_photo: {
    model: 'flux-pro',
    defaultSteps: 30,
    guidanceScale: 3.5
  },
  commercial_poster: {
    model: 'flux-pro',
    defaultSteps: 35,
    guidanceScale: 4
  },
  illustration: {
    model: 'sdxl-illustration',
    defaultSteps: 30,
    guidanceScale: 7
  },
  fast_draft: {
    model: 'flux-schnell',
    defaultSteps: 8,
    guidanceScale: 2
  },
  high_quality: {
    model: 'flux-pro',
    defaultSteps: 45,
    guidanceScale: 4.5
  }
};
```

产品解释：

```text
用户选择的是生成目标，系统负责选择合适模型。
高级用户可以在高级设置中查看或切换具体模型。
```

### 7.3 为什么生成 4 张？

AI 生图天然存在随机性，单张生成仍然容易像抽奖。生成 4 张候选图可以让系统和用户共同选择最优结果。

默认规则：

```text
每次生成 4 张候选底图。
AI 质检节点分别评分。
系统推荐分数最高的一张进入放大展示和排版合成。
用户可以手动改选。
```

### 7.4 节点输出

```ts
interface ImageGenerationOutput {
  generationMode: GenerationMode;
  model: string;
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  candidates: GeneratedImage[];
  selectedImageId?: string;
  durationMs: number;
  cost?: number;
}

interface GeneratedImage {
  id: string;
  imageUrl: string;
  seed?: string;
  width: number;
  height: number;
  rawModelResponse?: Record<string, any>;
}
```

### 7.5 用户可操作内容

用户可以：

1. 查看 4 张候选图；
2. 手动选择其中一张；
3. 重新生成 4 张；
4. 切换生成模式；
5. 查看生成参数；
6. 进入排版与合成节点。

### 7.6 关于用户自定义模型

正式上线第一版暂不支持用户自定义模型。

原因：

1. API Key 管理复杂；
2. 模型参数差异大；
3. 调用失败率不可控；
4. 企业数据可能泄露；
5. 成本统计困难；
6. 会拉高产品复杂度。

建议等核心节点流稳定后再做 P2 版本。

---

## 8. 节点五：排版与合成节点

### 8.1 节点定位

排版与合成节点是 Brand-Flow 的核心差异化节点之一。

它的职责不是展示大模型绘图过程，而是：

> 在底图生成完成后，将标题、卖点文案、Logo、品牌色、装饰元素等以图层方式叠加到底图上，生成最终图文成片。

该节点的核心价值：

1. 图文分离，避免 AI 直接生成中文乱码；
2. 可控排版，用户可以调整文字和 Logo；
3. 品牌一致，遵守 Logo、色彩、字体规则；
4. 可复用，保存图层数据便于二次编辑。

### 8.2 输入

```ts
interface CompositionInput {
  selectedBaseImage: GeneratedImage;
  creativeBrief: CreativeBrief;
  knowledgeMatchPackage: KnowledgeMatchPackage;
  promptPlan: PromptPlan;
  copywriting: {
    title?: string;
    subtitle?: string;
    slogan?: string;
    cta?: string;
  };
  selectedLogo?: MatchedKnowledgeItem;
  selectedTemplateId?: string;
}
```

### 8.3 输出

```ts
interface CompositionOutput {
  finalImageUrl: string;
  previewImageUrl: string;
  templateId: string;
  layers: CompositionLayer[];
  exportSettings: {
    width: number;
    height: number;
    format: 'png' | 'jpg' | 'webp';
  };
}

interface CompositionLayer {
  id: string;
  type: 'background' | 'text' | 'logo' | 'shape' | 'image';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
  content?: string;
  assetUrl?: string;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    color?: string;
    backgroundColor?: string;
    borderRadius?: number;
  };
}
```

### 8.4 MVP/正式上线第一版策略

不建议第一版直接做完全智能自动排版。推荐采用：

```text
模板化排版 + AI 推荐模板 + 用户基础手动调整
```

### 8.5 模板类型

第一版建议内置 6 类模板：

| 模板 | 适用场景 |
|---|---|
| 顶部大标题模板 | 小红书封面、活动海报 |
| 底部信息栏模板 | 产品宣传图、公众号配图 |
| 左文右图模板 | Banner、横版宣传图 |
| 居中标题模板 | 节日海报、品牌主视觉 |
| 电商主图模板 | 商品卖点图 |
| 极简留白模板 | 高级品牌宣传图 |

### 8.6 AI 如何选择模板？

AI 根据以下信息推荐模板：

1. 目标平台；
2. 画面比例；
3. 文案长度；
4. 主体位置；
5. Logo 是否必需；
6. 底图视觉中心；
7. 品牌风格。

示例：

```text
目标平台为小红书，比例为 3:4，标题较短，主体位于画面下方，因此推荐顶部大标题模板。
```

### 8.7 用户可操作能力

第一版建议支持：

1. 切换排版模板；
2. 修改标题、副标题、CTA；
3. 拖动文字位置；
4. 修改字号；
5. 修改文字颜色；
6. 移动 Logo；
7. 缩放 Logo；
8. 隐藏或显示副标题；
9. 导出最终图片；
10. 保存为作品。

暂不建议第一版支持：

1. 复杂钢笔工具；
2. 多图层蒙版；
3. 高级滤镜；
4. PS 级别图层混合模式；
5. 复杂自动抠图；
6. 任意区域局部重绘。

### 8.8 自动排版规则

第一版可实现基础规则：

1. 文本不能遮挡主体中心；
2. Logo 不得贴边，保留安全边距；
3. 标题字号根据画布尺寸自适应；
4. 文本颜色需与背景有足够对比；
5. 标题最多两行，超长自动缩小或提示用户修改；
6. 企业强制 Logo 必须出现在成片中；
7. 企业标准色优先用于文字或装饰色。

### 8.9 排版节点失败场景

| 失败原因 | 处理方式 |
|---|---|
| 未选择底图 | 提示返回图像生成节点 |
| 必须使用 Logo 但 Logo 缺失 | 提示返回知识库匹配节点 |
| 文案过长无法排版 | 提示用户缩短文案或切换模板 |
| 背景过于复杂导致文字不可读 | 建议添加文字底板或重新生成底图 |
| 导出失败 | 保留图层数据，允许重试 |

### 8.10 为什么该节点必须保存图层数据？

因为后续功能都依赖图层数据：

1. 用户二次编辑；
2. 版本对比；
3. AI 质检定位问题；
4. 只重跑排版节点；
5. 多尺寸适配；
6. 作品复用。

---

## 9. 节点六：AI 质检节点

### 9.1 节点定位

AI 质检节点是 Brand-Flow 的另一个核心差异化节点。

它的职责不是简单给一张图打分，而是：

> 根据用户原始需求、Creative Brief、知识库匹配结果、Prompt 方案、候选底图和最终合成图，进行多维度评分、问题定位和回溯建议。

### 9.2 质检分两阶段

建议 AI 质检分成两个阶段：

```text
阶段一：候选底图质检
阶段二：最终成片质检
```

### 9.3 阶段一：候选底图质检

在图像生成节点生成 4 张候选底图后，AI 对每张图分别评分。

评分重点：

1. 是否符合主体；
2. 是否符合风格；
3. 是否符合色调；
4. 是否有明显畸形；
5. 是否有文字乱码；
6. 是否预留了文字安全区；
7. 是否适合后续叠加 Logo 和标题。

输出：

```ts
interface CandidateImageEvaluation {
  imageId: string;
  totalScore: number;
  dimensionScores: {
    requirementMatch: number;
    visualQuality: number;
    styleMatch: number;
    compositionUsability: number;
    textSafeArea: number;
  };
  issues: EvaluationIssue[];
  strengths: string[];
  recommendation: 'recommended' | 'usable' | 'not_recommended';
}
```

### 9.4 4 张图如何选择？

默认规则：

```text
AI 推荐总分最高的一张进入排版与合成节点。
用户可以手动选择任意一张。
```

如果存在至少一张 >= 6 分：

```text
选择分数最高的一张作为推荐图。
```

如果 4 张全部低于 6 分：

不建议直接全部打回重构，也不建议强行选择低分图直接进入成片。推荐策略：

```text
选择最高分图片作为参考，分析共同失败原因，回溯到最可能出问题的节点重新生成。
```

具体规则：

| 情况 | 处理方式 |
|---|---|
| 4 张主体都错 | 回溯 Prompt 生成节点，重写主体描述后重新生成 |
| 4 张风格都错 | 回溯 Prompt 生成节点或需求翻译节点，修正风格字段 |
| 4 张构图都不适合放文字 | 回溯 Prompt 生成节点，强化文字安全区要求 |
| 4 张只是质量略差但方向正确 | 回到图像生成节点重新生成 4 张 |
| 只有 1-2 张略低于 6 但可修 | 允许用户选择最高分并进入排版，但标记风险 |

产品按钮建议：

```text
[按建议重新生成]
[调整 Prompt 后重试]
[仍使用最高分图片]
[返回修改需求]
```

### 9.5 阶段二：最终成片质检

排版与合成完成后，AI 对最终成片评分。

评分维度建议：

| 维度 | 权重 | 说明 |
|---|---:|---|
| 需求匹配度 | 20% | 是否符合用户原始需求和 Creative Brief |
| 知识库/品牌一致性 | 20% | 是否正确使用企业/团队/个人知识库中的规则和素材 |
| 素材使用准确性 | 15% | Logo、产品图、标准色是否正确出现 |
| 画面质量 | 15% | 清晰度、畸形、主体完整性、构图美感 |
| 文案与排版 | 20% | 文字是否清晰、层级是否合理、Logo 是否合适 |
| 平台适配度 | 10% | 是否适合目标平台比例、风格和内容结构 |

### 9.6 质检输出结构

```ts
interface FinalEvaluationResult {
  totalScore: number;
  pass: boolean;
  dimensionScores: {
    requirementMatch: number;
    knowledgeConsistency: number;
    assetUsage: number;
    visualQuality: number;
    copyAndLayout: number;
    platformFit: number;
  };
  issues: EvaluationIssue[];
  suggestions: string[];
  recommendedActions: EvaluationAction[];
  retryTargetNode?: WorkflowNodeType;
  retryReason?: string;
}

interface EvaluationIssue {
  severity: 'low' | 'medium' | 'high';
  category:
    | 'brief'
    | 'knowledge_match'
    | 'prompt'
    | 'image_generation'
    | 'composition'
    | 'brand_rule'
    | 'platform_fit';
  message: string;
  relatedNode?: WorkflowNodeType;
}

type EvaluationAction =
  | 'accept'
  | 'optimize_layout'
  | 'regenerate_image'
  | 'revise_prompt'
  | 'revise_knowledge_selection'
  | 'revise_brief';
```

### 9.7 回溯规则

| 问题类型 | 回溯节点 |
|---|---|
| 用户需求理解错 | 需求翻译节点 |
| 知识库素材选错或漏选 | 知识库匹配节点 |
| Prompt 描述不充分 | Prompt 生成节点 |
| 主体错误、风格错误、画质差 | 图像生成节点 |
| Logo 太小、文字遮挡、排版不佳 | 排版与合成节点 |
| 企业规则冲突 | 知识库匹配节点或 Prompt 生成节点 |

### 9.8 自动回溯策略

不建议无限自动回溯。

建议规则：

```text
最多自动优化 2 次。
超过 2 次后停止自动重跑，展示质检报告，让用户选择下一步。
```

### 9.9 用户可操作按钮

AI 质检完成后，前端展示：

```text
[接受并保存]
[按建议自动优化]
[只优化排版]
[重新生成底图]
[返回修改 Prompt]
[忽略问题继续导出]
```

### 9.10 低于 6 分时如何处理？

规则建议：

```text
候选底图阶段：如果全部低于 6 分，默认不进入排版，优先建议回溯 Prompt 或重新生成。
最终成片阶段：如果低于 6 分，给出推荐回溯节点，不强制阻止用户保存，但明确标记为低质量结果。
```

原因：

1. 产品应保持用户控制权；
2. 有些低分问题用户可能可以接受；
3. 强制阻断会让体验变差；
4. B 端企业可配置是否禁止低分导出。

企业策略可选：

```text
企业可设置：低于指定分数禁止导出。
```

---

## 10. 节点重跑与失效规则

每个节点被修改后，后续节点的产物应标记为 stale，需要重新运行。

| 被修改节点 | 后续失效节点 |
|---|---|
| 需求翻译节点 | 知识库匹配、Prompt 生成、图像生成、排版与合成、AI 质检 |
| 知识库匹配节点 | Prompt 生成、图像生成、排版与合成、AI 质检 |
| Prompt 生成节点 | 图像生成、排版与合成、AI 质检 |
| 图像生成节点 | 排版与合成、AI 质检 |
| 排版与合成节点 | AI 质检 |
| AI 质检节点 | 不影响前置节点，只提供回溯建议 |

前端提示示例：

```text
你修改了「知识库匹配节点」，后续 Prompt、图像生成、排版和质检结果将失效，需要重新运行。
```

---

## 11. 通用节点数据结构

建议所有节点统一基础结构：

```ts
type WorkflowNodeType =
  | 'brief'
  | 'knowledge_match'
  | 'prompt'
  | 'image_generation'
  | 'composition'
  | 'evaluation';

interface WorkflowNode {
  id: string;
  workflowId: string;
  type: WorkflowNodeType;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stale' | 'skipped';
  input: Record<string, any>;
  output: Record<string, any>;
  editableFields: string[];
  lockedFields: string[];
  userModified: boolean;
  version: number;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
}
```

---

## 12. 前端展示建议

### 12.1 左侧节点流

展示节点状态：

```text
待执行 pending
执行中 running
已完成 completed
失败 failed
已失效 stale
已跳过 skipped
```

### 12.2 中间节点详情面板

展示当前节点的输入、输出、推荐理由、可编辑字段和确认按钮。

### 12.3 右侧预览区

根据节点不同展示：

| 节点 | 右侧预览 |
|---|---|
| 需求翻译 | Brief 卡片预览 |
| 知识库匹配 | 素材卡片、规则卡片 |
| Prompt 生成 | 结构化 Prompt 预览 |
| 图像生成 | 4 张候选底图 |
| 排版与合成 | Canvas/Fabric 编辑器 |
| AI 质检 | 分数、扣分项、优化建议 |

---

## 13. 正式上线第一版范围建议

当前项目已过 MVP 阶段，但仍建议控制正式上线第一版范围。

### 必做

1. 首页 Space + 知识库选择；
2. 需求翻译节点结构化 Brief；
3. 知识库匹配节点推荐理由与强制项；
4. Prompt 生成节点结构化 Prompt；
5. 图像生成节点默认生成 4 张候选图；
6. 候选图 AI 初筛评分；
7. 排版与合成节点模板化排版；
8. 基础图层编辑能力；
9. 最终成片 AI 质检；
10. 节点修改后的下游失效和重跑规则。

### 暂缓

1. 用户自定义模型；
2. 复杂局部重绘；
3. PS 级图层系统；
4. 完整版本树；
5. 多人实时协作；
6. 企业复杂审批流；
7. 自动解析 PDF 品牌规范；
8. 无限自动回溯。

---

## 14. 产品验收标准

正式上线第一版至少满足：

1. 用户可以选择 Space 和知识库；
2. 用户输入自然语言后，系统能生成结构化 Brief；
3. 用户可以修改 Brief 字段；
4. 系统能从知识库中匹配素材和规则，并展示推荐理由；
5. 强制项不可取消；
6. Prompt 节点能输出 Image Prompt、Negative Prompt、Layout Plan；
7. 图像生成节点能生成 4 张候选图；
8. AI 能对 4 张候选图分别打分并推荐最高分；
9. 排版与合成节点能将文字和 Logo 叠加到底图上；
10. 用户能基础调整文字和 Logo；
11. AI 质检节点能输出总分、分项分、扣分项和建议；
12. 用户能保存最终作品；
13. 修改前置节点后，后续节点会标记为 stale；
14. 后端必须校验知识库权限和企业强制规则。

---

## 15. 总结

节点流模块应围绕 4 个关键词设计：

```text
可解释：每个节点展示 AI 的中间产物和推荐理由
可编辑：用户能修改关键字段和选择素材
可回溯：系统能知道问题来自哪个节点并重跑
可复用：节点产物、Prompt、素材、图层和作品都能沉淀
```

最终流程：

```text
选择 Space 与知识库
↓
输入自然语言需求
↓
需求翻译节点：生成结构化 Creative Brief
↓
知识库匹配节点：匹配素材、规则、Prompt 模板
↓
Prompt 生成节点：生成 Image Prompt、Negative Prompt、Layout Plan
↓
图像生成节点：生成 4 张候选底图
↓
候选图质检：分别评分并推荐最高分
↓
排版与合成节点：图文分离合成最终图片
↓
AI 质检节点：最终评分、扣分项、优化建议、回溯节点
↓
保存作品 / 重新优化 / 导出
```

Brand-Flow 的产品价值不在于“替用户按一次生成按钮”，而在于让用户拥有一套可以理解、可以调整、可以复用的 AI 创作生产线。
