// ============================================================================
// 建站：把 data/series/*.json + data/quantizers/*.md 渲染成静态站
// ----------------------------------------------------------------------------
// 设计：复用 _sites/_template/shell.mjs（品牌唯一真相源），不另起一套 header/footer。
// 产物：site/index.html（系列总览）+ site/series/<code>.html（六区块详情页）
// 时间：秒级（纯本地渲染）
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERIES, QUANTIZER_NOTES } from '../config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SITE = path.join(ROOT, 'site');
// ROOT = _data/models；品牌 shell 在工作区根的 _sites/_template/，所以要上溯两级。
const WORKSPACE = path.resolve(ROOT, '..', '..');
const { shell, esc } = await import(
  'file:///' + path.join(WORKSPACE, '_sites', '_template', 'shell.mjs').replace(/\\/g, '/')
);

const ACCENT = '#22d3c5';
const DOMAIN = 'https://models.specul.com/';

// ── 读数据 ──────────────────────────────────────────────────────────────
const seriesList = fs.readdirSync(path.join(ROOT, 'data', 'series'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'series', f), 'utf8')));

const quantizerDocs = {};
const qDir = path.join(ROOT, 'data', 'quantizers');
if (fs.existsSync(qDir)) {
  for (const f of fs.readdirSync(qDir).filter((x) => x.endsWith('.md'))) {
    quantizerDocs[f.replace(/\.md$/, '')] = fs.readFileSync(path.join(qDir, f), 'utf8');
  }
}

// ── 许可显示 ────────────────────────────────────────────────────────────
const LOOSE = /^(apache-2\.0|mit|bsd-3-clause|bsd-2-clause|isc|0bsd|cc0-1\.0|unlicense)$/i;
// asSpan=true 时输出 <span> 而非 <a> —— 用于「外层已是 <a>」的场景。
// 嵌套 <a> 是非法 HTML：浏览器解析到内层 </a> 就会关闭外层 <a>，
// 导致它后面的兄弟节点全部被移出卡片（实测 .scard-lic / .scard-go 直接从 DOM 消失）。
function licBadge(lic, { asSpan = false } = {}) {
  if (!lic) return `<span class="lic lic-unknown">许可缺失</span>`;
  const loose = LOOSE.test(lic);
  const cls = `lic ${loose ? 'lic-loose' : 'lic-tight'}`;
  if (asSpan) return `<span class="${cls}">${esc(lic)}</span>`;
  return `<a class="${cls}" href="https://huggingface.co/search?license=${encodeURIComponent(lic)}" target="_blank" rel="noopener">${esc(lic)}</a>`;
}
const NEEDS_REVIEW = /^(other|unknown|cc-by|gpl|agpl|openrail|bigscience|noassertion)/i;

// 量化仓自己没写 license 字段时，backfill-license.mjs 会继承基座许可并打上这两个标记。
// 继承在著作权上是必然的（量化只是对权重做舍入/缩放/imatrix 加权的数学变换，不新增也不删除
// 原始表达），但「谁做的量化、用的什么 imatrix」是量化者自己的行为 —— 所以标注出来，
// 让读者知道这个许可值是推断来的、且需要自己去读基座原文。
function licInheritedNote(v, { small = true } = {}) {
  if (!v || !v.licenseInherited) return '';
  const cls = small ? 'warn-inline small' : 'warn-inline';
  return `<br><span class="${cls}">继承自基座 <code>${esc(v.licenseFrom || '?')}</code>　·　量化仓未单独声明许可</span>`;
}

// ── 数字格式 ────────────────────────────────────────────────────────────
const fmtGB = (n) => (n >= 10 ? n.toFixed(0) : n.toFixed(1)) + ' GB';
const fmtNum = (n) => {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'k';
  return String(n);
};
const fmtDate = (iso) => (iso ? iso.slice(0, 10) : '—');
// 参数量：按人类习惯选单位（2780 亿 → 2.78T），不出现「2779.93B」这种别扭写法。
const fmtB = (n) => {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(0) + 'M';
  return fmtNum(n);
};
// 显存估算（B 级推导）：权重体积 + KV cache
// KV ≈ 2 (K+V) × layers × kvDim × ctx × bytesPerElem；MoE 需总参，架构差异大 → 只给区间
function vramRange(f) {
  const w = f.sizeGB;
  if (w < 8) return `≥ ${Math.ceil((w * 1.15) / 2) * 2} GB`;
  if (w > 60) return `多卡 / 分层加载`;
  return `≈ ${Math.ceil((w * 1.15) / 4) * 4} GB（仅权重）`;
}

const TIER_ORDER = ['近似无损', '保守档', '平衡档', '长上下文优先', '极限压缩', '未识别'];
function tierOf(t) { return TIER_ORDER.indexOf(t); }

// ═════════════════════════════════════════════════════════════════════════
// 组件
// ═════════════════════════════════════════════════════════════════════════

/** 顶部：可信度分级说明（每页都带，这是本站的差异化） */
function trustBanner() {
  return `    <section class="trust">
      <h2>先说清楚：这个站的数据怎么来的</h2>
      <div class="trust-grid">
        <div class="trust-item t-a">
          <span class="trust-tag">✅ 实测字段</span>
          <p>直接从 Hugging Face 公开 API 读取的客观数据：文件体积（字节）、上下文长度、架构、许可、下载量、更新时间。</p>
        </div>
        <div class="trust-item t-b">
          <span class="trust-tag">✅ 推导</span>
          <p>由实测字段按公开规则算出：每权重比特数（依 llama.cpp 命名标准）、档位归属、显存需求区间。推导规则在 <code>METHODOLOGY.md</code> 完整公开，任何人可复算。</p>
        </div>
        <div class="trust-item t-c">
          <span class="trust-tag">❌ 我们不说的</span>
          <p><b>哪个量化质量更高、哪个更快、哪个模型更强</b>——这些需要实测，本站不跑 benchmark，所以不装作知道。凡我们给出的主观判断，一律显式标注「我们的口径」。</p>
        </div>
      </div>
      <p class="trust-foot">
        本站<b>不下载、不托管任何模型权重文件</b>。所有数字都来自公开元数据，点击即可回到发布页核对。
        采集时间：<code>${esc(seriesList[0]?.collectedAt?.slice(0, 10) || '')}</code>（数据快照，非实时）
      </p>
    </section>`;
}

/**
 * 架构 / 上下文长度实际存在**变体级**（各量化仓独立申报，同一模型不同仓可能不同），
 * 成员级没有这两个字段。A 区要展示的是「这个模型的情况」，
 * 所以：取值域唯一就直接显示，出现分歧就列出全部并标注分歧。
 */
function memberField(m, key) {
  const vals = [...new Set((m.variants || []).map((v) => v[key]).filter(Boolean))];
  return { vals, single: vals.length === 1 ? vals[0] : null, conflict: vals.length > 1 };
}

