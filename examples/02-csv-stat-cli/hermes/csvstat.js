#!/usr/bin/env node
"use strict";
/**
 * csvstat — 零依赖 CSV 统计工具
 * 用法见 --help。只使用 Node 标准库。
 */

const fs = require("fs");
const path = require("path");

const USAGE = `csvstat — CSV 统计报告

用法:
  node csvstat.js --input <file.csv> [选项]
  cat data.csv | node csvstat.js [选项]

选项:
  -i, --input <path>   输入文件；'-' 或省略时读 stdin
      --group-by <col> 按列分组统计
      --columns a,b,c  只统计指定列
      --json           输出 JSON（默认 Markdown）
  -h, --help           显示本帮助

退出码:
  0 成功   1 文件错误   2 用法/列名错误
`;

class UsageError extends Error {}

function parseArgs(argv) {
  const opt = { input: null, groupBy: null, columns: null, json: false, help: false };
  const take = (i, name) => {
    if (i + 1 >= argv.length) throw new UsageError(`参数 ${name} 缺少值`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") opt.help = true;
    else if (a === "--json") opt.json = true;
    else if (a === "-i" || a === "--input") { opt.input = take(i, a); i++; }
    else if (a.startsWith("--input=")) opt.input = a.slice("--input=".length);
    else if (a === "--group-by") { opt.groupBy = take(i, a); i++; }
    else if (a.startsWith("--group-by=")) opt.groupBy = a.slice("--group-by=".length);
    else if (a === "--columns") { opt.columns = splitColumns(take(i, a)); i++; }
    else if (a.startsWith("--columns=")) opt.columns = splitColumns(a.slice("--columns=".length));
    else throw new UsageError(`未知参数: ${a}`);
  }
  if (opt.columns && opt.columns.length === 0) throw new UsageError("--columns 不能为空");
  return opt;
}

function splitColumns(s) {
  return String(s).split(",").map((x) => x.trim()).filter(Boolean);
}

/** RFC4180 解析：引号、"" 转义、字段内换行、CRLF、BOM。 */
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let started = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      started = true;
      continue;
    }
    if (ch === '"') { inQuotes = true; started = true; continue; }
    if (ch === ",") { row.push(field); field = ""; started = true; continue; }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      started = false;
      continue;
    }
    field += ch;
    started = true;
  }
  if (started || field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function isMissing(v) {
  return v === undefined || v === null || String(v).trim() === "";
}

function toNumber(v) {
  if (isMissing(v)) return null;
  const s = String(v).trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function isNumericColumn(values) {
  let seen = 0;
  for (const v of values) {
    if (isMissing(v)) continue;
    if (toNumber(v) === null) return false;
    seen++;
  }
  return seen > 0;
}

function statsFor(values) {
  const nonEmpty = values.filter((v) => !isMissing(v));
  const missing = values.length - nonEmpty.length;
  const numeric = isNumericColumn(values);
  if (numeric) {
    const nums = nonEmpty.map(toNumber);
    const sum = nums.reduce((a, b) => a + b, 0);
    return {
      type: "number",
      count: nonEmpty.length,
      missing,
      sum: round2(sum),
      mean: round2(sum / nums.length),
      min: round2(Math.min(...nums)),
      max: round2(Math.max(...nums)),
    };
  }
  const freq = new Map();
  for (const v of nonEmpty) freq.set(v, (freq.get(v) || 0) + 1);
  let mode = null;
  let best = 0;
  let tie = false;
  for (const [v, n] of freq) {
    if (n > best) { best = n; mode = v; tie = false; }
    else if (n === best) tie = true;
  }
  return { type: "string", count: nonEmpty.length, missing, unique: freq.size, mode: tie ? "tie" : mode };
}

function buildTable(rows, opt, warnings) {
  if (rows.length === 0) throw new UsageError("输入为空");
  const header = rows[0].map((h) => h.trim());
  if (header.length === 0) throw new UsageError("表头为空");

  const data = rows.slice(1);
  const normalized = data.map((r, idx) => {
    if (r.length !== header.length) {
      warnings.push(`第 ${idx + 1} 行有 ${r.length} 列，表头为 ${header.length} 列`);
      const copy = r.slice(0, header.length);
      while (copy.length < header.length) copy.push("");
      return copy;
    }
    return r;
  });

  let cols = header;
  if (opt.columns) {
    const unknown = opt.columns.filter((c) => header.indexOf(c) === -1);
    if (unknown.length) {
      throw new UsageError(`未知列: ${unknown.join(", ")}；可用列: ${header.join(", ")}`);
    }
    cols = opt.columns;
  }
  if (opt.groupBy && header.indexOf(opt.groupBy) === -1) {
    throw new UsageError(`未知分组列: ${opt.groupBy}；可用列: ${header.join(", ")}`);
  }

  const idx = (name) => header.indexOf(name);
  const pick = (col) => normalized.map((r) => r[idx(col)]);

  const columns = {};
  for (const c of cols) {
    if (c === opt.groupBy) continue;
    columns[c] = statsFor(pick(c));
  }

  let groups = null;
  if (opt.groupBy) {
    const g = new Map();
    normalized.forEach((r) => {
      const key = isMissing(r[idx(opt.groupBy)]) ? "(missing)" : r[idx(opt.groupBy)];
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(r);
    });
    groups = [];
    for (const [key, list] of g) {
      const sub = {};
      for (const c of cols) {
        if (c === opt.groupBy) continue;
        sub[c] = statsFor(list.map((r) => r[idx(c)]));
      }
      groups.push({ key, rows: list.length, columns: sub });
    }
    groups.sort((a, b) => b.rows - a.rows || String(a.key).localeCompare(String(b.key)));
  }

  return {
    rows: normalized.length,
    columns: header,
    selected: cols,
    groupBy: opt.groupBy,
    stats: columns,
    groups,
  };
}

function fmtStatsTable(stats) {
  const numRows = [];
  const strRows = [];
  for (const [name, s] of Object.entries(stats)) {
    if (s.type === "number") {
      numRows.push(`| ${name} | ${s.count} | ${s.missing} | ${s.mean} | ${s.min} | ${s.max} | ${s.sum} |`);
    } else {
      strRows.push(`| ${name} | ${s.count} | ${s.missing} | ${s.unique} | ${s.mode === null ? "" : s.mode} |`);
    }
  }
  const out = [];
  if (numRows.length) {
    out.push("| 列 | 非空 | 缺失 | mean | min | max | sum |");
    out.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
    out.push(...numRows);
  }
  if (strRows.length) {
    if (out.length) out.push("");
    out.push("| 列 | 非空 | 缺失 | unique | mode |");
    out.push("| --- | ---: | ---: | ---: | --- |");
    out.push(...strRows);
  }
  return out.join("\n");
}

function renderMarkdown(result) {
  const out = [];
  out.push(`# CSV 统计报告`);
  out.push("");
  out.push(`- 数据行: ${result.rows}`);
  out.push(`- 列 (${result.columns.length}): ${result.columns.join(", ")}`);
  if (result.groupBy) out.push(`- 分组列: ${result.groupBy}`);
  out.push("");
  if (!result.groups) {
    out.push("## 总览");
    out.push("");
    out.push(fmtStatsTable(result.stats));
    return out.join("\n") + "\n";
  }
  result.groups.forEach((g, i) => {
    out.push(`## 组 ${i + 1}: ${g.key} (${g.rows} 行)`);
    out.push("");
    out.push(fmtStatsTable(g.columns));
    out.push("");
  });
  return out.join("\n");
}

function readInput(opt) {
  if (!opt.input || opt.input === "-") {
    if (process.stdin.isTTY) throw new UsageError("未提供 --input，且标准输入是终端");
    return fs.readFileSync(0, "utf8");
  }
  const file = path.resolve(opt.input);
  if (!fs.existsSync(file)) {
    const err = new Error(`文件不存在: ${opt.input}`);
    err.code = "ENOENT_CLI";
    throw err;
  }
  return fs.readFileSync(file, "utf8");
}

function main(argv) {
  let opt;
  try {
    opt = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`csvstat: ${err.message}\n\n${USAGE}`);
    return 2;
  }
  if (opt.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  let text;
  try {
    text = readInput(opt);
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`csvstat: ${err.message}\n\n${USAGE}`);
      return 2;
    }
    process.stderr.write(`csvstat: ${err.message}\n`);
    return 1;
  }

  const warnings = [];
  let result;
  try {
    const rows = parseCsv(text);
    result = buildTable(rows, opt, warnings);
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`csvstat: ${err.message}\n`);
      return 2;
    }
    process.stderr.write(`csvstat: ${err.message}\n`);
    return 1;
  }

  for (const w of warnings) process.stderr.write(`csvstat: 警告: ${w}\n`);
  if (opt.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(renderMarkdown(result));
  }
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { parseCsv, buildTable, statsFor, main };
