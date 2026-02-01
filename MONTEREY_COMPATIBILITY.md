# macOS Monterey (Safari 15) 兼容性技术报告与上游建议

这份文档记录了为了让 Blinko 在旧版 macOS (12.x Monterey) 的内核环境（Safari 15 / WebKit 17613）下运行所面临的挑战、当前的修复方案，以及对上游（官方）的优化建议。

## 1. 核心问题汇总 (Known Issues)

### 🚀 JS 语法与正则表达式 (最严重：白屏)
*   **问题**：Safari 15 不支持 ES2018 引入的**正则反向断言** (`(?<=...)`, `(?<!...)`) 和**具名捕获组** (`(?<name>...)`)。一旦脚本包含此类语法，整个 JS 引擎会抛出 `SyntaxError` 并导致白屏。
*   **涉及依赖**：`vditor`, `marked`, `prismjs`, `mermaid` 等。
*   **当前修复**：通过 Vite 插件 `vite-plugin-regex-compat.ts` 在构建时将高级正则转换为通用正则，并辅以 `apply-patches.cjs` 修复某些顽固的第三方库源码。

### 🛠 Web API 缺失 (应用崩溃)
*   **问题**：Safari 15 不支持 `AbortSignal.timeout()`。TRPC 等现代库频繁使用此 API 进行请求超时管理，缺失会导致应用在初始化或发动请求时崩溃。
*   **当前修复**：在 `main.tsx` 引入了 `polyfill.ts`，在首行执行全局补丁。

### 🎨 UI 与 CSS 兼容性
*   **问题 1 (`color-mix`)**：新的 CSS 函数 `color-mix()` 在 Safari 15 下不生效。这导致标签背景等使用了该语法的 UI 颜色显示异常（通常是背景全透明或字体看不清）。
*   **问题 2 (布局加载时机)**：`react-burger-menu` 库在 Safari 的 WKWebView 下有时比 DOM 渲染更快，导致找不到 `page-wrap` 元素而报错。
*   **当前修复**：
    *   在 `globals.css` 中为所有 `color-mix` 提供 `rgba()` 的 Fallback。
    *   在 `Layout/index.tsx` 中延迟渲染侧边栏菜单，确保 DOM 已就绪。

### ❌ 静态资源 404 (Vditor 代码高亮)
*   **问题**：Vditor 组件在加载代码高亮 CSS 时，硬编码了 `/dist/js/highlight.js/...` 路径，但在生产环境中该路径并不存在。
*   **分析**：这是官方仓库的部署资源路径不匹配问题。目前仅影响代码块背景色，不影响逻辑。

---

## 2. 什么时候可以不用 Patch？(上游修复建议)

如果官方（blinkospace/blinko）能采纳以下修改，则该项目可以实现原生兼容，无需额外补丁：

### 建议 1：降低构建 Target 并自动化降级正则
*   **动作**：在 `vite.config.ts` 中将 `build.target` 设置为 `['es2020', 'safari15']`。
*   **动作**：集成类似的正则表达式降级插件或配置 `esbuild` 排除掉高级正则语法。

### 建议 2：内置 Polyfill
*   **动作**：在应用入口（如 `main.tsx`）标准地引入常用 Polyfills，包括 `AbortSignal.timeout` 和 `requestIdleCallback`。

### 建议 3：CSS 变量 Fallback
*   **动作**：避免在核心样式中过度依赖 `color-mix()`，或者在使用时提供传统颜色值作为备选：
    ```css
    background: rgba(0,0,0,0.1); /* Fallback */
    background: color-mix(in srgb, var(--primary) 10%, transparent);
    ```

### 建议 4：完善 Vditor 资源配置
*   **动作**：修正 Vditor 的 CDN 路径配置，确保代码高亮 CSS 指向正确的内部静态目录（如 `/public/libs/...`）而非不存在的 `/dist/js/...`。

---

## 3. 维护者建议 (Maintenance Guide)

由于官方倾向于追求最新技术，Safari 15 的兼容性可能会在每次大版本更新时被打破。

**建议做法**：
1. 持续维护 `blinko-64-dmg` 的 **Auto-Injection (手术级补丁)** 流程。
2. 每次当官方版本更新时，该仓库通过 `install.sh` 自动对比源码并注入修复。
3. 这种“寄生构建”模式是目前最低成本且最稳健的方式。