/** 系列页 · A 区块：基础模型卡 */
function blockA(s, m) {
  const arch = memberField(m, 'architecture');
  const ctx = memberField(m, 'contextLength');
  const archCell = arch.single
    ? `<code>${esc(arch.single)}</code>`
    : arch.conflict
      ? `${arch.vals.map((v) => `<code>${esc(v)}</code>`).join(' / ')} <span class="muted small">（各量化仓申报不一）</span>`
      : '<span class="muted">— 未申报</span>';
  const ctxCell = ctx.single
    ? `<code>${Number(ctx.single).toLocaleString('en-US')}</code> tokens`
    : ctx.conflict
      ? `${ctx.vals.map((v) => `<code>${Number(v).toLocaleString('en-US')}</code>`).join(' / ')} tokens <span class="muted small">（各量化仓申报不一）</span>`
      : '<span class="muted">— 未申报</span>';

  // ── 参数量：三个独立来源并排，让用户自己判断信哪个 ──
  // 官网标注（人工核过发布页）/ HF 官方 API 申报（safetensors 张量计数）/
  // 实测反推（GGUF 文件字节 ÷ 该档 bpw）。三者一致时可信度最高。
  const dp = m.declaredParams || null;
  const dv = m.derivedParams || null;
  const paramRows = [
    ['官网标注', `<b>${esc(m.params || '—')}</b>`],
    ['官方 API 申报', dp ? `${fmtB(dp)} <span class="muted small">（按 safetensors 张量逐个计数）</span>` : '<span class="muted">—</span>'],
    ['本站实测反推', dv ? `${fmtB(dv)} <span class="muted small">（GGUF 字节 ÷ 该档 bpw，取最密集簇中位）</span>` : '<span class="muted">—</span>'],
  ];
  // 两来源偏差 > 4% 时明确提示：反推受 bpw 表误差与未训练张量影响，官方申报为准。
  const dvDelta = dp && dv ? ((dv - dp) / dp) * 100 : null;
  const paramNote = dvDelta === null ? '' :
    Math.abs(dvDelta) < 4
      ? `<p class="param-ok">✓ 官方申报与实测反推一致（偏差 ${dvDelta.toFixed(1)}%），参数量可信。</p>`
      : `<p class="warn-inline">⚠ 实测反推与官方申报差 ${Math.abs(dvDelta).toFixed(0)}%（反推${dvDelta > 0 ? '偏大' : '偏小'}）。原因是 bpw 表为标称值、且部分张量（嵌入层、视觉塔）不按主档位量化。<b>以官方申报为准</b>。</p>`;

  const paramCell = `<table class="kv kv-nested">
        <tbody>
${paramRows.map(([k, v]) => `          <tr><th>${k}</th><td>${v}</td></tr>`).join('\n')}
        </tbody>
      </table>${paramNote}`;

  // ── 权重精度构成：官方 API 按张量精度分类的计数 ──
  // 这个字段信息量很大：MoE 专家常原生就存 U8/I8，与主档位无关。
  const bd = m.declaredBreakdown?.parameters;
  const bdCell = bd && Object.keys(bd).length
    ? `<table class="prec"><tbody>${Object.entries(bd)
        .sort((a, b) => b[1] - a[1])
        .map(([p, n]) => {
          const tot = Object.values(bd).reduce((x, y) => x + y, 0);
          const pct = ((n / tot) * 100).toFixed(1);
          return `<tr><td><code>${esc(p)}</code></td><td class="prec-bar"><span style="width:${Math.max(0.6, (n / tot) * 100).toFixed(1)}%"></span></td><td>${fmtB(n)}　<span class="muted small">${pct}%</span></td></tr>`;
        }).join('')}</tbody></table>`
    : '<span class="muted">—</span>';

  // ── 标签：过滤后只留下有决策价值的（许可/论文/任务类型/推理框架） ──
  const tagCell = (m.tags || []).length
    ? (m.tags || []).map((t) => {
        let cls = 'tag';
        if (/^license:/.test(t)) cls += ' tag-lic';
        else if (/^arXiv:/.test(t)) cls += ' tag-paper';
        else if (/^(vllm|llama\.cpp|mlx|onnx|openvino|tgi|webgpu|webnn|candle|sgml|compressed-tensors)$/i.test(t)) cls += ' tag-rt';
        const href = /^arxiv:/i.test(t)
          ? `https://arxiv.org/abs/${t.slice(6)}`
          : /^license:apache-2\.0$/i.test(t) ? 'https://www.apache.org/licenses/LICENSE-2.0'
            : /^license:mit$/i.test(t) ? 'https://opensource.org/license/mit'
              : null;
        return href ? `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener">${esc(t)}</a>` : `<span class="${cls}">${esc(t)}</span>`;
      }).join(' ')
    : '<span class="muted">—</span>';

  // 访问门槛：gated 模型要先申请、同意才能下载，这是选型时的硬约束。
  const accessCell = m.gated
    ? '<b class="warn-inline">🔒 需申请授权</b>　<span class="muted">Hugging Face 上该仓为 gated，下载前需登录并获得发布方授权。</span>'
    : '✅ 公开下载　<span class="muted">无需申请</span>';

  // 基座：微调版要说明它是从哪个基座来的
  const baseModel = m.baseModel
    ? (Array.isArray(m.baseModel) ? m.baseModel : [m.baseModel]).filter(Boolean)
        .map((b) => `<code>${esc(String(b).split('/').pop())}</code>`).join(' / ')
    : (m.isBase ? '<span class="muted">本仓即基座（不是微调版）</span>' : '<span class="muted">—</span>');

  const storage = m.usedStorage
    ? `<b>${fmtGB(m.usedStorage / 1e9)}</b>　<span class="muted small">该仓全部文件合计，含各精度原始权重</span>`
    : '<span class="muted">—</span>';

  const rows = [
    ['官方发布页', `<a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.repo)} ↗</a><br><span class="muted small">${esc(m.modelType ? 'HF model_type：' + m.modelType : '')}${m.hfArch?.length ? '　·　' + esc(m.hfArch.join(' / ')) : ''}</span>`],
    ['许可', `${licBadge(m.license)}${m.licenseName ? ` <code>${esc(m.licenseName)}</code>` : ''}${m.licenseLink ? ` <a class="lic-src" href="${esc(m.licenseLink)}" target="_blank" rel="noopener">许可原文 ↗</a>` : ''}${NEEDS_REVIEW.test(m.license || '') ? '<p class="warn-inline">⚠ 非宽松许可，<b>以发布页原文为准</b>。本站不解读许可条款，也不给法律意见。</p>' : ''}`],
    ['访问门槛', accessCell],
    ['规模', paramCell],
    ['权重精度构成', bdCell],
    ['架构', archCell],
    ['上下文长度', ctxCell],
    ['基座', baseModel],
    ['任务类型', m.pipelineTag ? `<code>${esc(m.pipelineTag)}</code>` : '<span class="muted">—</span>'],
    ['定位', esc(m.role?.zh || '')],
    ['标签', tagCell],
    ['官方下载量', `<b>${fmtNum(m.downloads)}</b>　<span class="muted">点赞 ${fmtNum(m.likes)}</span>`],
    ['发布日', m.createdAt ? fmtDate(m.createdAt) : '<span class="muted">—</span>'],
    ['最近更新', fmtDate(m.lastModified)],
    ['发布页体积', storage],
  ];
  return `      <table class="kv">
${rows.map(([k, v]) => `        <tr><th>${k}</th><td>${v}</td></tr>`).join('\n')}
      </table>
      ${m.note ? `      <p class="member-note">${esc(m.note)}</p>` : ''}`;

}

