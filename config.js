// ============================================================================
// 首批系列定稿 —— 由 select-v2.mjs / select-v3.mjs 的实测数据决定
// ----------------------------------------------------------------------------
// 选型标准（不是拍脑袋）：
//   1. 是该厂商的当前最新代（老代一律不采，如 Qwen3-30B-A3B / Llama-3 / Gemma-3）
//   2. 有第三方 GGUF 量化覆盖且下载量 > 30 万（说明本地部署圈真在用）
//   3. 规模本地可跑（7~35B 密集，或 MoE 且激活参数小）
//   4. 许可可核验（apache-2.0 / mit 优先；other 需标注原文链接）
//
// 数据来源：docs/final-candidates.json（GGUF 量化总下载量）
//   Qwen3.8-27B        21229k  ← 断层第一
//   gemma-4-E4B-it      3981k
//   Qwen3.8-Flash-Next  3716k
//   gemma-4-26B-A4B-it  2494k
//   gemma-4-31B-it      1748k
//   DeepSeek-V4-Flash   2035k
//   GLM-5.3             1935k
//   GLM-5.3-Flash       1266k
//   gpt-oss-20b          920k
//   Kimi-K3              459k
//   MiniCPM5-2B          363k
//
// 落选（量化热度过低，冷到没必要上站）：
//   Mistral-Small-4-119B  35k ｜ Llama-4-Scout  38k ｜ MiniMax-M3  17k ｜ Intern-S2  8k
// ============================================================================

