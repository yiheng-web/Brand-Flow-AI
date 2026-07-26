# Brand-Flow 节点流模块 PRD / 技术理解文档

> 文档版本：v2.0  
> 模块名称：白盒化创作节点流  
> 适用对象：前端组、后端组、AI 逻辑组、产品测试组  
> 文档目的：定义 Brand-Flow 节点流模块的产品规则、节点职责、输入输出、前端展示、后端接口、AI 执行逻辑、节点跳过规则、质检规则与验收标准。

---

## 1. 产品定位

Brand-Flow 的节点流是一套白盒化 AI 创作生产线。

用户输入自然语言后，系统必须将创作过程拆解为 7 个节点：

```text
1. 需求翻译
2. 品牌约束
3. 创意方案
4. Prompt 生成
5. 底图生成
6. 图文合成
7. 品牌质检
```

节点流必须满足 4 个产品要求：

| 要求 | 产品定义 |
|---|---|
| 可解释 | 每个节点必须展示 AI 的中间产物、判断依据或推荐理由 |
| 可编辑 | 用户必须能修改关键节点的关键字段 |
| 可回溯 | 系统必须能根据错误原因回退到指定前置节点 |
| 可复用 | 系统必须保存节点产物、生成参数、图层数据和质检报告 |

节点流的核心判断标准不是“能否生成图片”，而是：

```text
用户是否知道 AI 为什么这样生成；
用户是否能在关键节点修改；
系统是否能根据问题回溯到正确节点；
最终作品是否能保存并复用。
```

---

## 2. 最终节点流总览

正式版本采用 7 个节点。

| 序号 | 节点名称 | 节点类型 | 核心职责 | 是否必跑 |
|---:|---|---|---|---|
| 1 | 需求翻译节点 | brief | 把用户自然语言转成结构化创作 Brief | 必跑 |
| 2 | 品牌约束节点 | brand_constraint | 从知识库中匹配品牌素材、规则和禁用项 | 条件运行 |
| 3 | 创意方案节点 | creative_direction | 生成 3 个可选创作方向，让用户先选方向 | 必跑 |
| 4 | Prompt 生成节点 | prompt | 生成专业底图 Prompt 和排版计划 | 必跑 |
| 5 | 底图生成节点 | image_generation | 调用生图模型生成 4 张候选底图 | 必跑 |
| 6 | 图文合成节点 | composition | 用模板和图层叠加标题、Logo、文案 | 条件运行 |
| 7 | 品牌质检节点 | brand_evaluation | 按需求、品牌、画面、排版评分并给出回溯建议 | 必跑 |

### 2.1 条件节点规则

节点流中存在两个条件节点：

| 节点 | 运行条件 | 跳过条件 |
|---|---|---|
| 品牌约束节点 | 用户选择了知识库，或当前 Space 存在企业强制知识库/强制品牌规则 | 用户未选择知识库，且当前 Space 无强制规则 |
| 图文合成节点 | `CreativeBrief.needsComposition = true` | `CreativeBrief.needsComposition = false` |

条件节点被跳过时，节点状态必须设置为 `skipped`，并写入跳过原因。

---

## 3. 首页创作入口规则

### 3.1 页面结构

首页创作入口必须包含 3 个区域：

```text
创作空间选择区
知识库选择区
用户需求输入区
```

页面结构：

```text
当前创作空间：
[个人空间 / 团队空间 / 企业空间]

本次使用知识库：
[知识库多选框]

用户需求：
[自然语言输入框]

[开始创作]
```

### 3.2 Space 选择规则

用户必须先选择创作空间 Space，再选择该 Space 下可访问的知识库。

Space 类型固定为：

```ts
type SpaceType = 'personal' | 'team' | 'enterprise';
```

| Space 类型 | 说明 | 作品归属 |
|---|---|---|
| personal | 个人创作空间 | 用户个人 |
| team | 团队创作空间 | 当前团队 |
| enterprise | 企业创作空间 | 当前企业 |

### 3.3 知识库选择规则

知识库选择必须遵守以下规则：

| Space 类型 | 可选知识库范围 | 默认选择 |
|---|---|---|
| personal | 用户个人知识库 | 最近一次使用的个人知识库 |
| team | 当前团队知识库 + 企业强制知识库 + 企业允许的个人知识库 | 当前团队主知识库 |
| enterprise | 企业知识库 | 企业主知识库 |

一次创作最多选择 3 个知识库。

企业强制知识库必须自动选中，用户不能取消。

### 3.4 无知识库场景

当用户没有知识库，且当前 Space 无强制规则时，系统必须允许用户直接输入需求并开始创作。

此时：

```text
品牌约束节点状态 = skipped
跳过原因 = 当前创作未选择知识库，且无强制品牌规则
```

---

## 4. 节点状态规则

所有节点必须具备统一状态。

```ts
type WorkflowNodeStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'stale'
  | 'skipped';
```

| 状态 | 含义 |
|---|---|
| pending | 节点尚未执行 |
| running | 节点正在执行 |
| completed | 节点执行完成 |
| failed | 节点执行失败 |
| stale | 节点产物已失效，必须重新执行 |
| skipped | 节点被系统跳过 |