/** 系列页 · B 区块：该选哪个（决策区） */
function blockB(s, m) {
  // 汇总所有变体里各档位的最小体积 → 给出「按你的显存选哪档」。
  //
  // 取最小值的前提是「同名档位的体积差异只来自不同量化者的实现差异」。
  // 实测（Qwen3.8-27B / gemma-4-E4B 等）同档名确实会带出不同的权重布局：
  //   -AD-<bpw>- 前缀（all-density 混合精度，bpw 更低 → 体积更小）
  //   -PLEQ4_0 后缀（动态上下文扩展附加）
  //   -DENSE 后缀（Kimi-K3-UD-IQ1_S_DENSE 320GB vs 非 DENSE 594GB）
  //   bf16_q8_0 / f16_q8_0（精度标注变体，通常更大）
  // 取最小值 = 「最省的可行方案」，这与「按显存选档」的目的（找能装下的最轻档）一致；
  // 但必须把「该档存在多个变体、体积跨度多少」如实标出来，否则用户会以为
  // 同一档名的所有文件都长这样。变体数与跨度记在 n / span 上，在展开表里显示。
  const byQuant = new Map();
  for (const v of m.variants) {
    for (const f of v.files) {
      // 注意：isSharded 的文件在采集阶段已按「去掉 -NNNNN-of-NNNNN 后缀」聚合成一条记录，
      // sizeGB 是全部分片之和 —— 所以**不能**因为 isSharded 就排除，否则 Kimi-K3
      // （全部成员都是分片）这类大模型的显存选档表会整张空掉。
      if (f.tier === '未识别') continue;
      if (!f.sizeGB || f.sizeGB <= 0) continue;
      const cur = byQuant.get(f.quant);
      if (!cur) {
        byQuant.set(f.quant, {
          ...f, by: v.quantizer, repo: v.repo, url: v.url,
          n: 1, maxGB: f.sizeGB,
        });
      } else {
        cur.n += 1;
        if (f.sizeGB < cur.sizeGB) {
          // 换成了更小的代表：把来源信息一起带走，并保留此前的最大值
          const keepMax = Math.max(cur.maxGB, f.sizeGB);
          Object.assign(cur, f, { by: v.quantizer, repo: v.repo, url: v.url, maxGB: keepMax });
        } else if (f.sizeGB > cur.maxGB) {
          cur.maxGB = f.sizeGB;
        }
      }
    }
  }
  const rows = [...byQuant.values()].sort((a, b) => a.bitsPerWeight - b.bitsPerWeight);

  // 运行方式分档。为什么要分两类：
  // 「显存档」是单卡全量装得下（llama.cpp 会把权重全放 GPU，推理最快）；
  // 「内存 / 多卡档」是显存的替代路径 —— llama.cpp 的 `-ngl` 可以只把部分层放显存，
  // 剩下的落系统内存（纯 CPU 运行），或跨多卡切分（张量并行）。
  // 不区分这两类会给用户错误建议：Kimi-K3 最小档 540 GB 在任何单卡上都不存在，
  // 但它并不是「不能跑」，而是「要按 CPU 卸载或多卡的方式跑」。
  const GPU_BUDGETS = [
    { gb: 8, label: '8 GB 显存', note: '共享显卡 / 老卡，够跑小MoE 与 2B 级' },
    { gb: 12, label: '12 GB 显存', note: 'RTX 3060 12G / 4050 12G' },
    { gb: 16, label: '16 GB 显存', note: 'RTX 4060 Ti 16G / 5060 Ti 16G' },
    { gb: 24, label: '24 GB 显存', note: 'RTX 3090 / 4090 / 5090' },
    { gb: 48, label: '48 GB 显存', note: 'RTX A6000 / L40S / A100 40G×2' },
    { gb: 80, label: '80 GB 显存', note: 'A100 80G / H100 80G / Mac Studio 大统一内存' },
  ];
  // 系统内存档：llama.cpp 纯 CPU 推理（全部权重落内存），以及多卡切分。
  const RAM_BUDGETS = [
    { gb: 64, label: '64 GB 系统内存', kind: 'cpu', note: '纯 CPU 推理，速度慢但可跑；建议开swap 兜底' },
    { gb: 128, label: '128 GB 系统内存', kind: 'cpu', note: '工作站标准配置，纯 CPU 可跑中等规模 MoE' },
    { gb: 256, label: '256 GB 统一内存 / 多卡', kind: 'multi', note: 'Mac Studio / 服务器内存，或 2~4 张 80G 卡张量并行' },
    { gb: 640, label: '640 GB+ 内存 / 8×80G', kind: 'multi', note: '超大 MoE 的门槛，需要多卡切分或大内存服务器' },
  ];

  const fitRows = (list, kind) => list.map((b) => {
    const fits = rows.filter((r) => r.sizeGB * 1.15 <= b.gb);
    if (fits.length === 0) {
      const why = kind === 'cpu'
        ? '内存装不下最小档'
        : '显存装不下最小档';
      return `        <tr><th>${b.label}</th><td class="no-fit">${esc(why)}（最小 ${rows[0] ? rows[0].sizeGB.toFixed(1) + ' GB' : '—'}）<br><span class="muted">${esc(b.note)}</span></td></tr>`;
    }
    const best = fits.reduce((a, c) => (tierOf(c.tier) < tierOf(a.tier) ? c : a));
    // 「更省」必须体积严格小于 best。原写法是fits.filter(≠best).slice(-2)，
    // 只保证 bpw 更大 —— 但不同量化者的 imatrix / 量化方法不同，
    // 更大 bpw 的档体积反而可能更大（实测Kimi-K3 里出现「更省: TQ2_0 551 GB」
    // 而推荐档只有 540 GB），标成「更省」却更大是错的。
    const also = fits
      .filter((f) => f.quant !== best.quant && f.sizeGB < best.sizeGB)
      .sort((a, c) => c.sizeGB - a.sizeGB)
      .slice(0, 2);
    const extra = kind === 'cpu'
      ? '<br><span class="muted small">纯 CPU 会明显慢于 GPU；若显存够，优先用上面的单卡档</span>'
      : '';
    return `        <tr>
          <th>${b.label}</th>
          <td>
            <b>${esc(best.quant)}</b>（${fmtGB(best.sizeGB)} · ${esc(best.tier)}）
            ${also.length ? `<br><span class="muted">更省：${also.map((a) => `${esc(a.quant)} ${fmtGB(a.sizeGB)}`).join(' / ')}</span>` : ''}
            <br><span class="muted">${esc(b.note)}</span>${extra}
          </td>
        </tr>`;
  }).join('\n');

  const minSize = rows.length ? rows[0].sizeGB : null;
  const maxSize = rows.length ? rows[rows.length - 1].sizeGB : null;
  // 超大 MoE 提示：最小档就超过单卡上限时，必须显式说明「不是不能跑，是要换运行方式」
  const hugeNote = minSize && minSize > 80
    ? `<p class="warn-note"><b>先看这一条：</b>本系列最小档（${fmtGB(minSize)}）已超过任何单张消费级显卡，
        所以<span class="nowrap">不存在「买张大卡就能跑」的选项</span>。可选路径是
        <b>①</b> 大内存机器纯 CPU 推理、<b>②</b> 多卡张量并行、<b>③</b> 选同系列的小规格成员。
        下面的表按这两类运行方式给出建议。</p>`
    : '';

  return `      <p class="block-lead">按「你实际能腾出多少显存或内存」选档位，而不是按参数猜。下面每档的体积都是<b>实测值</b>（来自发布页文件列表），<b>加权 15% 余量</b>给运行时与 KV cache。</p>
      ${hugeNote}
      <h3 class="budget-h">单卡全量装得下（最快）</h3>
      <table class="budget">
        <caption>显存 → 档位速查（权重全部放显存，推理最快）</caption>
        <tbody>
${fitRows(GPU_BUDGETS, 'gpu')}
        </tbody>
      </table>
      <h3 class="budget-h">显存不够时的替代路径</h3>
      <p class="muted small">llama.cpp 的 <code>-ngl</code> 可以只把部分层放显存、其余落系统内存；多卡则自动切分。
        代价是速度：纯 CPU 推理通常比同规模 GPU 慢数倍，但同样能出结果。</p>
      <table class="budget">
        <caption>系统内存 / 多卡 → 档位速查</caption>
        <tbody>
${fitRows(RAM_BUDGETS, 'cpu')}
        </tbody>
      </table>
      ${maxSize ? `<p class="muted small">本系列档位体积跨度 ${fmtGB(minSize)} → ${fmtGB(maxSize)}。
        跨度过大说明同一系列的量化选择空间很宽，这正是量化选型的主要收益所在。</p>` : ''}
      <details class="all-quants">
        <summary>展开：本系列所有档位的实测体积（${rows.length} 档）</summary>
        <table class="quant-list">
          <thead><tr><th>量化档</th><th>最小体积</th><th>每权重比特</th><th>档位</th><th>该档文件数 / 体积跨度</th><th>最小体积来源</th></tr></thead>
          <tbody>
${rows.map((r) => `            <tr>
              <td><code>${esc(r.quant)}</code></td>
              <td><b>${fmtGB(r.sizeGB)}</b></td>
              <td>${r.bitsPerWeight?.toFixed(2) ?? '—'}<span class="muted"> bpw</span></td>
              <td><span class="tier tier-${TIER_ORDER.indexOf(r.tier)}">${esc(r.tier)}</span></td>
              <td class="muted small">${r.n} 个${r.maxGB > r.sizeGB * 1.05 ? ` · ${fmtGB(r.sizeGB)}~${fmtGB(r.maxGB)}` : ''}</td>
              <td class="muted"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.by)}</a></td>
            </tr>`).join('\n')}
          </tbody>
        </table>
        <p class="muted small">「每权重比特」是按 llama.cpp 公开命名标准从文件名推导的，同一档位在不同模型上的真实值会略有差异。这是 <b>B 级推导</b>，不是实测值。</p>
        <p class="muted small"><b>关于「最小体积」与「变体」：</b>同名档位下可能有多个不同文件
          （不同量化者的实现差异，或带 <code>-AD-</code> 混合精度、<code>-PLEQ4_0</code> 上下文扩展、
          <code>-DENSE</code> 等后缀的特殊变体）。上表取的是该档<b>最省的可行体积</b>，
          「体积跨度」列给出该档实际的体积范围——跨度大说明该档内部差异明显，
          选具体文件时请以跨度上界为准。</p>
      </details>`;
}

/** 系列页 · C 区块：量化版本总表 */
function blockC(s, m) {
  const trs = m.variants.map((v) => {
    const rec = v.recommended;
    const ctx = v.contextLength ? Number(v.contextLength).toLocaleString('en-US') : '—';
    return `          <tr>
            <td>
              ${v.isOfficial ? '<span class="badge badge-off">官方</span> ' : ''}<a href="${esc(v.url)}" target="_blank" rel="noopener"><code>${esc(v.quantizer)}</code></a>
              ${v.imatrix ? '<span class="badge badge-im" title="带重要性矩阵，量化质量通常更稳">imatrix</span>' : ''}
              ${v.architecture ? `<br><span class="muted small"><code>${esc(v.architecture)}</code></span>` : ''}
            </td>
            <td>${licBadge(v.license)}${NEEDS_REVIEW.test(v.license || '') ? '<br><span class="warn-inline small">须读原文</span>' : ''}${licInheritedNote(v)}</td>
            <td class="num">${v.coverage}</td>
            <td class="num">${fmtGB(v.totalGB)}</td>
            <td class="num">${ctx}</td>
            <td>${rec ? `<code>${esc(rec.quant)}</code><br><span class="muted small">${fmtGB(rec.sizeGB)}</span>` : '—'}</td>
            <td class="num">${fmtNum(v.downloads)}</td>
            <td class="muted small">${fmtDate(v.lastModified)}</td>
          </tr>`;
  }).join('\n');

  return `      <table class="variants">
        <thead>
          <tr>
            <th>量化者</th><th>许可</th><th class="num">档数</th><th class="num">总体积</th>
            <th class="num">上下文</th><th>建议档</th><th class="num">下载量</th><th>更新</th>
          </tr>
        </thead>
        <tbody>
${trs}
        </tbody>
      </table>
      <p class="muted small">「建议档」是本站按<b>体积最小且落在平衡档</b>的规则自动选出的，不是质量排名。官方量化排在最前；带 <span class="badge badge-im">imatrix</span> 标记的仓库带重要性矩阵数据。</p>`;
}

