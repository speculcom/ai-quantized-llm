#!/usr/bin/env node
/**
 * validate.mjs —— ai-quantized-llm（本地模型站内容仓）的 schema 与中英一致性校验器
 *
 * ## 与 `audit-licenses.mjs` 的分工（不要重复造）
 *   `audit-licenses.mjs` 管**法律硬约束**（每条变体必须能追到许可、不得托管权重）—— 建站前强制。
 *   本文件管**结构与我方口径**：config.js 字段齐不齐、枚举对不对、采集产物与名单是否对齐、
 *   三个翻译文件覆盖不覆盖（R2）。
 *   两者互补，都要跑。
 *
 * ## 本仓自足（R3）
 * 只读本仓：`config.js` · `data/series/*.json` · `data/quantizers/*.md` · `enums/summaries/member-notes.en.json`。
 *
 * ## 错误 vs 警告
 *   错误 = 会让页面出错或口径不一致（缺字段 / 枚举非法 / 产物与名单不对齐 / 缺翻译）
 *   警告 = 覆盖度问题（某量化者没有专属档案）——不拦提交，但要看得见
 *
 * 用法：node scripts/validate.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const errors = [];
const warnings = [];

const { SERIES, PRIMARY_QUANTIZERS, SECONDARY_QUANTIZERS } = await import(pathToFileURL(path.join(ROOT, 'config.js')).href);
const enums = JSON.parse(read('enums.en.json'));
const summariesEn = JSON.parse(read('summaries.en.json'));
const memberNotesEn = JSON.parse(read('member-notes.en.json'));

const POSITIONS = Object.keys(enums.positions);
const seriesByCode = new Map();
const memberPairs = [];   // `<code>|<repo名>`

/* ── 1. config.js 的 SERIES ── */
for (const s of SERIES) {
  const where = `config.js/${s.code || '(缺 code)'}`;
  if (!s.code) { errors.push(`${where} · 缺 code`); continue; }
  if (seriesByCode.has(s.code)) errors.push(`${where} · code 重复`);
  seriesByCode.set(s.code, s);

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.code)) errors.push(`${where} · code 必须是 slug（小写+连字符）`);
  for (const k of ['family', 'released', 'summary']) if (!s[k]) errors.push(`${where} · 缺字段 ${k}`);
  for (const k of ['zh', 'en']) {
    if (!s.name?.[k]) errors.push(`${where} · 缺 name.${k}`);
    if (!s.vendor?.[k]) errors.push(`${where} · 缺 vendor.${k}`);
  }
  if (s.released && !/^\d{4}-\d{2}(-\d{2})?$/.test(s.released)) errors.push(`${where} · released 格式应为 YYYY-MM 或 YYYY-MM-DD`);
  if (!/^https:\/\//.test(s.sources?.official || '')) errors.push(`${where} · sources.official 必须是 https 地址`);

  // positions 是**封闭枚举**（enums.en.json 的键）—— 新值必须同时进词表，否则英文态露中文
  if (!Array.isArray(s.positions) || !s.positions.length) errors.push(`${where} · positions 必须是非空数组`);
  else for (const p of s.positions) {
    if (!POSITIONS.includes(p)) errors.push(`${where} · positions 含词表外的值「${p}」（封闭枚举，需先加进 enums.en.json）`);
  }
  // 去重（同一标签写两遍会渲染成两个 li）
  if (Array.isArray(s.positions) && new Set(s.positions).size !== s.positions.length) {
    warnings.push(`${where} · positions 有重复项`);
  }

  if (!Array.isArray(s.members) || !s.members.length) { errors.push(`${where} · members 必须是非空数组`); continue; }
  for (const m of s.members) {
    const mw = `${where}/${m.repo || '(缺 repo)'}`;
    if (!m.repo) { errors.push(`${mw} · 缺 repo`); continue; }
    if (!/^[\w.-]+\/[\w.-]+$/.test(m.repo)) errors.push(`${mw} · repo 必须是 owner/name 形式`);
    for (const k of ['params']) if (!m[k]) errors.push(`${mw} · 缺字段 ${k}`);
    for (const k of ['zh', 'en']) {
      if (!m.label?.[k]) errors.push(`${mw} · 缺 label.${k}`);
      if (!m.role?.[k]) errors.push(`${mw} · 缺 role.${k}`);
    }
    if (!m.note) errors.push(`${mw} · 缺 note（页面上的成员备注）`);
    memberPairs.push({ code: s.code, repo: m.repo.split('/')[1], pair: `${s.code}|${m.repo.split('/')[1]}` });
  }
}

/* ── 2. 采集产物与名单对齐 ── */
const dir = path.join(ROOT, 'data', 'series');
const dataFiles = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
if (!dataFiles.length) errors.push('data/series 里没有采集产物 —— 先跑 collect-models.mjs');