---

## 5. 节点通用数据结构

所有节点必须使用统一基础结构。

```ts
type WorkflowNodeType =
  | 'brief'
  | 'brand_constraint'
  | 'creative_direction'
  | 'prompt'
  | 'image_generation'
  | 'composition'
  | 'brand_evaluation';

interface WorkflowNode {
  id: string;
  workflowId: string;
  type: WorkflowNodeType;
  title: string;

  status: WorkflowNodeStatus;

  input: Record<string, any>;
  output: Record<string, any>;

  editableFields: string[];
  lockedFields: string[];

  userModified: boolean;
  version: number;

  skipReason?: string;

  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
}
```

后端必须保存每个节点的 `input`、`output`、`status`、`version`。  
前端必须基于节点状态展示节点流。  
用户修改节点后，后端必须更新该节点 `version`，并将受影响后置节点标记为 `stale`。

---

# 6. 节点一：需求翻译节点

## 6.1 节点目标

需求翻译节点负责把用户自然语言转成结构化 Creative Brief。

该节点必须完成 5 件事：

```text
识别用户想生成什么类型的作品
识别作品是纯图片还是图文成片
识别用户是否需要后期叠加文字/Logo/文案
识别画面中是否允许出现自然场景文字
生成后续节点可消费的结构化 Brief
```

---

## 6.2 输入

```ts
interface BriefNodeInput {
  originalPrompt: string;
  spaceId: string;
  spaceType: SpaceType;
  selectedKnowledgeBaseIds: string[];
}
```

---

## 6.3 输出

```ts
interface CreativeBrief {
  projectType: {
    value:
      | 'poster'
      | 'social_post'
      | 'banner'
      | 'product_ad'
      | 'cover'
      | 'landscape'
      | 'illustration'
      | 'concept_art'
      | 'background'
      | 'avatar'
      | 'other';
    label: string;
    confidence: number;
    source: 'user_input' | 'inferred' | 'default';
  };

  outputMode: 'pure_image' | 'graphic_design';

  needsComposition: boolean;

  textIntent: {
    hasUserText: boolean;
    textRole: 'none' | 'scene_text' | 'overlay_text' | 'both';
    overlayTexts: {
      title?: string;
      subtitle?: string;
      slogan?: string;
      cta?: string;
    };
    sceneTextDescription?: string;
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
}
```

---

## 6.4 outputMode 判定规则

系统必须在需求翻译节点判定 `outputMode`。

| 用户需求 | outputMode | needsComposition |
|---|---|---|
| 生成风景图、插画、头像、背景、概念图 | pure_image | false |
| 生成海报、封面、广告图、电商图、宣传图 | graphic_design | true |
| 用户明确要求“标题写”“上面加字”“加 Logo”“加宣传语” | graphic_design | true |
| 用户只要求画面中自然存在招牌、路牌、店名 | pure_image | false |
| 用户同时要求场景文字和标题文案 | graphic_design | true |

示例：

```text
用户输入：生成一张黄山日出的风景图
结果：outputMode = pure_image，needsComposition = false
```

```text
用户输入：做一张黄山旅游宣传海报，标题写“云海日出，梦回黄山”
结果：outputMode = graphic_design，needsComposition = true
```

---

## 6.5 textIntent 判定规则

系统必须区分场景文字和叠加文字。

| textRole | 定义 | 示例 | 后续处理 |
|---|---|---|---|
| none | 用户没有要求任何文字 | 生成一张西湖夜景图 | 底图不生成文字，图文合成跳过 |
| scene_text | 文字是画面场景的一部分 | 街边招牌写着“江南茶馆” | 允许底图生成场景文字，图文合成跳过 |
| overlay_text | 文字是用户要强调的标题/文案 | 标题写“梦回江南” | 底图禁止生成该文字，由图文合成叠加 |
| both | 同时存在场景文字和叠加文字 | 招牌写“江南茶馆”，标题写“梦回江南” | 场景文字进底图，标题进图文合成 |

### 6.5.1 overlay_text 触发词

出现以下表达时，系统必须判定为 `overlay_text` 或 `both`：

```text
标题写
上面写
加上文字
海报文案是
主标题
副标题
slogan
宣传语
按钮文案
CTA
```

### 6.5.2 scene_text 触发词

出现以下表达时，系统必须判定为 `scene_text` 或 `both`：

```text
招牌上写着
路牌显示
墙上有
店名是
画面中有文字
背景里有
门头写着
```

---

## 6.6 前端展示规则

前端必须用固定卡片结构展示 Creative Brief。

卡片字段固定为：