export const SERIES = [
  {
    code: 'qwen3-8',
    name: { zh: '千问 3.8', en: 'Qwen3.8' },
    vendor: { zh: '阿里 · 通义千问', en: 'Alibaba Qwen' },
    family: 'qwen',
    released: '2026-08-05',
    summary: '阿里当前最新一代，27B 密集模型是本地部署圈热度最高的一个。',
    positions: ['通用对话', '工具调用', '长上下文', '中文强项'],
    // 一个系列可有多个规格（各规格独立一节）
    members: [
      {
        repo: 'Qwen/Qwen3.8-27B',
        label: { zh: 'Qwen3.8 27B（密集）', en: 'Qwen3.8 27B (Dense)' },
        params: '27.8B 密集',
        role: { zh: '主力通用', en: 'Flagship general' },
        note: 'apache-2.0，702 万下载。本站量化对比的基准型号。',
      },
      {
        repo: 'Qwen/Qwen3.8-Flash-Next',
        label: { zh: 'Qwen3.8 Flash-Next', en: 'Qwen3.8 Flash-Next' },
        params: '180B 总参（MoE，激活数未公开）',
        role: { zh: '轻量 / 端侧', en: 'Lightweight' },
        note: '许可为 other，使用前须读发布页许可原文。',
      },
    ],
    sources: { official: 'https://huggingface.co/Qwen/Qwen3.8-27B' },
  },

  {
    code: 'gemma-4',
    name: { zh: 'Gemma 4', en: 'Gemma 4' },
    vendor: { zh: 'Google', en: 'Google' },
    family: 'gemma',
    released: '2026-06',
    summary: 'Google 开放权重最新一代，三种规格各自都有量化覆盖。',
    positions: ['通用对话', 'MoE 稀疏', '小尺寸可跑'],
    members: [
      {
        repo: 'google/gemma-4-26B-A4B-it',
        label: { zh: 'Gemma 4 26B-A4B（MoE）', en: 'Gemma 4 26B-A4B (MoE)' },
        params: '25.8B 总参 / 4B 激活',
        role: { zh: '低延迟 MoE', en: 'Low-latency MoE' },
        note: 'MoE：总参 26B 但每 token 只激活约 4B，速度接近 4B 稠密。',
      },
      {
        repo: 'google/gemma-4-31B-it',
        label: { zh: 'Gemma 4 31B（密集）', en: 'Gemma 4 31B (Dense)' },
        params: '31.3B 密集',
        role: { zh: '质量优先', en: 'Quality first' },
        note: '同系列里最重的规格。',
      },
      {
        repo: 'google/gemma-4-E4B-it',
        label: { zh: 'Gemma 4 E4B（高效）', en: 'Gemma 4 E4B (Efficient)' },
        params: '8B 总参 / 4B 激活（E4B = 激活 4B）',
        role: { zh: '小显存首选', en: 'Low VRAM' },
        note: '小规格，量化覆盖 34 家，是入门本地部署最省资源的一档。',
      },
    ],
    sources: { official: 'https://huggingface.co/google/gemma-4-26B-A4B-it' },
  },

  {
    code: 'glm-5',
    name: { zh: 'GLM 5', en: 'GLM 5' },
    vendor: { zh: '智谱 AI', en: 'Zhipu AI' },
    family: 'glm',
    released: '2026-08-25',
    summary: '智谱当前最新一代，MIT 许可的 Flash 版对本地部署最友好。',
    positions: ['通用对话', '工具调用', 'MIT 许可'],
    members: [
      {
        repo: 'zai-org/GLM-5.3',
        label: { zh: 'GLM 5.3（完整版）', en: 'GLM 5.3 (Full)' },
        params: '754B 总参（MoE，激活数未公开）',
        role: { zh: '旗舰', en: 'Flagship' },
        note: '许可为 other，须读发布页原文。',
      },
      {
        repo: 'zai-org/GLM-5.3-Flash',
        label: { zh: 'GLM 5.3 Flash', en: 'GLM 5.3 Flash' },
        params: '321B 总参（MoE，激活数未公开）',
        role: { zh: '轻量主力', en: 'Lightweight main' },
        note: 'MIT 许可，本地部署法律上最干净的 GLM 选项。',
      },
    ],
    sources: { official: 'https://huggingface.co/zai-org/GLM-5.3' },
  },

  {
    code: 'deepseek-v4',
    name: { zh: 'DeepSeek V4', en: 'DeepSeek V4' },
    vendor: { zh: 'DeepSeek', en: 'DeepSeek' },
    family: 'deepseek',
    released: '2026-07-31',
    summary: 'MIT 许可，量化生态活跃，antirez（llama.cpp 作者）亲自维护量化版。',
    positions: ['通用对话', 'MIT 许可', '推理'],
    members: [
      {
        repo: 'deepseek-ai/DeepSeek-V4-Flash',
        label: { zh: 'DeepSeek V4 Flash', en: 'DeepSeek V4 Flash' },
        params: '292B 总参（MoE，激活数未公开）',
        role: { zh: '通用主力', en: 'General' },
        note: 'MIT 许可，47 家量化仓。',
      },
    ],
    sources: { official: 'https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash' },
  },

  {
    code: 'gpt-oss',
    name: { zh: 'gpt-oss', en: 'gpt-oss' },
    vendor: { zh: 'OpenAI', en: 'OpenAI' },
    family: 'gpt-oss',
    released: '2025-08-04',
    summary: 'OpenAI 唯一开放权重系列，20B 版是单卡本地部署的甜点。',
    positions: ['推理', 'MoE 稀疏', 'apache-2.0'],
    members: [
      {
        repo: 'openai/gpt-oss-20b',
        label: { zh: 'gpt-oss 20B', en: 'gpt-oss 20B' },
        params: '20B（MoE，约 3.6B 激活）',
        role: { zh: '单卡甜点', en: 'Single-GPU sweet spot' },
        note: 'apache-2.0，674 万下载。虽非最新代，但量化生态成熟且许可最干净。',
      },
    ],
    sources: { official: 'https://huggingface.co/openai/gpt-oss-20b' },
  },

  {
    code: 'kimi-k3',
    name: { zh: 'Kimi K3', en: 'Kimi K3' },
    vendor: { zh: '月之暗面', en: 'Moonshot AI' },
    family: 'kimi',
    released: '2026-06-13',
    summary: '月之暗面当前最新一代，41 家量化仓但整体热度中等。',
    positions: ['通用对话', '长上下文'],
    members: [
      {
        repo: 'moonshotai/Kimi-K3',
        label: { zh: 'Kimi K3', en: 'Kimi K3' },
        params: '2780B 总参（MoE，激活数未公开）',
        role: { zh: '通用', en: 'General' },
        note: '许可为 other，须读发布页原文。',
      },
    ],
    sources: { official: 'https://huggingface.co/moonshotai/Kimi-K3' },
  },

  {
    code: 'minicpm5',
    name: { zh: 'MiniCPM 5', en: 'MiniCPM 5' },
    vendor: { zh: '面壁智能 · OpenBMB', en: 'OpenBMB' },
    family: 'minicpm',
    released: '2026-08-27',
    summary: '国产小尺寸代表，2B 规模适合低显存与端侧。',
    positions: ['端侧', '小尺寸', '中文强项'],
    members: [
      {
        repo: 'openbmb/MiniCPM5-2B',
        label: { zh: 'MiniCPM5 2B', en: 'MiniCPM5 2B' },
        params: '2.5B 密集',
        role: { zh: '端侧首选', en: 'On-device' },
        note: '官方自己也出 GGUF（openbmb 249k 下载）。',
      },
    ],
    sources: { official: 'https://huggingface.co/openbmb/MiniCPM5-2B' },
  },
];

