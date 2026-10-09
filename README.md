# AI Quantized LLM Atlas

> English version: [README.en.md](./README.en.md)

> **本地部署量化模型图谱** —— 只回答一个问题：这个基础模型，我该下载哪个量化版、为什么。
>
> 线上：https://models.specul.com/
> 部署仓：https://github.com/speculcom/models

## 这是什么

一个**索引站**，不是评测站。

- 我们从 Hugging Face 公开 API 读取模型元数据（许可、体积、架构、上下文、量化档位）
- 把它整理成**能横向对比的表**，每个数字都标出处
- **我们不跑 benchmark，不给「哪个模型更强」的结论**

## 不是什么

- ❌ 不是评测站（不做能力横评）
- ❌ 不是权重镜像站（**不下载、不托管任何模型文件**）
- ❌ 不是资讯站（不追热点、不写新闻）

## 目录结构

```
_data/models/
├── config.js              系列名单 + 量化者档案（人工维护）
├── data/
│   ├── series/*.json      采集产物（勿手改，由脚本生成）
│   └── quantizers/*.md    量化者档案（人工撰写）
├── docs/
│   ├── SCHEMA.md          数据结构定义 + 字段来源对照
│   ├── METHODOLOGY.md     选型方法 + 能说/不能说的边界
│   ├── LEGAL.md           五原则 + 已知风险处置
│   ├── audit-report.json  审计报告
│   └── selection-*.json   选型过程数据（可追溯「为什么选这几个」）
├── scripts/
│   ├── select-models.mjs  选型 v1（下载榜反推 + 四维打分）
│   ├── select-v2.mjs      选型 v2（降噪 + 厂商定向）
│   ├── select-v3.mjs      选型 v3（定稿核对）
│   ├── collect-models.mjs 正式采集
│   ├── audit-licenses.mjs 建站前强制审计
│   └── build.mjs          生成站点
└── site/                  站点产物
```

## 常用命令

```bash
# ① 采集（注意 hf-mirror 限流，串行 900ms 间隔；耗时随系列数增长，系列数见文末实测规模）
node scripts/collect-models.mjs

# ② 后处理：重新套用档名规则（**必须有这一步**）
#    实测新采数据里混进 210 个非权重文件（mmproj / tokenizer / imatrix …），
#    跳过它会让页面建议「直接下 非权重文件（0.0 GB，未识别）」，models-check 会报「未识别」。
#    它同时重算 coverage / totalGB / recommended。
node scripts/fix-quants.mjs

# ③ 回填量化变体的许可（**必须有这一步**）
#    实测多数 HF 量化仓的 model card 里就没有 license 字段（bartowski / AtomicChat / AesSedai …），
#    不是采集失败 —— 量化是权重的数学变换，许可必然继承基座。
#    脚本会写 licenseInherited + licenseFrom 留痕，页面据此标注「继承自基座」。
node scripts/backfill-license.mjs

# ④ 审计（不合规则 exit 1，中止建站）
node scripts/audit-licenses.mjs

# ⑤ 建站
node scripts/build.mjs
```

> ⚠ **第 ②③ 步曾在 README 里漏写**（2026-10-09 A6.5 补录时连续踩到：直接跳到审计，
> 先报「量化变体缺 license」中止建站，补了回填后又发现页面上有「未识别」）。
> **采集之后、审计之前，这两步都不能省。**

## 改系列名单的流程

1. 编辑 `config.js` 的 `SERIES` 数组
2. **同步两个翻译文件**（否则英文态露出中文，构建会 warn 报缺键）
   - `summaries.en.json` —— 键 = `<seriesCode>`
   - `member-notes.en.json` —— 键 = `<seriesCode>|<repo名>`
3. 重跑 `collect-models.mjs`
4. 跑 `fix-quants.mjs`（删非权重文件，见上方警告）
5. 跑 `backfill-license.mjs`（见上方警告）
6. 跑 `audit-licenses.mjs` 确认合规
7. 跑 `build.mjs` 生成
8. **同步跨站数字**：`_data/glossary/terms/参数.md`（「N 系列 M 规格」）、`www.specul/index.html` 的徽标
   —— 这两处有 `_audit/content-freshness.mjs` 的「www枢纽」/learn 守卫盯着，漂了会报
9. 部署

**不要手改 `data/series/*.json`** —— 那是脚本产物，下次采集会被覆盖。

## 采集时踩过的坑（都写在代码注释里了）

| 坑 | 症状 | 解法 |
|---|---|---|
| **hf-mirror 限流静默失败** | 请求过密时返回非 200，看起来像 404 | 串行 + 900ms 固定间隔 + 指数退避 |
| **search 接口串模型** | 搜 `DeepSeek-V4-Flash` 搜出 `Qwen3.5-9B-DeepSeek-V4-Flash` | 硬过滤：仓名去掉 GGUF 后必须**等于**模型标识 |
| **微调衍生仓混入** | abliterated / uncensored / Distilled 下载量极高，霸占榜单 | `DERIVED` 正则排除；这些是二次发布不是量化版 |
| **`cardData.base_model` 不可靠** | 官方 GGUF 仓根本没这字段 | 不用它做锚定，改用仓名严格匹配 |
| **官方 GGUF 搜不到** | `openbmb/MiniCPM5-2B-GGUF` 索引缺失 | 按 `<org>/<Model>-GGUF` 约定名直接探测 |
| **bash 引号破坏 node 脚本** | `node -e` 里 `!==` 被 shell 吞 | 一律写成 `.mjs` 文件 |

## 法律立场

**只索引、只引述、不托管、不解读许可、不给法律意见。**

详见 [`docs/LEGAL.md`](docs/LEGAL.md)。核心是：我们只整理公开元数据并标注出处，
权重要下、去哪儿下、能不能商用——是发布者和你之间的事。

## 数据准确性承诺

| 级别 | 含义 | 页面标记 |
|---|---|---|
| **A 客观事实** | 直接从 API 读到的字段 | ✅ 实测字段 |
| **B 参数推导** | 由 A 按公开规则算出 | ✅ 推导 |
| **C 主观判断** | 我们的口径 | ❌ 我们的口径 |

**我们不写 C 级内容而不加标注。** 质量优劣、速度快慢这类需要实测的断言，本站一律不给。

## 相关站点

| 站点 | 作用 |
|---|---|
| [specul.com](https://specul.com/) | 首页 · 总入口 |
| [nav.specul.com](https://nav.specul.com/) | 导航 · AI 站点目录 |
| [agent.specul.com](https://agent.specul.com/) | Agent 图谱 · 成品 agent / harness / MCP 工具 |
| [learn.specul.com](https://learn.specul.com/) | 术语表 · 概念层 |
| [vg.specul.com](https://vg.specul.com/) | AI 做游戏 · 实践层 |

## 实测规模（A8）

<!-- STATS:BEGIN 由 _audit/gen-repo-docs.mjs 生成，勿手改 -->
| 项 | 实测值 |
|---|---|
| 系列 | 11 个 |
| 模型仓（members） | 16 个 |
| 量化档（variants） | 132 个 |
| GGUF 文件 | 1253 个 |
| 量化者 | 55 位 |
| 基座许可分布 | apache-2.0 8 · mit 4 · other 3 · openmdw-1.1 1 |
<!-- STATS:END -->