```text
作品类型
输出模式
文字处理方式
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

字段结构由产品固定。  
字段内容由 AI 生成。  
用户不能新增字段类型。  
用户可以修改字段内容。

### 6.6.1 文字处理方式卡片

前端必须展示“文字处理方式”卡片。

可选项固定为：

```text
纯图片，不添加文字
画面中自然出现文字
后期叠加标题/Logo/文案
两者都有
```

用户修改该卡片后，系统必须同步更新：

```text
outputMode
needsComposition
textIntent.textRole
```

---

## 6.7 用户操作

用户必须能执行以下操作：

| 操作 | 说明 |
|---|---|
| 修改字段值 | 修改作品类型、平台、比例、主体等 |
| 修改输出模式 | 在纯图片和图文成片之间切换 |
| 修改文字处理方式 | 切换 none、scene_text、overlay_text、both |
| 增加标签 | 增加情绪、风格、色彩、必须包含项 |
| 删除标签 | 删除 AI 理解错误的标签 |
| 修改文案 | 修改标题、副标题、slogan、CTA |
| 确认节点 | 确认后进入品牌约束节点 |

---

## 6.8 技术实现要求

AI 调用必须使用固定 JSON Schema 输出。  
后端必须校验 AI 输出字段完整性。  
如果 AI 输出缺少必填字段，后端必须补默认值并记录 `source: 'default'`。  
关键字段必须包含 `confidence`。  
当 `confidence < 0.6` 时，前端必须展示“系统推测”标记。

---

# 7. 节点二：品牌约束节点

## 7.1 节点目标

品牌约束节点负责从用户选中的知识库中匹配品牌素材、规则、禁用项、Prompt 模板和参考案例，并形成后续节点必须使用的 BrandConstraintPackage。

该节点面向 C 端时表现为素材与知识匹配。  
该节点面向 B 端时表现为品牌规则与企业约束匹配。  
后端节点名称统一为 `brand_constraint`。

---

## 7.2 运行与跳过规则

当满足任一条件时，品牌约束节点必须运行：

```text
用户选择了至少 1 个知识库
当前 Space 存在企业强制知识库
当前 Space 存在强制品牌规则
```

当全部条件都不满足时，品牌约束节点必须跳过：

```text
status = skipped
skipReason = 当前创作未选择知识库，且无强制品牌规则
```

---

## 7.3 输入

```ts
interface BrandConstraintInput {
  spaceId: string;
  spaceType: SpaceType;
  selectedKnowledgeBaseIds: string[];
  creativeBrief: CreativeBrief;
}
```

---

## 7.4 匹配内容类型

系统必须匹配以下内容：

```text
Logo
标准色
图片素材
产品图
参考图
文本资料
Prompt 模板
禁用规则
品牌规则
优秀案例
Bad Case
```

---

## 7.5 匹配结果分级

匹配结果必须分为三类：

| 分类 | 含义 | 用户能否取消 |
|---|---|---|
| requiredItems | 强制使用项 | 不能取消 |
| recommendedItems | 推荐使用项 | 可以取消 |
| optionalItems | 可选参考项 | 可以选择 |

强制使用项来源固定为：

```text
企业 Logo 强制规则
企业标准色强制规则
企业禁用规则
团队管理员设置的强制素材
用户本次创作中明确要求必须使用的素材
```

---

## 7.6 推荐理由规则

每个匹配项必须包含推荐理由。

```ts
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

`matchReason` 不能为空。

示例：

```text
推荐理由：该产品图与需求中的“夏日冰咖啡新品”匹配，且属于当前团队知识库中的 active 素材。
```

---

## 7.7 输出

```ts
interface BrandConstraintPackage {
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
```

---

## 7.8 用户操作

用户必须能执行以下操作：

| 操作 | 说明 |
|---|---|
| 查看匹配项 | 查看素材、规则、模板 |
| 查看推荐理由 | 每个匹配项都能查看原因 |
| 选择推荐项 | 勾选或取消推荐素材 |
| 选择可选项 | 添加可选参考素材 |
| 查看强制项 | 强制项只读展示 |
| 确认节点 | 确认后进入创意方案节点 |

用户不能取消 requiredItems。  
前端必须对 requiredItems 禁用取消操作。  
后端必须校验 requiredItems 未被用户移除。

---

# 8. 节点三：创意方案节点

## 8.1 节点目标

创意方案节点负责基于 Creative Brief 和 BrandConstraintPackage 生成 3 个创作方向，让用户在正式生成 Prompt 前先选择创作方向。

该节点必须回答：

```text
这张图要往哪个创意方向做？
```

---

## 8.2 输入

```ts
interface CreativeDirectionInput {
  originalPrompt: string;
  creativeBrief: CreativeBrief;
  brandConstraintPackage?: BrandConstraintPackage;
}
```

当品牌约束节点被跳过时，`brandConstraintPackage` 为空。

---

## 8.3 输出

系统必须输出 3 个创意方案。

```ts
interface CreativeDirectionOutput {
  directions: CreativeDirection[];
  selectedDirectionId?: string;
}

interface CreativeDirection {
  id: string;
  title: string;
  summary: string;

  visualStyle: string[];
  composition: string;
  colorTone: string[];
  sceneDescription: string;

  suitablePlatform: string[];
  reason: string;

  riskNotes: string[];
}
```

`directions.length` 必须等于 3。

---

## 8.4 创意方案生成规则

系统生成的 3 个方案必须差异明确。

三个方案必须在以下至少两个维度上存在差异：