/** 量化者档案（人工撰写，站点会引用） */
export const QUANTIZER_NOTES = {
  unsloth: {
    zh: 'Unsloth', en: 'Unsloth',
    oneLine: { zh: '量化覆盖面最广、下载量最高的第三方量化者', en: 'Broadest coverage, highest downloads' },
  },
  'lmstudio-community': {
    zh: 'LM Studio Community', en: 'LM Studio Community',
    oneLine: { zh: 'LM Studio 官方社区组织，为其 GUI 客户端供包', en: 'Powers the LM Studio GUI' },
  },
  'ggml-org': {
    zh: 'ggml-org', en: 'ggml-org',
    oneLine: { zh: 'llama.cpp 所属组织的官方量化发布', en: 'Official quant builds from the llama.cpp org' },
  },
  bartowski: {
    zh: 'bartowski', en: 'bartowski',
    oneLine: { zh: '老牌量化者，档位命名规范、说明文档最完整', en: 'Veteran quantizer, best-documented naming' },
  },
  mradermacher: {
    zh: 'mradermacher', en: 'mradermacher',
    oneLine: { zh: 'Mirostat 作者，长期做低比特实验性量化', en: 'Known for experimental low-bit quants' },
  },
  antirez: {
    zh: 'antirez', en: 'antirez',
    oneLine: { zh: 'Redis 作者 / llama.cpp 主要作者，亲自发量化版', en: 'Redis & llama.cpp author, ships his own quants' },
  },
  'ISTA-DASLab': {
    zh: 'ISTA-DASLab', en: 'ISTA-DASLab',
    oneLine: { zh: '研究机构出品，GSQ / RCO 等量化方法', en: 'Research lab; GSQ / RCO quant methods' },
  },
  openbmb: {
    zh: '面壁智能官方', en: 'OpenBMB official',
    oneLine: { zh: '模型方自己出的 GGUF（最可信的一档）', en: 'Published by the model authors themselves' },
  },
  google: {
    zh: 'Google 官方', en: 'Google official',
    oneLine: { zh: '模型方自己出的 GGUF', en: 'Published by the model authors themselves' },
  },
};

/** 已知降权的量化者（微调衍生仓占比过高 / 个人玩家，与「纯量化对比」目标不符） */
export const SECONDARY_QUANTIZERS = new Set([
  // 微调衍生为主
  'cdiamond', 'JonathanColetti', 'HauhauCS', 'DavidAU', '0bserverx', 'peculiar-ragdoll',
  'OBLITERATUS', 'esatapedico', 'z-lab', 'byteshape', 'empero-ai', 'ukisai', 'orcarouter',
  'chimingw', 'philbert440', 'cyjin-yl', 'nerkyor', 'Bucoid', 'llmfan46', 'agentionai',
  'zerodigest', 'bottlecapai', 'outsourc-e', 'AtomicChat', 'julianmb', 'KVCache-ai', 'straino',
  'continuum-ai', 'deucebucket', '1bit-MONSTER', 'yuseiito', 'meshllm', 'ReadyArt', 'mudler',
  'Mungert', 'AesSedai', 'AetherKelly00', 'apetersson', '0ppxnhximxr', 'abenzerps',
  'jjx', 'prithivMLmods', 'sokann', 'amphither', 'Earendil-Workshop', 'Igor',
  // 个人玩家 / 随手发布（真实数据：首轮采集 53 位量化者里过半是这类）
  'Kuberwastaken', 'vcruz305', '6block', 'CoboSan', 'Hagwell', 'ddh0', 'backpack-run',
  'batiai', 'Riyan200324200324', 'stressthismess', 'hudabey', 'GrEarl', 'qtum',
  'zurichquants',   'lausannequants', 'aria220', 'Amynnnn', 'giladgd', 'gooseyai',
  'ngquocvinh', 'saidutta69', 'eaddario', 'NANI-Nithin', 'Abiray', 'WhiskyAKM',
  'L-Alchemyst', 'Coder40-95', 'muzzy', 'Guile', 'grapeV-ai', 'indiansatoshi',
  'teamblobfish', 'bullerwins', 'Preyazz', 'aj9o9', 'tarruda',
  // 第二轮采集新发现的个人玩家
  'Nil626yhh', 'lazywold', 'Serpen', 'Cash4lyfe101', 'Yaspas', 'peasantsmith',
  'iTQm', 'NeverSleep', 'slaren', 'dphn', 'Apertus', 'OwlMaster',
]);

/** 主量化者：优先展示（有社区影响力 / 档位覆盖广 / 有 imatrix） */
export const PRIMARY_QUANTIZERS = new Set([
  'unsloth', 'bartowski', 'mradermacher', 'lmstudio-community', 'ggml-org',
  'antirez', 'ISTA-DASLab', 'openbmb', 'google', 'Qwen', 'lmstudio', 'nightmedia',
]);
