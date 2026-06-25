# AI 网页总结浏览器插件 — 设计文档

- **日期**:2026-06-23
- **仓库**:LAUW2000/web-summary
- **状态**:已确认,待转实现计划

## 1. 目标

一个浏览器插件,点击即可用 AI 总结当前网页正文。支持多家模型,用户粘贴自己的 API key 即可使用,无需后端服务器。语言为 TypeScript。

## 2. 范围与决策

| 维度 | 决策 |
|------|------|
| 目标浏览器 | Chrome / Edge(Chromium),Manifest V3 |
| 模型提供商 | OpenAI 格式(GPT + DeepSeek/本地/国产,自定义 baseURL)+ Anthropic 格式,两套适配器 |
| 长页面处理 | Readability 抽正文 + 超长截断(不做分块 map-reduce) |
| 界面形态 | 弹窗 Popup(选模型 + 总结)+ 独立设置页(管理各家 key/baseURL/模型) |
| 配置存储 | `chrome.storage.local` |
| 输出语言 | 跟随网页语言 |
| 输出格式 | 要点式(bullet) |
| 输出方式 | 流式逐字显示(SSE) |
| 技术栈 | Vite + CRXJS + 原生 TS(不引 UI 框架) |
| 测试框架 | Vitest |

**明确不做(YAGNI)**:Firefox/跨浏览器、Gemini、分块 map-reduce、账号体系/云端同步、多种输出格式切换。

## 3. 架构

三个 MV3 运行环境:

- **Popup**:用户点工具栏图标的弹窗。顶部模型下拉 + 总结按钮 + 流式结果区 + 复制按钮。
- **Service Worker**(后台):接收总结请求,向 content script 要正文,调 AI API,流式回传结果。
- **Content Script**:注入网页,用 Readability 抽正文并回传。

配置(各家 key/baseURL/模型、当前选中项)存在 `chrome.storage.local`。

### 目录结构

```
web-summary/
├─ manifest.config.ts        # CRXJS 用 TS 写 manifest
├─ vite.config.ts
├─ src/
│  ├─ popup/                 # 弹窗:模型下拉 + 总结按钮 + 流式结果
│  │  ├─ popup.html
│  │  ├─ popup.ts
│  │  └─ popup.css
│  ├─ options/               # 设置页:管理各家 key/baseURL/模型
│  │  ├─ options.html
│  │  ├─ options.ts
│  │  └─ options.css
│  ├─ background/
│  │  └─ service-worker.ts   # 接收总结请求,调 AI,流式回传
│  ├─ content/
│  │  └─ extract.ts          # Readability 抽正文,回传文本
│  ├─ core/                  # 纯逻辑,可独立单测
│  │  ├─ providers/
│  │  │  ├─ types.ts         # Provider 统一接口
│  │  │  ├─ openai.ts        # OpenAI 格式(含 DeepSeek/本地)
│  │  │  └─ anthropic.ts     # Anthropic 格式
│  │  ├─ summarize.ts        # 组 prompt + 选适配器 + 流式
│  │  ├─ storage.ts          # 读写配置的封装
│  │  └─ truncate.ts         # 正文截断逻辑
│  └─ shared/
│     └─ messages.ts         # popup↔worker↔content 的消息类型
└─ tests/                    # core/ 的单元测试
```

**关键边界**:`core/` 全是纯逻辑(适配器、prompt、截断、存储封装),不直接处理 chrome 消息细节,可独立测试。UI 与 chrome 消息收发是薄壳,调用 `core/`。

## 4. Provider 接口与模型切换

统一接口,两套适配器实现,UI 不关心底层是哪家:

```ts
// core/providers/types.ts

/** 模型提供商的接口类型(决定用哪套适配器) */
export enum ProviderKind {
  /** OpenAI 格式接口(GPT、DeepSeek、本地、国产兼容服务) */
  OpenAI = 'openai',
  /** Anthropic 格式接口(Claude) */
  Anthropic = 'anthropic',
}

export const PROVIDER_KIND_VALUES: readonly ProviderKind[] = [
  ProviderKind.OpenAI,
  ProviderKind.Anthropic,
];

/** 一条模型配置(用户在设置页可保存多条) */
export interface ProviderConfig {
  id: string;            // 配置的唯一 id
  label: string;         // 用户起的显示名,如 "我的GPT"
  kind: ProviderKind;
  apiKey: string;
  baseURL?: string;      // OpenAI 类可填,支持 DeepSeek/本地/国产
  model: string;         // 如 "gpt-4o" / "claude-..." / "deepseek-chat"
}

/** 调用总结时的入参 */
export interface SummarizeParams {
  text: string;          // 已抽好的正文
  pageLang?: string;     // 用于"跟随网页语言"
  signal: AbortSignal;   // 支持中途取消
}

/** 统一的模型适配器接口,返回逐块吐 token 的异步流 */
export interface Provider {
  summarize(p: SummarizeParams): AsyncIterable<string>;
}
```