```text
视觉风格
构图方式
情绪基调
色彩倾向
适用平台
内容侧重点
```

示例：

```text
方案 A：清爽商业摄影风
方案 B：潮流插画社媒风
方案 C：极简品牌广告风
```

---

## 8.5 用户操作

用户必须能执行以下操作：

| 操作 | 说明 |
|---|---|
| 查看方案 | 查看 3 个创意方向 |
| 选择方案 | 必须选择 1 个方案进入下一节点 |
| 重新生成方案 | 重新生成 3 个方案 |
| 编辑补充要求 | 用户可以补充方向要求 |
| 确认节点 | 确认后进入 Prompt 生成节点 |

用户只能选择一个主方案。  
当前版本不支持合并多个方案。

---

# 9. 节点四：Prompt 生成节点

## 9.1 节点目标

Prompt 生成节点负责把 Creative Brief、BrandConstraintPackage 和用户选择的 CreativeDirection 转化为：

```text
底图生成 Prompt
Negative Prompt
排版计划 Layout Plan
模型参数建议
```

该节点必须明确区分底图生成和图文合成。

---

## 9.2 输入

```ts
interface PromptNodeInput {
  originalPrompt: string;
  creativeBrief: CreativeBrief;
  brandConstraintPackage?: BrandConstraintPackage;
  selectedCreativeDirection: CreativeDirection;
}
```

---

## 9.3 输出

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
    textSafeArea?: string;
  };

  layoutPlan: null | {
    templateIntent:
      | 'top_title'
      | 'left_text_right_image'
      | 'center_title'
      | 'bottom_bar'
      | 'social_cover'
      | 'ecommerce'
      | 'minimal_blank';

    titlePosition: string;
    subtitlePosition?: string;
    logoPosition?: string;
    safeArea: string;
    textHierarchy: string;
  };

  modelParams: {
    aspectRatio: string;
    generationMode:
      | 'realistic_photo'
      | 'commercial_poster'
      | 'illustration'
      | 'fast_draft'
      | 'high_quality';

    candidateCount: 4;
  };

  ruleWarnings: string[];
}
```

---

## 9.4 图文分支规则

### 9.4.1 needsComposition = true

当 `CreativeBrief.needsComposition = true` 时：

```text
layoutPlan 必须存在
imagePrompt 必须要求底图预留文字安全区
imagePrompt 不得要求模型直接生成最终中文标题、Logo、卖点文案
negativePrompt 必须包含“乱码文字、错误文字、不可读文字”等限制
```

### 9.4.2 needsComposition = false

当 `CreativeBrief.needsComposition = false` 时：

```text
layoutPlan 必须为 null
imagePrompt 不要求预留文字安全区
图文合成节点后续必须 skipped
```

### 9.4.3 textRole = scene_text

当 `CreativeBrief.textIntent.textRole = 'scene_text'` 时：

```text
imagePrompt 可以描述场景中自然存在的招牌、路牌、店名等文字
layoutPlan 必须为 null
图文合成节点必须 skipped
```

### 9.4.4 textRole = both

当 `CreativeBrief.textIntent.textRole = 'both'` 时：

```text
imagePrompt 只描述场景文字
layoutPlan 只处理后期叠加文字
不得把 overlayTexts 写入 imagePrompt 作为模型生成文字要求
```

---

## 9.5 前端展示规则

前端必须展示结构化 Prompt，而不是只展示一整段文本。

展示模块固定为：

```text
主体描述
场景背景
风格方向
构图方式
光影效果
品牌约束
文字安全区域
Negative Prompt
排版计划
生成模式
```

当 `layoutPlan = null` 时，前端必须显示：

```text
当前任务为纯图片生成，不执行图文合成。
```

---

## 9.6 用户操作

用户必须能执行以下操作：

| 操作 | 说明 |
|---|---|
| 修改 Image Prompt | 修改底图生成提示词 |
| 修改 Negative Prompt | 修改负面提示词 |
| 修改文字安全区 | 仅 needsComposition=true 时可用 |
| 修改生成模式 | 选择真实摄影、商业海报、插画风格等 |
| 恢复 AI 版本 | 恢复系统生成内容 |
| 确认节点 | 确认后进入底图生成节点 |

---

## 9.7 Prompt 校验规则

用户修改 Prompt 后，系统必须校验以下内容：

| 校验项 | 处理 |
|---|---|
| 违反禁用规则 | 阻止进入下一节点 |
| 删除强制素材要求 | 阻止进入下一节点 |
| needsComposition=true 时要求模型直接生成最终中文标题 | 阻止进入下一节点 |
| 与 Creative Brief 冲突 | 弹出风险提示，用户确认后继续 |
| 删除主体描述 | 阻止进入下一节点 |

---

# 10. 节点五：底图生成节点

## 10.1 节点目标

底图生成节点负责调用生图模型生成 4 张候选底图。

该节点输出的是底图，不是最终图文成片。

当 `needsComposition = true` 时，底图中不得包含最终中文标题、Logo 和卖点文案。  
当 `textRole = scene_text` 或 `textRole = both` 时，底图允许包含自然场景文字。

---

## 10.2 输入

```ts
interface ImageGenerationInput {
  imagePrompt: string;
  negativePrompt: string;
  aspectRatio: string;
  generationMode:
    | 'realistic_photo'
    | 'commercial_poster'
    | 'illustration'
    | 'fast_draft'
    | 'high_quality';

