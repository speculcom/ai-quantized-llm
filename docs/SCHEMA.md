# Models 站数据 Schema

> 唯一真相源：`data/series/*.json` 由 `scripts/collect-models.mjs` 生成，**不要手改**。
> 人工补充内容放 `data/quantizers/*.md`（量化者档案）。

## 一句话定位

**本站只回答一个问题：这个基础模型，我该下载哪个量化版、为什么。**

不是模型评测站，不跑 benchmark，不给主观优劣排名。所有条目都必须能点回发布页核对。

## 三级可信度（页面上必须标出来）

| 级别 | 含义 | 例子 | 标记 |
|---|---|---|---|
| A 客观事实 | 从 HF API 直接读到的字段 | 文件体积、上下文长度、许可、架构 | ✅ 实测字段 |
| B 参数推导 | 由 A 按明确规则算出 | 量化位数↔体积档位、显存需求区间 | ✅ 推导 |
| C 主观优劣 | 我们的判断 | 「更稳」「更慢」「适合长文」 | ❌ 我们的口径 |

C 级内容必须写成「我们的口径」并说明依据，不允许伪装成 A。

## series/*.json

```jsonc
{
  "code": "qwen3",                 // 短码，用于 URL /series/qwen3/
  "name": { "zh": "千问 3", "en": "Qwen3" },
  "vendor": { "zh": "阿里通义", "en": "Alibaba" },
  "family": "qwen3",              // 用于跨系列聚合
  "released": "2025-04-28",       // 首次发布日
  "summary": "…",                 // 一句话定位（≤60 字）
  "positions": ["通用对话", "长上下文", "MoE 稀疏"],  // 定位标签
  "sources": {
    "official": "https://huggingface.co/Qwen/Qwen3-30B-A3B",
    "paper":    "https://arxiv.org/abs/2505.09388",
    "api":      "https://hf-mirror.com/api/models/Qwen/Qwen3-30B-A3B"
  },

  // 基础模型本体（官方仓）
  "base": {
    "repo": "Qwen/Qwen3-30B-A3B",
    "url":  "https://huggingface.co/Qwen/Qwen3-30B-A3B",
    "license": "apache-2.0",
    "licenseUrl": "https://huggingface.co/Qwen/Qwen3-30B-A3B/blob/main/LICENSE",
    "pipeline": "text-generation",
    "downloads": 123456,
    "likes": 890,
    "lastModified": "2026-08-01T…",
    "params": "30.5B (MoE, 3.3B 激活)",
    "contextLength": 40960,          // 若 API 未给则 null
    "architecture": "qwen3moe"
  },

  // 官方直出的 GGUF（若有）—— 与第三方量化严格分开
  "officialGguf": {
    "repo": "Qwen/Qwen3-30B-A3B-GGUF",
    "url": "https://huggingface.co/Qwen/Qwen3-30B-A3B-GGUF",
    "note": "官方出品，仅 Q8_0 / Q4_K_M 等少数几档"
  },

  // 第三方量化变体（核心）
  "variants": [
    {
      "quantizer": "unsloth",              // → data/quantizers/unsloth.md
      "repo": "unsloth/Qwen3-30B-A3B-GGUF",
      "url": "https://huggingface.co/unsloth/Qwen3-30B-A3B-GGUF",
      "license": "apache-2.0",
      "licenseNote": "继承基础模型许可；量化产物本身由量化者发布",
      "downloads": 456789,
      "likes": 1234,
      "lastModified": "2026-07-11T…",
      "contextLength": 40960,              // 来自 gguf.context_length
      "architecture": "qwen3moe",
      "imatrix": true,                     // 是否带 importance matrix
      "imatrixFile": "imatrix_unsloth.dat",
      "chatTemplate": "qwen3",             // 推断，供 llama.cpp 用户参考
      "files": [
        {
          "name": "Qwen3-30B-A3B-Q4_K_M.gguf",
          "sizeBytes": 18310000000,
          "sizeGB": 17.1,
          "quant": "Q4_K_M",               // 归一化后的量化标签
          "bitsPerWeight": 4.83,            // B 级：按 llama.cpp 命名标准推算
          "tier": "主力档",
          "isSharded": false,
          "note": "多数人第一次下载的档位"
        }
      ],
      "coverage": 27,                      // 该仓提供多少个量化档
      "totalGB": 210.4                     // 该仓全部 gguf 总体积
    }
  ],

  "collectedAt": "2026-09-30T12:00:00Z",   // 采集时间戳（页脚显示）
  "schemaVersion": 1
}
```

## 字段来源对照

| 字段 | 来源 | 级别 |
|---|---|---|
| `files[].sizeBytes` | `GET /api/models/{id}/tree/main?recursive=1` → `size` | A |
| `contextLength` | `GET /api/models/{id}` → `gguf.context_length` | A |
| `architecture` | 同上 → `gguf.architecture` | A |
| `imatrix` | 同上 → `gguf.quantize_imatrix_file` | A |
| `license` | 同上 → `cardData.license` | A |
| `base_model` | 同上 → `cardData.base_model`（溯源到基础模型） | A |
| `downloads` / `likes` | 同上顶层字段 | A |
| `files[].name` | tree API 的 `path` | A |
| `bitsPerWeight` | 由文件名量化标签按 llama.cpp 公开命名标准推算 | B |
| `tier` | 由 `bitsPerWeight` 落档（见下） | B |
| `quantizer` | 仓库 owner 名 | A |

## 量化档位 tier 规则（B 级，可复现）

| tier | bitsPerWeight | 含义 |
|---|---|---|
| 极限压缩 | < 3.0 | 能跑就行，质量明显掉 |
| 长上下文优先 | 3.0–3.7 | KV 也吃紧时的选择 |
| 平衡档 | 3.7–5.0 | 默认推荐 |
| 保守档 | 5.0–7.0 | 几乎无质量损失 |
| 近似无损 | > 7.0 | 体积与 BF16 接近 |

## 命名归一化

不同量化者命名不一致，统一映射：

| 原始 | 归一 |
|---|---|
| `Q4_K_M` / `q4_k_m` | `Q4_K_M` |
| `IQ4_XS` | `IQ4_XS` |
| `BF16` / `F16` 分片 | `BF16`（isSharded=true） |
| `UD-Q4_K_XL` | `UD-Q4_K_XL`（unsloth 动态量化） |

## 硬约束（audit-licenses.mjs 强制）

1. 每条 `variants[]` 必须有非空 `license`，否则构建失败
2. 每条 `variants[]` 必须有 `url`，指向 HF 发布页
3. 每条必须能通过 `url` 反查到 `repo`
4. 不下载、不托管任何权重文件
5. gated 仓库（401/403）**跳过并记录**，不尝试绕过
