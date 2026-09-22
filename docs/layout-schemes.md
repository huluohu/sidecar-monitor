# 视图排列方案设计（台前模式 + 布局预设持久化）

> 状态：Phase 1 已实现（2026-09-22） · 设计稿
> 范围：渲染区多场地（site）的排列方式；不涉及窗口本身的多显示器分布。

## 1. 背景与术语

- 应用当前把所有启用的场地平铺在一个窗口网格里：渲染层用 CSS grid 摆放标题栏，
  测量 `.cell-body` 矩形后经 IPC（`layout:set-bounds`）驱动主进程定位 `WebContentsView`。
- 现有「聚焦」（focusedId）是**临时态**：某场地铺满整个窗口、其余隐藏、不持久化。
- 本方案新增**持久的排列预设**，并引入「台前」（stage）概念：
  指定一个场地居中放大，其余场地分列左右两侧、保持可见。

术语约定：

| 术语 | 含义 |
| --- | --- |
| 场地 site | 一个被监控的站点视图（沿用现有叫法，即用户说的"屏幕"） |
| 聚焦 focus | 现有临时态，单场地铺满窗口，ESC/退出后恢复，**不持久化** |
| 台前 stage | 持久预设：指定场地居中，其余对称分布在左右两侧 |
| 主屏 main-stack | 持久预设：指定场地占左侧大区，其余在右侧一列堆叠 |

## 2. 预设方案总览

| # | 方案 | 标识 | 说明 |
| --- | --- | --- | --- |
| 1 | 自动网格 | `grid` + `columns:'auto'` | 现状默认，按容器面积/宽高比自动选列数 |
| 2 | 固定列网格 | `grid` + `columns:1..20` | 现状，用户指定列数 |
| 3 | 台前居中 | `stage` | **新增**。指定场地居中，其余左右分列；奇数个场地时左右完全对称 |
| 4 | 主屏侧堆 | `main-stack` | **新增**。指定场地占大区，其余在右侧单列堆叠（基础设施与 #3 完全共用，成本极低） |

台前居中 — 5 个场地（奇数，左右对称）：

```
┌──────┬────────────┬──────┐
│      │            │      │
│  2   │            │  4   │
│      │     1      │      │
├──────┤   （台前）   ├──────┤
│      │            │      │
│  3   │            │  5   │
│      │            │      │
└──────┴────────────┴──────┘
```

台前居中 — 4 个场地（偶数，左侧多一个）：

```
┌──────┬────────────┬──────┐
│  2   │            │      │
├──────┤     1      │  4   │
│  3   │   （台前）   │      │
└──────┴────────────┴──────┘
```

主屏侧堆 — 5 个场地：

```
┌───────────────────┬──────┐
│                   │  2   │
│                   ├──────┤
│        1          │  3   │
│     （主屏）       ├──────┤
│                   │  4   │
│                   ├──────┤
│                   │  5   │
└───────────────────┴──────┘
```

## 3. 台前模式规则

### 3.1 区域切分

- 除台前外的 n-1 个场地按 `order`（现有排序）编号，前 `ceil((n-1)/2)` 个进左列
  （自上而下），其余进右列。奇数总场地数时左右各 `(n-1)/2` 个，完全对称。
- 默认宽度比例：台前 50%，左右两侧各 25%（`stageRatio = 0.5`，常量，后续可做成设置项）。
  16:9 窗口下台前单元约 0.89 宽高比，适合监控面板。
- 每侧单列堆叠、等分高度。超过每侧 5 个时单元会明显变矮，此时建议改用
  `main-stack` 或网格；后续可扩展为「每侧内部再走 autoColumns 小网格」。

### 3.2 台前场地的指定与回退

- 指定入口：网格/台前模式下，每个场地标题栏新增「设为台前」按钮（居中类图标）。
  点击即设置并**持久化** `stageSiteId`；台前单元带高亮描边 + 「台前」徽标。
- 回退规则（确定性，不发 toast 轰炸）：
  - `stageSiteId` 为 null、对应场地被禁用/删除 → 实际台前取 `order` 最小的启用场地，
    该单元同样显示徽标（让用户知道当前台前是谁）。
  - 启用场地为 0 → 现有空态；为 1 → 台前铺满（与 1 列网格等效）。
- `stageSiteId` 按场地 id 记忆，拖拽排序不会挤掉台前位置。
- 与「聚焦」的关系：聚焦优先级更高，可叠加在台前布局上；退出聚焦后回到台前布局。
  两者语义严格分离：聚焦=临时独占，台前=持久的主次布局。

## 4. 数据模型与持久化

沿用现有 config.json（原子写），`schemaVersion` 升到 **2**：

```ts
// src/shared/types.ts
export type LayoutMode = 'grid' | 'stage' | 'main-stack'

export interface AppConfig {
  schemaVersion: 2
  sites: SiteConfig[]
  columns: number | 'auto'      // 语义收窄为「grid 模式的列数」，取值不变
  layoutMode: LayoutMode        // 新增，默认 'grid'
  stageSiteId: string | null    // 新增，默认 null
  fullscreenOnLaunch: boolean
}
```