  candidateCount: 4;
}
```

---

## 10.3 生成模式与模型映射

前端展示生成模式。  
后端根据生成模式映射具体模型和参数。

```ts
const generationModeMap = {
  realistic_photo: {
    model: 'flux-pro',
    steps: 30,
    guidanceScale: 3.5
  },
  commercial_poster: {
    model: 'flux-pro',
    steps: 35,
    guidanceScale: 4
  },
  illustration: {
    model: 'sdxl-illustration',
    steps: 30,
    guidanceScale: 7
  },
  fast_draft: {
    model: 'flux-schnell',
    steps: 8,
    guidanceScale: 2
  },
  high_quality: {
    model: 'flux-pro',
    steps: 45,
    guidanceScale: 4.5
  }
};
```

用户看到的是：

```text
真实摄影
商业海报
插画风格
快速草稿
高质量精修
```

系统内部使用的是：

```text
具体模型
steps
guidanceScale
尺寸
seed
```

当前版本不开放用户自定义模型。

---

## 10.4 输出

```ts
interface ImageGenerationOutput {
  generationMode: string;
  model: string;

  prompt: string;
  negativePrompt: string;
  aspectRatio: string;

  candidates: GeneratedImage[];

  durationMs: number;
  cost?: number;
}

interface GeneratedImage {
  id: string;
  imageUrl: string;
  seed?: string;
  width: number;
  height: number;
}
```

`candidates.length` 必须等于 4。

---

## 10.5 用户操作

用户必须能执行以下操作：

| 操作 | 说明 |
|---|---|
| 查看 4 张候选图 | 展示底图结果 |
| 查看生成参数 | 展示模型、seed、尺寸 |
| 重新生成 | 重新生成 4 张候选图 |
| 切换生成模式 | 回到 Prompt 节点或本节点重新生成 |
| 选择底图 | 用户可以手动选择一张进入后续流程 |

系统默认选择品牌质检节点评分最高的候选图。  
用户手动选择优先级高于系统推荐。

---

# 11. 节点六：图文合成节点

## 11.1 节点目标

图文合成节点负责把底图、标题、副标题、Logo、卖点文案和品牌色组合成最终图文成片。

该节点必须实现图文分离：

```text
底图由生图模型生成。
文字、Logo、卖点文案由图文合成节点叠加。
```

---

## 11.2 条件执行规则

图文合成节点不是必跑节点。

当 `CreativeBrief.needsComposition = true` 时：

```text
status = pending
底图生成完成后执行图文合成节点
```

当 `CreativeBrief.needsComposition = false` 时：

```text
status = skipped
skipReason = 当前任务为纯图片生成，无需叠加标题、Logo 或营销文案
```

用户可以在底图生成后手动开启图文合成节点。

用户手动开启后：

```text
composition.status 从 skipped 改为 pending
系统生成默认 layoutPlan
用户进入图文合成编辑器
```

---

## 11.3 前端展示逻辑

图文合成节点必须支持 3 种前端状态。

### 11.3.1 启用状态

展示：

```text
图文合成节点
状态：已启用
原因：当前任务需要叠加标题、Logo 或营销文案。
```

展示内容：

```text
底图
标题图层
副标题图层
Logo 图层
CTA 图层
模板选择
图层编辑器
```

### 11.3.2 跳过状态

展示：

```text
图文合成节点
状态：已跳过
原因：当前任务为纯图片生成，无需图文合成。
```

此状态不进入编辑器。  
右侧直接展示底图生成结果。

### 11.3.3 用户手动开启状态

当用户点击“添加标题/Logo”时，展示：

```text
你已开启图文合成节点，系统将为当前图片添加文字和图层编辑能力。
```

系统必须创建默认图层数据。

---

## 11.4 输入

```ts
interface CompositionInput {
  selectedBaseImage: GeneratedImage;

  creativeBrief: CreativeBrief;
  brandConstraintPackage?: BrandConstraintPackage;
  promptPlan: PromptPlan;

  selectedLogo?: MatchedKnowledgeItem;

  copywriting: {
    title?: string;
    subtitle?: string;
    slogan?: string;
    cta?: string;
  };