- `openai.ts`:`POST {baseURL}/v1/chat/completions`,`stream: true`,解析 OpenAI SSE。`baseURL` 默认 `https://api.openai.com`。
- `anthropic.ts`:`POST {baseURL}/v1/messages`,`stream: true`,解析 Anthropic SSE 事件,带 `anthropic-version` 头。

**模型切换**:设置页可保存多条 `ProviderConfig`;弹窗顶部下拉即这些配置的列表;当前选中项存入 `chrome.storage.local`,下次记住。

**prompt**:`summarize.ts` 统一组装系统提示——「用与正文相同的语言、输出要点式总结」,正文作为用户内容。

## 5. 数据流(一次总结)

```
用户点弹窗「总结」
  → popup.ts 经 port 向 service-worker 发 {type: Summarize, providerId}
  → service-worker:
     1. 向当前标签页 content script 要正文
     2. content/extract.ts 用 Readability 抽正文 → {text, pageLang}
     3. truncate.ts 按上限截断(超长标记 wasTruncated)
     4. storage.ts 读出选中的 ProviderConfig
     5. summarize.ts 组 prompt,选 Provider,调 summarize() 拿异步流
     6. 流的每个 chunk 经 port 持续推回 popup
  → popup.ts 逐字追加显示;结束显示「复制」;若截断给出提示
```

- 用长连接 `chrome.runtime.connect`(port),因为流式要持续推多次。
- 取消:关弹窗或再次点击 → 通过 `AbortSignal` 中止 fetch。
- 正文抽取必须在 content script(只有它能访问页面 DOM)。

## 6. 错误处理

每类错误给清晰中文提示,不静默失败。用枚举表示错误类型:

```ts
/** 总结过程中的错误类别 */
export enum SummarizeErrorKind {
  /** 未配置任何模型 / 未选中模型 */
  NoConfig = 'no_config',
  /** API 密钥无效或过期(401) */
  InvalidKey = 'invalid_key',
  /** 被限流或余额不足(429) */
  RateLimited = 'rate_limited',
  /** 网络错误或超时 */
  Network = 'network',
  /** 页面无法提取正文 */
  EmptyContent = 'empty_content',
  /** 服务端其他错误 */
  ServerError = 'server_error',
}
```

| 场景 | 处理 |
|------|------|
| 没配 key / 没选模型(NoConfig) | 提示「先去设置页添加模型配置」,带跳转按钮 |
| key 无效(InvalidKey) | 提示「密钥无效或已过期,请检查设置」 |
| 限流/余额不足(RateLimited) | 提示原因,建议稍后重试或换模型 |
| 网络失败/超时(Network) | 提示「网络错误,请重试」,保留重试按钮 |
| 正文为空(EmptyContent) | 提示「此页面无法提取正文」 |
| 正文超长被截断 | 正常总结,顶部标「内容较长,已截断后部分」 |
| 用户中途取消 | 静默停止,不报错 |

`core/` 抛结构化错误(携带 `SummarizeErrorKind`),UI 负责翻译成中文文案。

## 7. 测试策略

- 重点测 `core/`(纯逻辑):
  - `providers/openai.ts`、`anthropic.ts`:喂模拟 SSE 字节流,断言 token 序列解析正确、能处理中断。
  - `truncate.ts`:边界(刚好上限、超长、空)。
  - `summarize.ts`:prompt 组装、按 kind 选对适配器。
  - `storage.ts`:用 `chrome.storage` mock。
- 框架:Vitest。
- UI 层(popup/options)与 chrome 消息收发是薄壳,不强求单测,靠手动加载插件实测(Vite dev + Chrome 加载已解压扩展)。
- 遵守项目规范:不每改一个文件就跑测试,攒到提交前 `npm test` + `npm run typecheck` 把关一次。

## 8. 遵循的项目规范

见 `AGENTS.md`:所有函数 JSDoc 中文注释、有限取值用 string enum + `XXX_VALUES` 数组 + `z.nativeEnum`、不频繁跑 typecheck/test。
