# 项目规范

本文件是 web-summary 浏览器插件的开发规范,所有 agent 与协作者必须遵守。

# 代码注释规范（强制）

- 所有函数 / 方法都必须有 JSDoc 风格的注释，明确标注每个入参（`@param`）和返回值（`@returns`）。
- 重要变量（含模块级常量、`StyleSheet`、配置对象等）要有清晰的 JSDoc / 行注释说明用途。
- 所有注释一律用中文。

# 枚举与状态常量（强制）

- 有限取值的状态 / 类别 / 模式（如到期状态、性别、食物类型、库存类型等），一律用 TS `enum`（string enum）定义，**不要**在代码里散落裸字符串字面量（如 `return 'due'`、`scope === 'water'`）。
- 每个枚举成员上方用 JSDoc 中文注释说明含义。
- 代码引用一律用 `EnumName.Member`（如 `DueStatus.Due`、`FoodType.Dry`），不要写字符串字面量。
- 需要遍历渲染时，提供配套的 `XXX_VALUES: readonly Enum[]` 数组。
- zod 校验用 `z.nativeEnum(EnumName)`。

# 类型检查 / 测试频率（强制）

- **不要**每改完一个文件就跑 `npm run typecheck` / `npm test` —— 太耗时、打断节奏。
- 攒到一个完整任务 / 一组相关文件写完、**提交前**跑一次把关即可。
- 低风险改动（如 i18n 文案）中间可跳过；中间靠 IDE 实时类型提示 + 编辑器 diagnostics 兜底。