  selectedTemplateId?: string;
}
```

---

## 11.5 内置模板

当前版本必须内置 6 个排版模板：

| 模板 ID | 模板名称 | 使用场景 |
|---|---|---|
| top_title | 顶部大标题模板 | 小红书封面、活动海报 |
| bottom_bar | 底部信息栏模板 | 产品宣传图、公众号配图 |
| left_text_right_image | 左文右图模板 | Banner、横版宣传图 |
| center_title | 居中标题模板 | 节日海报、品牌主视觉 |
| ecommerce | 电商主图模板 | 商品卖点图 |
| minimal_blank | 极简留白模板 | 高级品牌宣传图 |

---

## 11.6 模板选择规则

系统必须根据以下字段自动选择默认模板：

```text
targetPlatform
aspectRatio
copywriting.title 长度
copywriting.subtitle 长度
selectedLogo 是否存在
底图主体位置
品牌风格
```

用户必须能手动切换模板。  
用户切换模板后，系统必须重新计算文字和 Logo 的默认位置。

---

## 11.7 图层结构

图文合成结果必须保存图层数据。

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

---

## 11.8 用户操作

用户必须能执行以下操作：

| 操作 | 说明 |
|---|---|
| 手动开启图文合成 | 在 skipped 状态下开启该节点 |
| 切换模板 | 选择 6 个内置模板之一 |
| 修改标题 | 编辑 title |
| 修改副标题 | 编辑 subtitle |
| 修改 CTA | 编辑 cta |
| 拖动文字 | 修改 text layer 坐标 |
| 修改字号 | 修改 fontSize |
| 修改颜色 | 修改 color |
| 移动 Logo | 修改 logo layer 坐标 |
| 缩放 Logo | 修改 logo layer 宽高 |
| 隐藏图层 | 设置 visible=false |
| 导出图片 | 导出 PNG/JPG/WebP |
| 保存作品 | 保存成品和图层数据 |

---

## 11.9 自动排版校验规则

图文合成节点必须执行以下校验：

| 规则 | 处理 |
|---|---|
| 文本遮挡主体中心 | 自动移动到安全区 |
| Logo 贴边 | 保留最小 5% 画布边距 |
| 标题超过两行 | 自动缩小字号 |
| 文字与背景对比度不足 | 自动添加半透明底板 |
| 企业强制 Logo 缺失 | 阻止导出 |
| 禁用色被使用 | 阻止导出 |
| 标题为空且 Brief 要求标题 | 阻止导出 |

---

## 11.10 输出

```ts
interface CompositionNodeOutput {
  composition: CompositionOutput | null;
  userEdited: boolean;
  editedAt?: Date;
}
```

当节点被跳过时：

```ts
composition = null
```

---

# 12. 节点七：品牌质检节点

## 12.1 节点目标

品牌质检节点负责对候选底图和最终结果进行评分、问题定位和回溯建议。

该节点必须根据 `needsComposition` 使用不同质检规则。

---

## 12.2 质检阶段

品牌质检包含两个阶段：

```text
阶段一：候选底图质检
阶段二：最终结果质检
```

阶段一在底图生成后执行。  
阶段二在图文合成后执行；如果图文合成节点被跳过，则阶段二直接评估选中的底图。

---

## 12.3 阶段一：候选底图质检

底图生成节点输出 4 张候选图后，品牌质检节点必须对 4 张候选底图分别评分。

### 12.3.1 needsComposition = true 的候选图评分维度

| 维度 | 分值 |
|---|---:|
| 需求匹配度 | 25 |
| 风格匹配度 | 20 |
| 画面质量 | 20 |
| 构图可用性 | 20 |
| 文字安全区 | 15 |
| 总分 | 100 |

系统必须将 100 分制转换为 10 分制展示。

### 12.3.2 needsComposition = false 的候选图评分维度

| 维度 | 分值 |
|---|---:|
| 需求匹配度 | 30 |
| 画面质量 | 30 |
| 风格匹配度 | 20 |
| 构图质量 | 10 |
| 多余文字/乱码 | 10 |
| 总分 | 100 |

纯图片场景不得检查 Logo、标题排版、CTA、营销文案。

---

## 12.4 候选图评分输出

```ts
interface CandidateImageEvaluation {
  imageId: string;

  totalScore: number;

  dimensionScores: Record<string, number>;

  issues: EvaluationIssue[];
  strengths: string[];

  recommendation: 'recommended' | 'usable' | 'not_recommended';
}
```

---

## 12.5 候选图选择规则

系统必须按以下规则选择候选图：

| 情况 | 系统动作 |
|---|---|
| 至少 1 张候选图评分 ≥ 6 | 默认选择评分最高的候选图 |
| 4 张候选图全部 < 6，且共同问题是画质差 | 回到底图生成节点重新生成 4 张 |
| 4 张候选图全部 < 6，且共同问题是主体错误 | 回到 Prompt 生成节点重写主体描述 |
| 4 张候选图全部 < 6，且共同问题是风格错误 | 回到创意方案节点重新选择方向 |
| 4 张候选图全部 < 6，且共同问题是文字安全区不足 | 回到 Prompt 生成节点强化安全区 |
| 用户手动选择低分图 | 允许继续，但标记低质量风险 |

当 4 张全部低于 6 分时，系统不得自动进入图文合成。  
只有用户手动确认使用低分图时，系统才能继续后续流程。

---

## 12.6 阶段二：最终结果质检

### 12.6.1 图文成片质检规则

当 `needsComposition = true` 时，最终成片评分维度为：

| 维度 | 权重 |
|---|---:|
| 需求匹配度 | 20% |
| 品牌一致性 | 20% |
| 素材使用准确性 | 15% |
| 画面质量 | 15% |
| 文案与排版 | 20% |
| 平台适配度 | 10% |

### 12.6.2 纯图片质检规则

当 `needsComposition = false` 时，最终结果评分维度为：

| 维度 | 权重 |
|---|---:|
| 需求匹配度 | 30% |
| 画面质量 | 30% |
| 风格匹配度 | 20% |
| 构图质量 | 10% |
| 多余文字/乱码 | 10% |

纯图片场景不得检查：

```text
Logo 是否出现
标题是否清晰
文案层级是否合理
CTA 是否存在
排版模板是否合适
```

---

## 12.7 最终质检输出

```ts
interface FinalEvaluationResult {
  totalScore: number;
  pass: boolean;