/** 系列页 · D 区块：每个变体详解（七字段） */
function blockD(s, m) {
  const cards = m.variants.map((v) => {
    const rec = v.recommended;
    const f = (label, body) => `        <div class="vf"><span class="vf-k">${label}</span><span class="vf-v">${body}</span></div>`;

    // 字段 1 · 它是什么
    const what = `<a href="${esc(v.url)}" target="_blank" rel="noopener"><code>${esc(v.repo)}</code> ↗</a>，提供 <b>${v.coverage}</b> 个 GGUF 量化档，合计 ${fmtGB(v.totalGB)}。${v.isOfficial ? '<b>这是模型方自己发布的</b>，不是第三方。' : `由 <code>${esc(v.quantizer)}</code> 发布。`}`;

    // 字段 2 · 量化者做了什么
    const did = [];
    if (v.isOfficial) did.push('模型作者自行量化，只有覆盖不到的档位才需要考虑第三方');
    if (v.imatrix) did.push(`带重要性矩阵（imatrix：<code>${esc(v.imatrixFile || 'imatrix.dat')}</code>），用激活数据统计各层重要性后再量化，通常比纯 RTN 稳`);
    else did.push('未提供重要性矩阵（imatrix），走的是纯权重量化路线');
    if (v.architecture) did.push(`针对 <code>${esc(v.architecture)}</code> 架构优化`);
    if (v.contextLength) did.push(`声明上下文 ${Number(v.contextLength).toLocaleString('en-US')} tokens`);
    if (v.declaredBase) did.push(`发布页声明溯源到 <code>${esc(Array.isArray(v.declaredBase) ? v.declaredBase[0] : v.declaredBase)}</code>`);
    if (v.totalFileSize) did.push(`权重总字节 ${(v.totalFileSize / 1e9).toFixed(1)} GB（发布页 <code>gguf.total</code> 字段）`);

    // 字段 3 · 与同系列其他变体的区别
    const peers = m.variants.filter((x) => x.quantizer !== v.quantizer);
    const diff = peers.length === 0 ? '本系列目前只有这一个量化来源，无横向可比。'
      : `同系列另有 ${peers.length} 个量化来源（${peers.slice(0, 4).map((p) => `<code>${esc(p.quantizer)}</code> ${p.coverage} 档`).join('、')}${peers.length > 4 ? ' 等' : ''}）。`;
    const cov = m.variants.map((x) => x.coverage).sort((a, b) => a - b);
    const covNote = cov.length > 1 ? ` 本仓 ${v.coverage} 档，${v.coverage === cov[cov.length - 1] ? '覆盖最全' : v.coverage === cov[0] ? '覆盖最少' : '覆盖中等'}。` : '';

    // 字段 4 · 存在的意义
    const why = v.isOfficial
      ? '模型作者最清楚哪几层权重对质量敏感，官方量化通常是最保守、最不会出错的选择——<b>官方出了就优先用它</b>。'
      : `补上官方没覆盖的档位（${rec ? esc(rec.quant) : '—'} 这类），让你能在有限显存里凑合跑起来，或者反过来用更高精度换质量。`;

    // 字段 5 · 优势
    const adv = [];
    if (v.coverage >= 20) adv.push(`档位覆盖最广的一档（${v.coverage} 档），从极限压缩到近似无损都能选`);
    if (v.imatrix) adv.push('带 imatrix，同档位下质量通常更稳');
    if (v.isOfficial) adv.push('官方出品，出错时责任明确');
    if (v.downloads >= 1e6) adv.push(`社区验证充分（${fmtNum(v.downloads)} 次下载），踩坑的人少`);
    if (rec) adv.push(`平衡档落在 <code>${esc(rec.quant)}</code>（${fmtGB(rec.sizeGB)}），是大多数人的起点`);
    if (adv.length === 0) adv.push('体量较小，适合只想快速验证能不能跑的场景');

    // 字段 6 · 为什么选它 / 目的
    const purpose = rec
      ? `如果你的瓶颈是<b>显存</b>：直接下 <code>${esc(rec.quant)}</code>（${fmtGB(rec.sizeGB)}，${esc(rec.tier)}）。<br>如果你的瓶颈是<b>速度</b>：这个仓里没有更快的档位（GGUF 的速度主要由架构与后端决定，不由量化档决定），换量化者意义不大。<br>如果你的瓶颈是<b>质量</b>：往上走一档到保守档（Q5_K_M / Q6_K）。`
      : '该仓无可用档位。';

    // 字段 7 · 已知取舍
    const cost = [];
    if (v.coverage <= 3) cost.push('档位极少，没有升降空间，被显存卡住时无路可退');
    if (!v.imatrix && !v.isOfficial) cost.push('无 imatrix，同档位下质量损失可能比带 imatrix 的版本更明显（<b>我们的口径，需实测验证</b>）');
    if (v.totalGB > 200) cost.push(`全仓 ${fmtGB(v.totalGB)}，硬盘紧张的话建议只下需要的 1~2 个档位`);
    if (NEEDS_REVIEW.test(v.license || '')) cost.push(`许可是 <code>${esc(v.license)}</code>，<b>必须自己读发布页原文</b>再决定能不能用`);
    if (v.licenseInherited) cost.push(`量化仓<b>自己没写许可字段</b>，这里的 <code>${esc(v.license)}</code> 是继承基座 <code>${esc(v.licenseFrom || '?')}</code> 的推断值——著作权上量化不可能脱离基座许可，但量化者的 redistribution 条款是否另有约定，需自己去读基座许可原文确认`);
    if (v.lastModified && (Date.now() - new Date(v.lastModified)) / 86400000 > 180) cost.push(`已 ${Math.round((Date.now() - new Date(v.lastModified)) / 86400000)} 天未更新，基础模型若有新版可能已不同步`);
    if (cost.length === 0) cost.push('暂未发现明显取舍（不代表没有，建议先下一档实测）');

    return `        <article class="vcard${v.isOfficial ? ' vcard-off' : ''}">
          <header class="vcard-h">
            <h4>${v.isOfficial ? '<span class="badge badge-off">官方</span> ' : ''}<code>${esc(v.quantizer)}</code></h4>
            <div class="vcard-meta">
              ${licBadge(v.license)}
              ${v.licenseInherited ? `<br><span class="warn-inline small">继承自基座 <code>${esc(v.licenseFrom || '?')}</code>，量化仓未单独声明</span>` : ''}
              <span class="muted small">${v.coverage} 档 · ${fmtGB(v.totalGB)} · ${fmtNum(v.downloads)} 下载</span>
            </div>
          </header>
${f('它是什么', what)}
${f('量化者做了什么', did.join('；') + '。')}
${f('与同系列其他变体的区别', diff + covNote)}
${f('存在的意义', why)}
${f('优势', adv.map((a) => '· ' + a).join('<br>'))}
${f('为什么选它 / 目的', purpose)}
${f('已知取舍', cost.map((c) => '· ' + c).join('<br>'))}
        </article>`;
  }).join('\n');

  return `      <p class="block-lead">每个变体按七个字段展开：它是什么 → 量化者做了什么 → 与同系列其他变体的区别 → 存在的意义 → 优势 → 为什么选它 → 已知取舍。<b>最后一项是本站唯一会写主观判断的地方，且都标注了「我们的口径」。</b></p>
${cards}`;
}