- 迁移（`configSchema.parseConfig` 内完成，`load`/`import` 共用）：
  读到 v1 → 补 `layoutMode:'grid'`、`stageSiteId:null`，落盘为 v2。
  合法性校验：`layoutMode` 三值枚举；`stageSiteId` 为 null 或能匹配 sites 中的 id
  （不匹配时按 null 处理，不抛错——场地可被随时禁用）。
- 导入兼容：导入 v1 导出文件自动迁移；导入动作本身会重新生成场地 id
  （`importFrom`），因此 `stageSiteId` 置 null，按回退规则落到第一个启用场地。
- 持久化时机：切换布局预设、点击「设为台前」时经现有 `config:save` 全量保存，
  与列数持久化同路径，无新增 IPC。

## 5. 入口与交互

### 5.1 工具栏（AppToolbar）

- 新增「方案」下拉：`网格` / `台前居中` / `主屏侧堆`（对应 layoutMode）。
- 现有「列数」下拉保留，仅在方案=网格时可用；非网格态置灰并提示
  「仅网格布局可调列数」。`自动` 选项含义不变。
- 台前/主屏的场地指定不在下拉里做，统一走单元标题栏按钮（见 3.2）。

### 5.2 原生菜单（appMenu.ts，macOS 菜单栏 / Win/Linux 由 App.vue 消费 MenuCommand）

Layout 子菜单改为分组：

```
网格
  ✓ Auto / 1..20 Columns     （仅 layoutMode==='grid' 时有勾选）
  ─────
  ✓ Stage（台前居中）
  ✓ Main + Stack（主屏侧堆）
```

- 新增 `MenuCommand { type: 'set-layout-mode'; mode: LayoutMode }`，
  复用现有 `MENU_COMMAND` 通道；列数相关的 `set-columns` 命令不变。
- 菜单重建沿用 `syncColumnsMenu` 模式，泛化为 `syncLayoutMenu(config)`。

### 5.3 单元标题栏（GridLayout.vue）

- 新增「设为台前」按钮：stage/main-stack 模式下每个非台前单元显示；
  台前单元显示「取消台前」（回到 grid）或允许直接改选其他场地（点别的场地的按钮即可换台前）。
- 现有「聚焦」按钮保留，行为不变。
- 拖拽排序在台前/主屏模式下保持可用（order 决定两侧排布次序）。

## 6. 实现要点

渲染管线不变：仍是「CSS 摆放标题栏 → 测量 `.cell-body` → IPC bounds」，
因此 **主进程与 siteViewManager 零改动**。

- `src/shared/layout.ts` 新增纯函数（可测核心）：

```ts
export interface StageSplit {
  leftIds: string[]
  rightIds: string[]
  stageId: string          // 实际生效的台前（含回退）
  leftCols: number
  rightCols: number
}

export function resolveStageSplit(
  orderedIds: string[], stageSiteId: string | null,
): StageSplit

// CSS grid 表达：返回 gridTemplateColumns/Rows 与每个 id 的 grid-area 描述，
// GridLayout.vue 据此渲染；App.vue 测量逻辑无需感知布局种类
export function stageGridTemplate(split: StageSplit, mode: 'stage' | 'main-stack'): StageGridSpec
```

- `GridLayout.vue`：接收 `layoutMode` + `StageSplit`，动态生成
  `grid-template-columns: repeat(L, 1fr) minmax(0, 2fr) repeat(R, 1fr)` 形态的模板
  （台前 50% ⇔ `1fr 2fr 1fr` 当两侧各 1 列；列数按左右实际个数展开），
  台前单元 `grid-column / grid-row: 1 / -1` 跨满全部行。`main-stack` 即
  `leftCols=0` 的特例（模板退化为 `3fr 1fr`）。
- `App.vue`：`layoutColumns` 泛化为布局描述 state；`onMenuCommand` 增加
  `set-layout-mode` 分支；`configStore` 增加 `setLayoutMode()` / `setStageSite()`。
- `src/main/appMenu.ts`：Layout 子菜单分组与勾选态（见 5.2）。
- 涉及文件清单：`shared/types.ts`、`shared/configSchema.ts`、`shared/layout.ts`、
  `renderer/stores/configStore.ts`、`renderer/components/{GridLayout,AppToolbar}.vue`、
  `renderer/App.vue`、`main/appMenu.ts`；`main/` 其余不动。

## 7. 测试计划

- `tests/layout.test.ts`：切分规则（奇数/偶数/1/2 个场地、stageSiteId 失效回退、
  main-stack 退化）、grid 模板生成正确性。
- `tests/configSchema.test.ts`：v2 校验、v1→v2 迁移、非法 layoutMode / stageSiteId 容错。
- `tests/appMenu.test.ts`：新菜单结构、勾选态随 layoutMode/columns 组合正确。
- `tests/electron-smoke.mjs`：冒烟断言不破坏（WCO 相关断言保持）。

## 8. 分期

- **Phase 1（本次）**：layoutMode 持久化 + 台前居中 + 主屏侧堆 + 工具栏/菜单入口 +
  迁移与全部单测。四个预设一次到位（3、4 共享全部基础设施）。
- **Phase 2（备选，不承诺）**：`stageRatio` 设置项；两侧 >5 个时内部小网格；
  台前快捷键（如 Cmd/Ctrl+Shift+数字按 order 选台前）；布局预设随窗口比例的
  智能提示（奇数场地时推荐台前模式）。