  dimensionScores: Record<string, number>;

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
    | 'brand_constraint'
    | 'creative_direction'
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
  | 'optimize_composition'
  | 'regenerate_image'
  | 'revise_prompt'
  | 'revise_brand_constraint'
  | 'revise_creative_direction'
  | 'revise_brief';
```

---

## 12.8 最终质检通过规则

```text
totalScore >= 6：通过
totalScore < 6：不通过
```

当企业配置了最低导出分时：

```text
totalScore < enterpriseMinExportScore：禁止导出
```

个人空间和普通团队空间默认不禁止导出，但必须展示低分风险。

---

## 12.9 回溯规则

| 问题类型 | 回溯节点 |
|---|---|
| 用户需求理解错误 | 需求翻译节点 |
| 品牌素材选错 | 品牌约束节点 |
| 创意方向不合适 | 创意方案节点 |
| Prompt 表达错误 | Prompt 生成节点 |
| 底图主体错误 | 底图生成节点或 Prompt 生成节点 |
| 标题遮挡主体 | 图文合成节点 |
| Logo 缺失或过小 | 图文合成节点 |
| 企业禁用规则冲突 | 品牌约束节点 |
| 平台尺寸不适配 | 需求翻译节点或图文合成节点 |
| 纯图片出现多余文字 | Prompt 生成节点或底图生成节点 |
| 场景文字严重乱码 | Prompt 生成节点或底图生成节点 |

---

## 12.10 用户操作

品牌质检完成后，用户必须能执行以下操作：

| 操作 | 说明 |
|---|---|
| 接受并保存 | 保存当前结果 |
| 按建议优化 | 系统根据 retryTargetNode 回溯 |
| 只优化排版 | 回到图文合成节点，仅 needsComposition=true 时可用 |
| 重新生成底图 | 回到底图生成节点 |
| 修改 Prompt | 回到 Prompt 生成节点 |
| 修改创意方向 | 回到创意方案节点 |
| 忽略风险导出 | 仅在企业策略允许时可用 |

---

## 12.11 自动回溯限制

系统最多自动回溯 2 次。

超过 2 次后，系统必须停止自动执行，并展示：

```text
质检报告
失败原因
推荐修改节点
用户操作按钮
```

---

# 13. 节点失效规则

当前置节点被用户修改后，所有受影响的后置节点必须变为 `stale`。

| 被修改节点 | 必须失效的后置节点 |
|---|---|
| 需求翻译节点 | 品牌约束、创意方案、Prompt 生成、底图生成、图文合成、品牌质检 |
| 品牌约束节点 | 创意方案、Prompt 生成、底图生成、图文合成、品牌质检 |
| 创意方案节点 | Prompt 生成、底图生成、图文合成、品牌质检 |
| Prompt 生成节点 | 底图生成、图文合成、品牌质检 |
| 底图生成节点 | 图文合成、品牌质检 |
| 图文合成节点 | 品牌质检 |
| 品牌质检节点 | 不影响前置节点 |

前端必须展示失效提示：

```text
你修改了「品牌约束节点」，后续创意方案、Prompt、底图、图文合成和品牌质检结果已失效，需要重新执行。
```

---

# 14. 前端页面布局要求

节点流页面必须分为三栏：

```text
左侧：节点流导航
中间：当前节点详情
右侧：实时预览 / 结果展示
```

## 14.1 左侧节点流导航

必须展示：

```text
节点名称
节点状态
是否用户修改
是否失效
执行失败原因
跳过原因
```

## 14.2 中间节点详情

| 节点 | 中间详情 |
|---|---|
| 需求翻译 | Creative Brief 卡片 |
| 品牌约束 | 素材、规则、推荐理由 |
| 创意方案 | 3 个创意方向卡片 |
| Prompt 生成 | 结构化 Prompt |
| 底图生成 | 生成参数 |
| 图文合成 | 图层编辑属性或跳过原因 |
| 品牌质检 | 评分、扣分项、回溯建议 |

## 14.3 右侧预览

| 节点 | 右侧展示 |
|---|---|
| 需求翻译 | Brief 摘要 |
| 品牌约束 | 选中素材预览 |
| 创意方案 | 方向概览 |
| Prompt 生成 | Prompt 摘要 |
| 底图生成 | 4 张候选图 |
| 图文合成 | Canvas 编辑器或底图预览 |
| 品牌质检 | 最终图和评分报告 |

---

# 15. 后端接口要求

## 15.1 创建工作流

```http
POST /workflow/create
```

请求：

```ts
interface CreateWorkflowRequest {
  spaceId: string;
  spaceType: SpaceType;
  selectedKnowledgeBaseIds: string[];
  originalPrompt: string;
}
```

响应：

```ts
interface CreateWorkflowResponse {
  workflowId: string;
  status: 'pending' | 'running';
}
```

## 15.2 获取工作流详情

```http
GET /workflow/:id
```

必须返回：

```ts
interface WorkflowDetail {
  id: string;
  spaceId: string;
  spaceType: SpaceType;
  originalPrompt: string;
  status: string;
  nodes: WorkflowNode[];
  createdAt: string;
  updatedAt: string;
}
```

## 15.3 执行指定节点

```http
POST /workflow/:id/nodes/:nodeType/run
```

用于节点重跑。

## 15.4 更新节点用户编辑内容

```http
PUT /workflow/:id/nodes/:nodeType
```

请求：

```ts
interface UpdateWorkflowNodeRequest {
  output: Record<string, any>;
  userModified: true;
}
```

更新节点后，后端必须自动将受影响后置节点标记为 `stale`。

## 15.5 工作流 SSE

```http
GET /workflow/:id/stream
```

SSE 事件类型：

```text
node_started
node_progress
node_completed
node_failed
node_skipped
workflow_completed
workflow_failed
```

---

# 16. 验收标准

该模块完成后，必须满足以下验收标准：

1. 用户能在首页选择 Space；
2. 用户能在首页选择最多 3 个知识库；
3. 企业强制知识库不能被取消；
4. 用户输入自然语言后，系统生成结构化 Creative Brief；
5. Creative Brief 使用固定卡片字段展示；
6. Creative Brief 必须包含 `outputMode`、`needsComposition`、`textIntent`；
7. 用户能修改 Brief 字段；
8. 用户能修改文字处理方式；
9. 品牌约束节点能输出 required、recommended、optional 三类匹配结果；
10. 每个匹配项必须展示推荐理由；
11. requiredItems 不能被用户取消；
12. 创意方案节点必须输出 3 个差异明确的方案；
13. 用户必须选择 1 个创意方案；
14. Prompt 节点必须输出 Image Prompt、Negative Prompt、Layout Plan；
15. 当 `needsComposition=false` 时，Prompt 节点的 `layoutPlan` 必须为 null；
16. 当 `needsComposition=true` 时，Prompt 节点必须阻止直接生成最终中文标题；
17. 底图生成节点必须生成 4 张候选图；
18. 候选图必须分别评分；
19. 至少 1 张候选图 ≥ 6 分时，系统默认选择最高分图；
20. 4 张候选图全部 < 6 分时，系统不得自动进入图文合成；
21. `needsComposition=false` 时，图文合成节点必须 skipped；
22. 用户能手动开启图文合成节点；
23. 图文合成节点必须使用图层结构；
24. 图文合成节点必须支持文字、Logo 基础编辑；
25. 品牌质检节点必须根据 `needsComposition` 使用不同评分规则；
26. 品牌质检节点必须输出总分、分项分、扣分项、回溯建议；
27. 修改前置节点后，后置节点必须变为 stale；
28. 后端必须校验知识库权限；
29. 后端必须校验企业强制规则；
30. 最终作品必须保存成片、图层数据、节点产物和质检报告。

---

# 17. 当前版本不包含的功能

以下功能不进入当前版本：

```text
用户自定义模型
复杂局部重绘
PS 级图层系统
多人实时协同编辑
复杂审批流
公开素材市场
自动解析 PDF 品牌规范
无限自动回溯
多级部门嵌套
```

---

# 18. 最终流程

```text
选择 Space
↓
选择知识库
↓
输入自然语言需求
↓
需求翻译节点：生成 Creative Brief，并判断 outputMode / needsComposition / textIntent
↓
品牌约束节点：匹配素材、规则、禁用项；无知识库且无强制规则时跳过
↓
创意方案节点：生成 3 个创意方向
↓
Prompt 生成节点：生成 Image Prompt、Negative Prompt、Layout Plan
↓
底图生成节点：生成 4 张候选底图
↓
品牌质检节点：对 4 张候选底图分别评分
↓
系统推荐最高分底图
↓
如果 needsComposition = true：进入图文合成节点
如果 needsComposition = false：跳过图文合成节点
↓
品牌质检节点：最终结果评分
↓
保存作品 / 回溯优化 / 导出图片
```

---

# 19. 总结

Brand-Flow 节点流模块必须实现的产品闭环是：

```text
用户输入
↓
AI 理解
↓
用户确认
↓
知识库约束
↓
创意方向选择
↓
专业 Prompt
↓
多图生成
↓
条件图文合成
↓
AI 质检
↓
回溯优化
↓
作品沉淀
```

图文合成节点必须是条件节点。  
用户要的是纯图片时，系统生成纯图片。  
用户要的是海报、封面、广告图、电商图时，系统进入图文合成。  
场景里自然存在的文字属于底图内容。  
用户强调的标题、Logo、卖点文案属于图文合成图层。
