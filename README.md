# AI Quantized LLM Atlas

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
# 采集（注意 hf-mirror 限流，串行 900ms 间隔，约 6~9 分钟）
node scripts/collect-models.mjs

# 审计（不合规则 exit 1，中止建站）
node scripts/audit-licenses.mjs

# 建站
node scripts/build.mjs
```

## 改系列名单的流程

1. 编辑 `config.js` 的 `SERIES` 数组
2. 重跑 `collect-models.mjs`
3. 跑 `audit-licenses.mjs` 确认合规
4. 跑 `build.mjs` 生成
5. 部署

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
| [ide.specul.com](https://ide.specul.com/) | IDE 图谱 · 产品层 |
| [cli.specul.com](https://cli.specul.com/) | CLI 图谱 · 产品层 |
| [mcp.specul.com](https://mcp.specul.com/) | MCP 图谱 · 组件层 |
| [keel.specul.com](https://keel.specul.com/) | 规划中 |