for (const s of SERIES) {
  if (!s.code) continue;
  if (!dataFiles.includes(`${s.code}.json`)) { errors.push(`data/series/${s.code}.json 缺失（名单里有、产物里没有）`); continue; }
  const j = JSON.parse(read(`data/series/${s.code}.json`));
  if (!j.collectedAt) errors.push(`${s.code}.json · 缺 collectedAt（页脚要显示采集时间）`);
  if (j.schemaVersion === undefined) errors.push(`${s.code}.json · 缺 schemaVersion`);
  const got = (j.members || []).map((m) => m.repo);
  const want = s.members.map((m) => m.repo);
  for (const r of want) if (!got.includes(r)) errors.push(`${s.code}.json · 名单里的成员 ${r} 不在产物里`);
  for (const r of got) if (!want.includes(r)) warnings.push(`${s.code}.json · 产物里有名单外的成员 ${r}`);

  for (const m of j.members || []) {
    if (!(m.variants || []).length) warnings.push(`${s.code}.json · ${m.repo} 没有任何量化变体`);
    for (const v of m.variants || []) {
      const vw = `${s.code}/${m.repo.split('/')[1]}`;
      if (!v.quantizer) errors.push(`${vw} · 有变体缺 quantizer`);
      if (!/^https:\/\//.test(v.url || '')) errors.push(`${vw} · 变体 ${v.repo || '?'} 的 url 不是 https`);
      if (!v.license) warnings.push(`${vw} · 变体 ${v.repo || '?'} 缺 license（跑 backfill-license.mjs 回填）`);
    }
  }
}
const codes = new Set(SERIES.map((s) => s.code));
for (const f of dataFiles) {
  const code = f.replace(/\.json$/, '');
  if (!codes.has(code)) warnings.push(`data/series/${f} 不在 config.js 名单里（孤儿产物）`);
}

/* ── 3. 中英同步（R2）：三个翻译文件必须覆盖 ── */
for (const s of SERIES) {
  if (s.code && !(s.code in summariesEn)) errors.push(`summaries.en.json 缺系列「${s.code}」的英文`);
}
for (const { code, pair } of memberPairs) {
  if (!(pair in memberNotesEn)) errors.push(`member-notes.en.json 缺成员「${pair}」的英文备注（键=code|repo 名）`);
}
for (const p of POSITIONS) {
  if (!enums.positions[p]) errors.push(`enums.en.json 的 positions.${p} 英文为空`);
}

/* ── 4. 量化者档案覆盖（警告级：是覆盖度，不是硬约束）── */
const used = new Set();
const firstPartyOwners = new Set(SERIES.flatMap((s) => (s.members || []).map((m) => m.repo.split('/')[0])));
for (const f of dataFiles) {
  const j = JSON.parse(read(`data/series/${f}`));
  for (const m of j.members || []) for (const v of m.variants || []) if (v.quantizer) used.add(v.quantizer);
}
const docDir = path.join(ROOT, 'data', 'quantizers');
const docs = fs.existsSync(docDir) ? fs.readdirSync(docDir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)) : [];
const noDoc = [...used].filter((q) => !docs.includes(q));
const primaryNoDoc = noDoc.filter((q) => PRIMARY_QUANTIZERS.has(q));
if (primaryNoDoc.length) warnings.push(`主力量化者缺专属档案 ${primaryNoDoc.length} 位: ${primaryNoDoc.join(', ')}`);

/* ── 输出 ── */
const known = (q) => PRIMARY_QUANTIZERS.has(q) ? '主力' : (SECONDARY_QUANTIZERS.has(q) ? '次级' : '名单外');
console.log(`\n系列 ${SERIES.length} · 成员 ${memberPairs.length} · 采集产物 ${dataFiles.length} 个系列文件`);
console.log(`量化者 ${used.size} 位（主力 ${[...used].filter((q) => PRIMARY_QUANTIZERS.has(q)).length} · 其他 ${[...used].filter((q) => !PRIMARY_QUANTIZERS.has(q)).length}）· 有专属档案 ${docs.length} 位`);
/* 「名单外」要排掉**第一方**：base model 的 owner 自己发 GGUF（poolside / meta-models / openbmb …），
 * 他们在数据里也占 `quantizer` 字段（= 仓 owner），但语义上不是「第三方量化者」。
 * 把他们算进「名单外」会误导读者以为名单漏了人。 */
const unknownQ = [...used].filter((q) => known(q) === '名单外' && !firstPartyOwners.has(q));
const firstPartyQ = [...used].filter((q) => firstPartyOwners.has(q));
console.log(`第一方自发 GGUF ${firstPartyQ.length} 位（不计入量化者名单）: ${firstPartyQ.join(' ')}`);
if (unknownQ.length) console.log(`名单外量化者 ${unknownQ.length} 位（PRIMARY/SECONDARY 都没列，且不是第一方）: ${unknownQ.slice(0, 12).join(' ')}`);
if (errors.length) { console.log(`\n错误 ${errors.length} 项：`); errors.forEach((e) => console.log('  ✗ ' + e)); }
if (warnings.length) { console.log(`\n警告 ${warnings.length} 项：`); warnings.forEach((w) => console.log('  ! ' + w)); }
console.log(`\n错误: ${errors.length}  警告: ${warnings.length}`);
console.log(errors.length ? '结果: ❌ 未通过\n' : '结果: ✅ 通过\n');
process.exit(errors.length ? 1 : 0);