/** 系列页 · E 区块：量化者档案 */
function blockE(s, m) {
  const owners = [...new Set(m.variants.map((v) => v.quantizer))];
  const cards = owners.map((o) => {
    const note = QUANTIZER_NOTES[o];
    const doc = quantizerDocs[o] || quantizerDocs['official'] || null;
    const mine = m.variants.filter((v) => v.quantizer === o);
    const dl = mine.reduce((s, v) => s + v.downloads, 0);
    const body = doc
      ? doc.replace(/^# .*\n+/, '').trim()
      : `<p>${esc(note?.oneLine?.zh || '暂无档案')}</p>`;
    return `        <article class="qcard">
          <h4><code>${esc(o)}</code>${note ? ` <span class="muted small">${esc(note.oneLine.zh)}</span>` : ''}</h4>
          <p class="qcard-scope">在本系列：${mine.length} 个仓 · ${dl ? fmtNum(dl) + ' 下载' : '—'}${mine.some((v) => v.isOfficial) ? ' · <b>含官方仓</b>' : ''}</p>
          <div class="qcard-body">${mdLite(body)}</div>
          <a class="qcard-link" href="https://huggingface.co/${esc(o)}" target="_blank" rel="noopener">发布页 ↗</a>
        </article>`;
  }).join('\n');
  return `      <p class="block-lead">量化者决定了这个包的<b>档位覆盖、命名规范、是否带 imatrix、什么时候跟进新模型</b>。这一区块说明「选这个量化者的量化意味着什么」。</p>
${cards}`;
}

/** 系列页 · F 区块：更新记录 */
function blockF(s, m) {
  const items = m.variants
    .slice()
    .sort((a, b) => String(b.lastModified).localeCompare(String(a.lastModified)))
    .map((v) => `        <li>
          <span class="log-date">${fmtDate(v.lastModified)}</span>
          <a href="${esc(v.url)}" target="_blank" rel="noopener"><code>${esc(v.quantizer)}</code></a>
          <span class="muted">更新了 ${v.coverage} 个档位${v.imatrix ? ' · 含 imatrix' : ''}</span>
        </li>`).join('\n');
  return `      <p class="block-lead">按更新时间倒序。更新频繁说明该量化者在跟进新版本；长期不更新则基础模型升版后可能不同步。</p>
      <ul class="log">
${items}
      </ul>
      <p class="muted small">基础模型 <code>${esc(m.repo)}</code> 最近更新：${fmtDate(m.lastModified)}　·　本站采集时间：${esc((s.collectedAt || '').slice(0, 10))}</p>`;
}

/** 极简 Markdown → HTML（只处理粗体/代码/列表/段落） */
function mdLite(md) {
  return md
    .split(/\n{2,}/)
    .map((blk) => {
      if (/^[-*] /m.test(blk) || /^\d+\. /m.test(blk)) {
        const items = blk.split('\n').filter((l) => l.trim()).map((l) =>
          `  <li>${inline(l.replace(/^\s*[-*]\s+/, '').replace(/^\s*\d+\.\s+/, ''))}</li>`).join('\n');
        return `<ul>\n${items}\n</ul>`;
      }
      return `<p>${inline(blk).replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');
}
function inline(t) {
  return esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

// ═════════════════════════════════════════════════════════════════════════
// 页面
// ═════════════════════════════════════════════════════════════════════════

function seriesPage(s) {
  const memberNav = s.members.map((m, i) =>
    `<a href="#m${i}">${esc(m.label.zh)}</a>`).join('');

  const sections = s.members.map((m, i) => `      <section class="member" id="m${i}">
        <h3><span class="member-idx">成员 ${i + 1}</span>${esc(m.label.zh)}</h3>
        <p class="member-meta">${esc(m.params || '')}　·　${esc(m.role?.zh || '')}　·　${m.variantCount} 个量化来源</p>
        <div class="block" id="a${i}">
          <h4><span class="blk">A</span>基础模型卡 <small>规格 · 许可 · 访问门槛 · 参数量三来源交叉核对</small></h4>
${blockA(s, m)}
        </div>
        <div class="block" id="b${i}">
          <h4><span class="blk">B</span>该选哪个 <small>按你的显存倒推</small></h4>
${blockB(s, m)}
        </div>
        <div class="block" id="c${i}">
          <h4><span class="blk">C</span>量化版本总表 <small>横向对比</small></h4>
${blockC(s, m)}
        </div>
        <div class="block" id="d${i}">
          <h4><span class="blk">D</span>每个变体详解 <small>七字段</small></h4>
${blockD(s, m)}
        </div>
        <div class="block" id="e${i}">
          <h4><span class="blk">E</span>量化者档案 <small>选量化者意味着什么</small></h4>
${blockE(s, m)}
        </div>
        <div class="block" id="f${i}">
          <h4><span class="blk">F</span>更新记录 <small>谁在跟进</small></h4>
${blockF(s, m)}
        </div>
      </section>`).join('\n');

  const body = `  <div class="container">
    <nav class="crumbs"><a href="${DOMAIN}">← 全部系列</a></nav>
    <header class="page-head">
      <p class="eyebrow"><span data-zh>${esc(s.vendor.zh)}</span><span data-en>${esc(s.vendor.en)}</span>　·　发布于 ${esc(s.released)}</p>
      <h1><span data-zh>${esc(s.name.zh)}</span><span data-en>${esc(s.name.en)}</span></h1>
      <p class="lede">${esc(s.summary)}</p>
      <ul class="pos">${s.positions.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      <nav class="member-nav">${memberNav}</nav>
    </header>
${trustBanner()}
${sections}
    <section class="legal-note">
      <h3>关于数据与许可</h3>
      <p>本站数据全部来自 <a href="https://huggingface.co" target="_blank" rel="noopener">Hugging Face</a> 公开 API，采集时间 <code>${esc((s.collectedAt || '').slice(0, 10))}</code>，为快照数据。</p>
      <p>本站<b>不下载、不托管任何模型权重文件</b>，只提供发布页链接。许可字段原样引自发布页，<b>本站不解读许可条款、不构成法律意见</b>，一切以<a href="https://specul.com/legal.html" target="_blank" rel="noopener">发布页原文</a>为准。</p>
      <p>模型名称均为各自权利人的商标，此处仅作描述性使用。本站与上述厂商无隶属或合作关系。</p>
    </section>
  </div>`;

  return shell({
    current: 'models',
    // 子页在 /series/<code>/（两級深），品牌资源在站点根 → 需要 ../../ 才回到根。
    // 深度算错的表现是子页静默丢样式（本地服务 404，但不报错，最容易漏）。
    assetPrefix: '../../',
    title: `${s.name.zh} 量化版对比 · Models 图谱`,
    desc: `${s.name.zh}（${s.vendor.zh}）的第三方 GGUF 量化版本对比：${s.members.length} 个规格、${s.members.reduce((n, m) => n + m.variantCount, 0)} 个量化来源，含实测文件体积、许可、上下文长度与选档建议。`,
    canonical: `${DOMAIN}series/${s.code}/`,
    accent: ACCENT,
    body,
    repo: 'https://github.com/speculcom/ai-quantized-llm',
    repoLabel: '数据仓',
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'Dataset',
      name: `${s.name.zh} GGUF 量化版本索引`,
      description: s.summary,
      url: `${DOMAIN}series/${s.code}/`,
      isAccessibleForFree: true,
      license: 'https://creativecommons.org/publicdomain/zero/1.0/',
      temporalCoverage: (s.collectedAt || '').slice(0, 10),
    },
  });
}

function indexPage() {
  const cards = seriesList.map((s) => {
    const vTotal = s.members.reduce((n, m) => n + m.variantCount, 0);
    const fTotal = s.members.reduce((n, m) => n + m.variants.reduce((k, v) => k + v.coverage, 0), 0);
    const owners = [...new Set(s.members.flatMap((m) => m.variants.map((v) => v.quantizer)))];
    const loose = s.members.every((m) => LOOSE.test(m.license || ''));
    return `        <a class="scard${loose ? ' scard-loose' : ''}" href="series/${s.code}/">
          <div class="scard-h">
            <h3>${esc(s.name.zh)}</h3>
            <span class="scard-vendor">${esc(s.vendor.zh)}</span>
          </div>
          <p class="scard-sum">${esc(s.summary)}</p>
          <ul class="scard-pos">${s.positions.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
          <div class="scard-stats">
            <span><b>${s.members.length}</b> 规格</span>
            <span><b>${vTotal}</b> 量化源</span>
            <span><b>${fTotal}</b> 档位</span>
            <span><b>${owners.length}</b> 量化者</span>
          </div>
          <div class="scard-lic">${s.members.map((m) => licBadge(m.license, { asSpan: true })).join(' ')}</div>
          <p class="scard-go">看该选哪一档 →</p>
        </a>`;
  }).join('\n');

  const totalV = seriesList.reduce((n, s) => n + s.members.reduce((k, m) => k + m.variantCount, 0), 0);
  const totalF = seriesList.reduce((n, s) => n + s.members.reduce((k, m) => k + m.variants.reduce((j, v) => j + v.coverage, 0), 0), 0);
  const allOwners = [...new Set(seriesList.flatMap((s) => s.members.flatMap((m) => m.variants.map((v) => v.quantizer))))].sort();

  const body = `  <div class="container">
    <header class="page-head home-head">
      <p class="eyebrow">模型层 · 本地部署</p>
      <h1>Models 图谱<span class="sub">量化版对比</span></h1>
      <p class="lede">你决定用哪个模型之后，真正要面对的问题是：<b>同一模型有几十个量化版，我该下哪一个？</b><br>本站只回答这一个问题——不评模型强弱，只帮你选对量化版。</p>
      <p class="lede lede-sub"><b>收录范围：只收开放权重、可本地部署的开源模型</b>（HF 上有公开权重的 MoE 与 dense模型）。闭源 / API-only 模型不在收录范围内——它们没有量化产物，下载和选型的问题不存在。</p>
      <div class="home-stats">
        <div><b>${seriesList.length}</b><span>个系列</span></div>
        <div><b>${seriesList.reduce((n, s) => n + s.members.length, 0)}</b><span>个规格</span></div>
        <div><b>${totalV}</b><span>个量化仓</span></div>
        <div><b>${totalF}</b><span>个量化档位</span></div>
        <div><b>${allOwners.length}</b><span>位量化者</span></div>
      </div>
    </header>

${trustBanner()}

    <section class="howto">
      <h2>怎么用这个站</h2>
      <ol class="steps">
        <li><b>先看你有多少显存。</b>这是唯一的硬约束，8GB 和 24GB 能跑的档位完全不同。显存撑不下时看同一张表的「系统内存 / 多卡」两栏——纯 CPU 或多卡张量并行也是可行路线。</li>
        <li><b>在 B 区块查速查表。</b>直接给出「这个显存 / 内存档位该用哪个量化档」，体积是实测值。</li>
        <li><b>在 C 区块横向对比量化者。</b>看谁档位全、谁带 imatrix、谁在跟进更新。</li>
        <li><b>在 D 区块看单档详解。</b>七个字段说清每个变体是什么、差在哪、什么时候该选它。</li>
        <li><b>下载前先读许可。</b>非宽松许可的，页面会标出来；量化仓没单独声明许可的，页面会写明「继承自基座」，原文链接就在旁边。</li>
      </ol>
    </section>

    <section class="series-list">
      <h2>已收录系列 <small>按 GGUF 量化实际下载量排序</small></h2>
      <div class="scards">
${cards}
      </div>
    </section>

    <section class="quantizer-index">
      <h2>收录的量化者 <small>${allOwners.length} 位</small></h2>
      <div class="qchips">
${allOwners.map((o) => `        <a class="qchip" href="series/qwen3-8/#e0"><code>${esc(o)}</code>${QUANTIZER_NOTES[o] ? `<span>${esc(QUANTIZER_NOTES[o].oneLine.zh)}</span>` : ''}</a>`).join('\n')}
      </div>
    </section>

    <section class="legal-note">
      <h3>数据来源与法律立场</h3>
      <p>数据来自 <a href="https://huggingface.co" target="_blank" rel="noopener">Hugging Face</a> 公开 API（模型元数据 + 文件体积），采集时间 <code>${esc((seriesList[0]?.collectedAt || '').slice(0, 10))}</code>，为快照数据而非实时。</p>
      <p><b>本站不跑 benchmark，不给质量与速度结论。</b>凡涉及主观判断处均标注「我们的口径」。</p>
      <p><b>不下载、不托管任何权重文件</b>；许可原样引自发布页，本站不解读许可、不构成法律意见，一切以<a href="https://specul.com/legal.html" target="_blank" rel="noopener">发布页原文</a>为准。</p>
      <p>系列选择依据四维打分（量化热度 40 / 量化广度 25 / 规模可及性 20 / 新鲜度 15），方法与落选名单见 <a href="https://github.com/speculcom/ai-quantized-llm" target="_blank" rel="noopener">数据仓 METHODOLOGY.md ↗</a>。</p>
    </section>
  </div>`;

  return shell({
    current: 'models',
    title: 'Models 图谱 · 本地部署量化模型对比',
    desc: `本地部署量化模型索引：${seriesList.length} 个系列、${totalV} 个量化仓、${totalF} 个量化档位。按显存选档、横向对比量化者，每个数字都标注来源。不跑 benchmark，不托管权重。`,
    canonical: DOMAIN,
    accent: ACCENT,
    body,
    repo: 'https://github.com/speculcom/ai-quantized-llm',
    repoLabel: '数据仓',
    jsonLd: {
      '@context': 'https://schema.org', '@type': 'WebSite',
      name: 'Models 图谱 · 本地部署量化模型对比',
      url: DOMAIN,
      description: '只回答一个问题：这个基础模型，我该下载哪个量化版、为什么。',
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════
// 输出
// ═════════════════════════════════════════════════════════════════════════
fs.mkdirSync(path.join(SITE, 'series'), { recursive: true });

const idx = indexPage();
fs.writeFileSync(path.join(SITE, 'index.html'), idx);
for (const s of seriesList) {
  // 产出 series/<code>/index.html 而不是 series/<code>.html。
  // 原因：GitHub Pages 对「无扩展名路径」只在**不带尾斜杠**时 301 到 .html；
  // 一旦访客（或站内链接）写成 /series/<code>/ 就会 404。
  // 目录形式让 /series/<code>/ 与 /series/<code> 都命中同一个 index.html。
  const dir = path.join(SITE, 'series', s.code);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), seriesPage(s));
}

console.log('══════════ 建站完成 ══════════');
console.log('index.html           ', (idx.length / 1024).toFixed(0) + ' KB');
for (const s of seriesList) {
  const h = fs.statSync(path.join(SITE, 'series', s.code, 'index.html')).size;
  console.log(`series/${s.code}/`.padEnd(24), (h / 1024).toFixed(0) + ' KB  ', s.name.zh, '—', s.members.length, '成员');
}

// ═════════════════════════════════════════════════════════════════════════
const CSS = `/* Models 图谱 · 站点样式（品牌 token 来自 brand.css） */
.container{max-width:1180px;margin:0 auto;padding:0 20px}

.eyebrow{color:var(--cyan);font-size:.82rem;letter-spacing:.08em;margin:0 0 .4em}
.page-head h1{font-size:clamp(1.7rem,4vw,2.5rem);margin:0 0 .35em;line-height:1.2}
.page-head h1 .sub{display:block;font-size:.55em;color:var(--muted);font-weight:400;margin-top:.3em}
.lede{color:var(--text-dim);font-size:1.02rem;line-height:1.75;max-width:70ch}
.home-head{margin-bottom:2em}
.home-head .lede b{color:var(--text)}
.lede-sub{margin-top:.9em;padding:.7em .9em;border-left:3px solid var(--cyan);background:var(--bg-soft);border-radius:0 6px 6px 0;font-size:.93rem}

.home-stats{display:flex;flex-wrap:wrap;gap:1.6rem;margin:1.5em 0 0;padding:1.1em 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.home-stats>div{display:flex;flex-direction:column}
.home-stats b{font-size:1.7rem;color:var(--cyan);font-variant-numeric:tabular-nums;line-height:1.1}
.home-stats span{font-size:.78rem;color:var(--muted)}

.crumbs{margin:1.6em 0 0;font-size:.85rem}
.crumbs a{color:var(--muted);text-decoration:none}
.crumbs a:hover{color:var(--cyan)}

.pos{list-style:none;display:flex;flex-wrap:wrap;gap:.45em;padding:0;margin:1.1em 0}
.pos li{font-size:.76rem;padding:.24em .7em;border:1px solid var(--line);border-radius:999px;color:var(--text-dim)}

.member-nav{display:flex;flex-wrap:wrap;gap:.5em;margin-top:1.2em}
.member-nav a{font-size:.8rem;padding:.35em .85em;border:1px solid var(--line);border-radius:6px;text-decoration:none;color:var(--text-dim)}
.member-nav a:hover{border-color:var(--cyan);color:var(--cyan)}

/* ── 可信度横幅 ── */
.trust{margin:2.4em 0;padding:1.4em 1.5em;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
.trust h2{font-size:1.05rem;margin:0 0 1em}
.trust-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1em}
.trust-item{padding:.9em 1em;border-radius:8px;background:var(--bg-soft);border-left:3px solid var(--line)}
.trust-item p{margin:.5em 0 0;font-size:.86rem;line-height:1.7;color:var(--text-dim)}
.trust-item.t-a{border-left-color:var(--cyan)}
.trust-item.t-b{border-left-color:var(--vio)}
.trust-item.t-c{border-left-color:var(--gold)}
.trust-tag{font-size:.74rem;font-weight:600;letter-spacing:.03em}
.t-a .trust-tag{color:var(--cyan)} .t-b .trust-tag{color:var(--vio)} .t-c .trust-tag{color:var(--gold)}
.trust-foot{margin:1.2em 0 0;font-size:.82rem;color:var(--muted);line-height:1.7}

/* ── 区块 ── */
.howto{margin:2.4em 0}
.howto h2,.series-list h2,.quantizer-index h2{font-size:1.1rem;margin:0 0 .9em}
.howto h2 small,.series-list h2 small,.quantizer-index h2 small{font-weight:400;color:var(--muted);font-size:.72em;margin-left:.5em}
.steps{counter-reset:st;list-style:none;padding:0;margin:0;display:grid;gap:.7em}
.steps li{counter-increment:st;position:relative;padding-left:2.2em;font-size:.9rem;line-height:1.75;color:var(--text-dim)}
.steps li::before{content:counter(st);position:absolute;left:0;top:.1em;width:1.6em;height:1.6em;display:grid;place-items:center;border-radius:50%;background:var(--bg-soft);border:1px solid var(--line);color:var(--cyan);font-size:.78rem}
.steps b{color:var(--text)}

.member{margin:3em 0}
.member>h3{margin:0 0 .3em;font-size:1.35rem;display:flex;align-items:baseline;gap:.6em;flex-wrap:wrap}
.member-idx{font-size:.68rem;font-weight:400;color:var(--muted);padding:.15em .55em;border:1px solid var(--line);border-radius:4px;letter-spacing:.04em}
.member-meta{margin:0 0 1.2em;font-size:.8rem;color:var(--muted)}
.member-note{margin:.7em 0 0;font-size:.84rem;color:var(--text-dim);padding:.6em .9em;background:var(--bg-soft);border-radius:6px;border-left:2px solid var(--vio)}

.block{margin:1.6em 0;padding-top:1.2em;border-top:1px dashed var(--line)}
.block>h4{margin:0 0 .9em;font-size:1rem;display:flex;align-items:baseline;gap:.6em;flex-wrap:wrap}
.block>h4 small{font-weight:400;color:var(--muted);font-size:.74em}
.blk{display:inline-grid;place-items:center;width:1.55em;height:1.55em;border-radius:5px;background:var(--bg-soft);border:1px solid var(--line);color:var(--cyan);font-size:.72rem;font-weight:600}
.block-lead{margin:0 0 1em;font-size:.87rem;color:var(--text-dim);line-height:1.75}
.block-lead b{color:var(--text)}

/* ── 表格 ── */
table{width:100%;border-collapse:collapse;font-size:.84rem;margin:.4em 0}
th,td{padding:.55em .7em;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}
thead th{font-size:.74rem;color:var(--muted);font-weight:600;letter-spacing:.03em;border-bottom:1px solid var(--line-strong);white-space:nowrap}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.kv{max-width:none}
.kv th{width:9.5em;font-size:.78rem;color:var(--muted);font-weight:500;white-space:nowrap}
caption{caption-side:top;text-align:left;font-size:.8rem;color:var(--muted);padding:0 0 .5em}
.no-fit{color:var(--gold)}
.muted{color:var(--muted)}
.small{font-size:.8em}
/* HF model_type / hfArch 这类标识符（Qwen3_5ForConditionalGeneration）本身是
   一个不可分的词，但窄屏必须能换行，否则整页横向溢出 */
.muted{overflow-wrap:anywhere}
code{font-family:var(--mono);font-size:.9em;background:var(--bg-soft);padding:.1em .38em;border-radius:4px;overflow-wrap:anywhere}

.budget th{width:9em}
/* 超大MoE 的前置提醒：最小档超过单卡上限时，必须在选档表之前就说清「不是不能跑，是要换运行方式」 */
.warn-note{margin:0 0 1.4em;padding:.85em 1em;border-left:3px solid var(--gold);background:var(--bg-soft);border-radius:0 6px 6px 0;font-size:.85rem;line-height:1.8;color:var(--text-dim)}
.warn-note b{color:var(--text)}
.budget-h{margin:1.6em 0 .5em;font-size:.9rem;color:var(--text);font-weight:600}
.nowrap{white-space:nowrap}
.budget td b{color:var(--cyan)}

/* ── A 区扩展：参数量三来源 / 精度构成 / 标签 ── */
.kv-nested{margin:.1em 0 .4em;border-left:2px solid var(--line);padding-left:.8em}
.kv-nested th{width:8em;font-size:.74rem;padding:.25em .5em .25em 0}
.kv-nested td{padding:.25em 0;font-size:.9rem}
.param-ok{font-size:.8rem;color:var(--cyan);margin:.2em 0 0}
.prec{width:100%;font-size:.82rem}
.prec td{padding:.2em .4em .2em 0;border:none;white-space:nowrap}
.prec td:first-child{width:5.5em}
.prec-bar{width:34%;min-width:60px}
.prec-bar span{display:block;height:.55em;border-radius:3px;background:linear-gradient(90deg,var(--vio),var(--cyan));opacity:.75}
.prec td:last-child{text-align:right;font-variant-numeric:tabular-nums}
/* white-space 不能用 nowrap —— tag 里装的是 org/repo 这类长串（如
   zai-org/GLM-5.3、Qwen/Qwen3.8-Flash-Next），320~390px 下 nowrap 会直接把
   容器撑破（实测 kimi-k3 页在 320px 溢出到 603px）。改用 overflow-wrap 让长串
   在必要时断行，短标签仍然看起来是完整的。 */
.tag{display:inline-block;font-size:.72rem;padding:.14em .5em;margin:.1em .2em .1em 0;border-radius:4px;border:1px solid var(--line);color:var(--muted);background:var(--bg-soft);text-decoration:none;overflow-wrap:anywhere;word-break:break-word;max-width:100%}
a.tag:hover{border-color:var(--vio);color:var(--vio)}
.tag-lic{color:var(--gold);border-color:rgba(245,197,66,.3);background:rgba(245,197,66,.07)}
.tag-paper{color:var(--vio);border-color:rgba(139,124,248,.3);background:rgba(139,124,248,.07)}
.tag-rt{color:var(--cyan);border-color:rgba(34,211,197,.3);background:rgba(34,211,197,.07)}

details.all-quants{margin-top:1em;border:1px solid var(--line);border-radius:8px;padding:.7em 1em;background:var(--panel)}
details.all-quants summary{cursor:pointer;font-size:.86rem;color:var(--cyan)}
.quant-list{margin-top:.8em}

/* ── 徽章 ── */
/* 同 .tag：许可徽章里会出现 license:apache-2.0 这类长串，nowrap 会撑破窄屏 */
.lic{display:inline-block;font-size:.7rem;padding:.12em .5em;border-radius:4px;text-decoration:none;border:1px solid;overflow-wrap:anywhere;word-break:break-word;max-width:100%}
.lic-loose{color:var(--cyan);border-color:rgba(34,211,197,.35);background:rgba(34,211,197,.08)}
.lic-tight{color:var(--gold);border-color:rgba(245,197,66,.35);background:rgba(245,197,66,.08)}
.lic-unknown{color:var(--gold);border-color:rgba(245,197,66,.35)}
.lic-src{font-size:.7rem;margin-left:.4em;color:var(--muted)}
.warn-inline{margin:.4em 0 0;font-size:.78rem;color:var(--gold);line-height:1.6}

.badge{display:inline-block;font-size:.66rem;padding:.1em .42em;border-radius:3px;letter-spacing:.03em;vertical-align:middle}
.badge-off{background:rgba(139,124,248,.16);color:var(--vio);border:1px solid rgba(139,124,248,.4)}
.badge-im{background:rgba(34,211,197,.12);color:var(--cyan);border:1px solid rgba(34,211,197,.3);margin-left:.3em}

.tier{display:inline-block;font-size:.7rem;padding:.1em .45em;border-radius:3px;white-space:nowrap}
.tier-0{color:var(--cyan);background:rgba(34,211,197,.1)}
.tier-1{color:#7dd3fc;background:rgba(125,211,252,.1)}
.tier-2{color:var(--gold);background:rgba(245,197,66,.1)}
.tier-3{color:#fbbf72;background:rgba(251,191,114,.1)}
.tier-4{color:#fca5a5;background:rgba(252,165,165,.1)}
.tier-5{color:var(--muted);background:var(--bg-soft)}

/* ── 变体卡 ── */
.vcard{margin:1.2em 0;padding:1.1em 1.3em;border:1px solid var(--line);border-radius:9px;background:var(--panel)}
.vcard-off{border-left:3px solid var(--vio)}
.vcard-h{display:flex;justify-content:space-between;align-items:baseline;gap:1em;flex-wrap:wrap;margin-bottom:.9em;padding-bottom:.7em;border-bottom:1px solid var(--line)}
.vcard-h h4{margin:0;font-size:1rem;display:flex;align-items:center;gap:.3em;flex-wrap:wrap}
.vcard-meta{display:flex;align-items:center;gap:.6em;flex-wrap:wrap}
.vf{display:grid;grid-template-columns:8.5em 1fr;gap:.9em;padding:.5em 0;border-bottom:1px dotted var(--line)}
.vf:last-child{border-bottom:none}
.vf-k{font-size:.76rem;color:var(--muted);line-height:1.6}
.vf-v{font-size:.85rem;line-height:1.75;color:var(--text-dim);overflow-wrap:anywhere}
.vf-v b{color:var(--text)}

/* ── 量化者卡 ── */
.qcard{margin:1.1em 0;padding:1.1em 1.3em;border:1px solid var(--line);border-radius:9px;background:var(--panel)}
.qcard h4{margin:0 0 .3em;font-size:1rem;display:flex;align-items:baseline;gap:.6em;flex-wrap:wrap}
.qcard-scope{margin:0 0 .8em;font-size:.78rem;color:var(--muted)}
.qcard-body{font-size:.86rem;line-height:1.8;color:var(--text-dim)}
.qcard-body p{margin:.5em 0}
.qcard-body ul{margin:.5em 0;padding-left:1.3em}
.qcard-body li{margin:.25em 0}
.qcard-body b{color:var(--text)}
.qcard-link{display:inline-block;margin-top:.7em;font-size:.78rem;color:var(--cyan);text-decoration:none}

/* ── 系列卡 ── */
.scards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(290px,100%),1fr));gap:1em}
/* min-width:0 —— grid item 默认 min-width:auto，长内容（许可串、repo 名）会把
   整列撑到内容宽度，突破 auto-fill 的 minmax(...,1fr) 约束 */
.scard{display:block;padding:1.15em 1.25em;border:1px solid var(--line);border-radius:10px;background:var(--panel);text-decoration:none;color:inherit;transition:border-color .15s,transform .15s;min-width:0}
.scard:hover{border-color:var(--cyan);transform:translateY(-2px)}
.scard-h{display:flex;justify-content:space-between;align-items:baseline;gap:.6em;flex-wrap:wrap}
.scard-h h3{margin:0;font-size:1.12rem;color:var(--text)}
.scard-vendor{font-size:.74rem;color:var(--muted)}
.scard-sum{margin:.6em 0 .8em;font-size:.85rem;line-height:1.7;color:var(--text-dim)}
.scard-pos{list-style:none;padding:0;margin:0 0 .9em;display:flex;flex-wrap:wrap;gap:.35em}
.scard-pos li{font-size:.7rem;padding:.18em .5em;border-radius:4px;background:var(--bg-soft);color:var(--muted)}
.scard-stats{display:flex;gap:1em;flex-wrap:wrap;padding:.7em 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);font-size:.76rem;color:var(--muted)}
.scard-stats b{color:var(--cyan);font-variant-numeric:tabular-nums}
.scard-lic{margin:.7em 0 .6em;display:flex;gap:.35em;flex-wrap:wrap;min-width:0}
.scard-lic>*{min-width:0}
.scard-go{margin:0;font-size:.78rem;color:var(--cyan)}

/* ── 量化者 chips ── */
.qchips{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(230px,100%),1fr));gap:.6em}
.qchip{display:block;padding:.7em .85em;border:1px solid var(--line);border-radius:7px;text-decoration:none;background:var(--panel)}
.qchip:hover{border-color:var(--vio)}
.qchip code{background:none;padding:0;color:var(--vio);font-weight:600;font-size:.85em}
.qchip span{display:block;margin-top:.25em;font-size:.74rem;color:var(--muted);line-height:1.5}

/* ── 更新日志 ── */
.log{list-style:none;padding:0;margin:.4em 0}
.log li{display:flex;gap:.9em;align-items:baseline;padding:.42em 0;border-bottom:1px dotted var(--line);font-size:.84rem;flex-wrap:wrap}
.log-date{color:var(--muted);font-variant-numeric:tabular-nums;font-size:.8em;min-width:5.5em}

/* ── 法务 ── */
.legal-note{margin:3em 0 2em;padding:1.3em 1.4em;border:1px solid var(--line);border-radius:10px;background:var(--panel)}
.legal-note h3{margin:0 0 .8em;font-size:1rem}
.legal-note p{margin:.55em 0;font-size:.84rem;line-height:1.8;color:var(--text-dim)}
.legal-note b{color:var(--text)}
.legal-note a{color:var(--cyan)}

/* ── 窄屏：表格转卡片 ── */
@media(max-width:760px){
  .vf{grid-template-columns:1fr;gap:.2em}
  .vf-k{color:var(--cyan);font-size:.78rem}
  .home-stats{gap:1.1em}
  .home-stats b{font-size:1.35rem}
  table.kv th{width:auto}
  .vcard-h{flex-direction:column;align-items:flex-start}
}
@media(max-width:560px){
  table.variants,table.budget,table.quant-list,table.kv:not(.kv-nested){display:block}
  table.variants thead,table.budget thead,table.quant-list thead{display:none}
  table.variants tbody,table.budget tbody,table.quant-list tbody,table.kv:not(.kv-nested) tbody{display:block}
  table.variants tr,table.budget tr,table.quant-list tr,table.kv:not(.kv-nested) tr{display:block;margin-bottom:1em;padding:.6em .8em;border:1px solid var(--line);border-radius:7px;background:var(--panel)}
  table.variants td,table.budget td,table.quant-list td,table.kv:not(.kv-nested) td{display:flex;justify-content:space-between;gap:1em;border:none;padding:.3em 0;text-align:left}
  table.variants td::before,table.budget td::before,table.quant-list td::before,table.kv:not(.kv-nested) td::before{content:attr(data-label);color:var(--muted);font-size:.76em;flex:0 0 auto}
  table.kv:not(.kv-nested) td::before{content:none}
  table.kv:not(.kv-nested) th{display:block;width:auto;padding:.4em 0 .1em;border:none}
  table.kv:not(.kv-nested) tr{display:block;background:none;border:none;margin-bottom:.4em}
  /* budget 表只有「档位 / 推荐」两列，且推荐格里塞了多个 <br> 分隔的说明块。
     上面的通用规则把 td 变成 flex，导致每个 <br> 与 <span> 都成了独立 flex item
     —— 整块文字被压成一条窄带（实测 320px 下溢出到 348px）。这里改回普通块级流。 */
  table.budget td{display:block}
  /* model_type / hfArch（Qwen3_5ForConditionalGeneration 这类）本身不该断在
     字符中间，但窄屏必须允许换行 —— 统一给窄屏表格里的行内 code 加 anywhere。 */
  table.variants td code,table.budget td code,table.quant-list td code,table.kv:not(.kv-nested) td code{overflow-wrap:anywhere;word-break:break-word}
  table.variants td>*,table.quant-list td>*{min-width:0}
  /* A 区嵌套表在窄屏不能跟着 kv 一起卡片化，否则套娃很难读：保持表格形态但压缩留白 */
  .kv-nested{border-left:0;padding-left:0;margin-left:0}
  .kv-nested th{width:6.5em;font-size:.72rem;padding:.25em .4em .25em 0}
  .kv-nested td{font-size:.84rem}
  .prec-bar{width:auto;min-width:40px}
  .prec{font-size:.78rem}
  .prec td{padding:.18em .3em .18em 0}
  .prec td:last-child{text-align:left}
  td.num{text-align:right}
}
`;

// ── 产物写盘（必须在 CSS/HTML 模板常量声明之后）────────────────────
// 品牌资源：从 www 复制（保持全站唯一定义）
for (const f of ['brand.css', 'brand.js']) {
  const src = path.join(ROOT, '..', '..', 'www.specul', f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(SITE, f));
  else console.log('⚠ 缺品牌文件', f);
}
fs.writeFileSync(path.join(SITE, 'site.css'), CSS);
fs.writeFileSync(path.join(SITE, 'CNAME'), 'models.specul.com\n');
fs.writeFileSync(path.join(SITE, '.nojekyll'), '');
fs.writeFileSync(path.join(SITE, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: https://models.specul.com/sitemap.xml\n');
{
  const lines = [
    '# Models 图谱 · 本地部署量化模型对比',
    '> 只回答一个问题：这个基础模型，我该下载哪个量化版、为什么。',
    '> 不跑 benchmark，不给质量与速度结论，不托管任何模型权重文件。',
    '',
    '## 收录范围',
    '',
    '**只收开放权重、可本地部署的开源模型。** 具体指：Hugging Face 上有公开权重文件、且第三方能做出',
    'GGUF 量化的模型（MoE 与 dense 都在内）。',
    '',
    '闭源 / API-only 模型不在收录范围内——它们没有量化产物，「该下载哪个量化版」这个问题对它们不成立。',
    '本站也不做模型能力横评（那属于另一个问题，且需要实测）。',
    '',
    '## 已收录系列',
    '',
  ];
  for (const s of seriesList) {
    const vTotal = s.members.reduce((n, m) => n + m.variantCount, 0);
    const fTotal = s.members.reduce((n, m) => n + m.variants.reduce((k, v) => k + v.coverage, 0), 0);
    lines.push(`- [${s.name.zh}](${DOMAIN}series/${s.code}/): ${s.summary}`);
    lines.push(`  ${s.vendor.zh}　发布 ${s.released}　${s.members.length} 个规格 / ${vTotal} 个量化仓 / ${fTotal} 个档位　许可 ${s.members.map((m) => m.license).filter(Boolean).join(', ')}`);
  }
  lines.push('');
  lines.push('## 每个系列页包含六个区块');
  lines.push('');
  lines.push('- **A 基础模型卡** —— 许可、规模、架构、上下文长度、官方下载量（全部为 HF 公开字段）');
  lines.push('- **B 该选哪个** —— 按显存 8/12/16/24/48 GB 倒推该用哪一档，体积为实测值并加 15% 运行时余量');
  lines.push('- **C 量化版本总表** —— 横向对比所有量化者：档数、总体积、上下文、许可、更新时间');
  lines.push('- **D 每个变体详解** —— 七字段：它是什么 / 量化者做了什么 / 与同系列其他变体的区别 / 存在的意义 / 优势 / 为什么选它 / 已知取舍');
  lines.push('- **E 量化者档案** —— 每个量化者做了什么、适合谁、什么时候别选');
  lines.push('- **F 更新记录** —— 谁在跟进新版本，谁长期没更新');
  lines.push('');
  lines.push('## 数据可信度分级');
  lines.push('');
  lines.push('- ✅ **实测字段** —— 直接从 Hugging Face 公开 API 读取：文件体积、上下文长度、架构、许可、下载量');
  lines.push('- ✅ **推导** —— 由实测字段按公开规则算出：每权重比特数（依 llama.cpp 命名标准）、档位归属、显存区间');
  lines.push('- ❌ **我们不说的** —— 哪个量化质量更高、哪个更快、哪个模型更强。这些需要实测，本站不跑 benchmark，所以不装作知道');
  lines.push('');
  lines.push('## 数据来源');
  lines.push('');
  lines.push('- 采集接口：`hf-mirror.com/api/models`（HF 国内镜像）与 `hf-mirror.com/api/models/{id}/tree/main`');
  lines.push('- 原始来源：<https://huggingface.co>');
  lines.push(`- 采集时间：${(seriesList[0]?.collectedAt || '').slice(0, 10)}（快照数据，非实时）`);
  lines.push('- 选型方法：<https://github.com/speculcom/ai-quantized-llm/blob/main/docs/METHODOLOGY.md>');
  lines.push('');
  lines.push('## 法律立场');
  lines.push('');
  lines.push('**只索引、只引述、不托管、不解读许可、不给法律意见。**');
  lines.push('许可字段原样引自各发布页，非宽松许可已标注「以发布页原文为准」。');
  lines.push('');
  lines.push('### 关于「继承自基座」的许可');
  lines.push('');
  lines.push('部分量化仓没有在自己的 HF 页面写 license 字段。此时本站填入基座模型的许可，并标注');
  lines.push('「继承自基座，量化仓未单独声明」。依据是：量化是对权重的数学变换（舍入 / 缩放 / imatrix 加权），');
  lines.push('不新增也不删除原始表达，派生物的著作权与原作同一，许可不可能脱离基座。');
  lines.push('');
  lines.push('但这**只是著作权层面的必然推断，不是对量化仓 redistribution 条款的确认**——量化者是否另有');
  lines.push('附加约定（例如要求额外署名、二次分发限制），需自行阅读基座许可原文判断。站内每处继承标注都');
  lines.push('同时给出基座仓库名，便于回溯。');
  lines.push('模型名称均为各自权利人的商标，此处仅作描述性使用。');
  lines.push('详见 <https://specul.com/legal.html>');
  lines.push('');
  lines.push('## 站点群');
  lines.push('');
  lines.push('- 首页 <https://specul.com/>　导航 <https://nav.specul.com/>');
  lines.push('- IDE <https://ide.specul.com/>　CLI <https://cli.specul.com/>　MCP <https://mcp.specul.com/>');
  lines.push('');
  lines.push(`--- 最后更新：${(seriesList[0]?.collectedAt || '').slice(0, 10)}`);
  lines.push('');
  fs.writeFileSync(path.join(SITE, 'llms.txt'), lines.join('\n'));
}

fs.writeFileSync(path.join(SITE, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${DOMAIN}</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
${seriesList.map((s) => `  <url><loc>${DOMAIN}series/${s.code}/</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`).join('\n')}
</urlset>
`);
