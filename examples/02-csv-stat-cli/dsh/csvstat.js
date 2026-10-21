#!/usr/bin/env node
'use strict';
/*
 * csvstat —— 零依赖 CSV 统计 CLI（仅用 Node 标准库）
 *
 * 输入: --input <path> | --input - | 省略（读 stdin）
 * 解析: RFC4180（引号内逗号/换行、"" 转义、CRLF、UTF-8 BOM）
 * 输出: 默认 Markdown 表格；--json 输出 JSON
 */

const fs = require('fs');

const USAGE = [
  'csvstat —— 零依赖 CSV 统计工具',
  '',
  '用法:',
  '  node csvstat.js [选项]',
  '',
  '输入:',
  '  --input <path>     读取 CSV 文件；传 - 或省略则从 stdin 读取',
  '',
  '选项:',
  '  --group-by <col>   按指定列分组，逐组输出行数与统计',
  '  --columns a,b,c    只统计指定列（按给定顺序）；默认统计全部列',
  '  --json             输出 JSON（默认输出 Markdown 表格）',
  '  -h, --help         显示本帮助并退出（退出码 0）',
  '',
  '列类型:',
  '  数值列   所有非空值均可解析为有限数字 → 输出 count/mean/min/max/sum',
  '  分类列   其余情况 → 输出唯一值个数与众数（并列众数输出 tie）',
  '  缺失值   去空格后为空字符串的单元格；计入 missing，不参与统计',
  '',
  '退出码:',
  '  0  成功',
  '  1  输入文件不存在或读取失败',
  '  2  用法错误：未知参数、参数缺值、未知列名、无输入且 stdin 是终端',
  '',
  '示例:',
  '  node csvstat.js --input fixtures/sample100.csv',
  '  node csvstat.js --input data.csv --group-by dept --columns score,age',
  '  node csvstat.js --input - --json < data.csv',
  ''
].join('\n');

const HELP_HINT = '运行 node csvstat.js --help 查看用法。';

function fail(code, message, detail) {
  process.stderr.write('error: ' + message + '\n');
  if (detail) process.stderr.write(detail + '\n');
  process.exit(code);
}

/* ---------------- 参数解析 ---------------- */

function parseArgs(argv) {
  const opts = { input: null, groupBy: null, columns: null, json: false, help: false };

  function takeValue(flag, inline, index) {
    if (inline !== undefined) {
      if (inline === '') fail(2, flag + ' 缺少参数值', HELP_HINT);
      return { value: inline, next: index };
    }
    if (index + 1 >= argv.length || argv[index + 1] === '') {
      fail(2, flag + ' 缺少参数值', HELP_HINT);
    }
    return { value: argv[index + 1], next: index + 1 };
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    let inline;

    if (arg === '-h' || arg === '--help') {
      opts.help = true;
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--input' || arg.startsWith('--input=')) {
      inline = arg === '--input' ? undefined : arg.slice('--input='.length);
      const r = takeValue('--input', inline, i);
      opts.input = r.value;
      i = r.next;
    } else if (arg === '--group-by' || arg.startsWith('--group-by=')) {
      inline = arg === '--group-by' ? undefined : arg.slice('--group-by='.length);
      const r = takeValue('--group-by', inline, i);
      opts.groupBy = r.value;
      i = r.next;
    } else if (arg === '--columns' || arg.startsWith('--columns=')) {
      inline = arg === '--columns' ? undefined : arg.slice('--columns='.length);
      const r = takeValue('--columns', inline, i);
      opts.columns = r.value;
      i = r.next;
    } else if (arg.startsWith('-') && arg !== '-') {
      fail(2, '未知参数: ' + arg, HELP_HINT);
    } else {
      fail(2, '无法识别的参数: ' + arg, HELP_HINT);
    }
  }

  if (opts.columns !== null) {
    const list = opts.columns.split(',').map((s) => s.trim()).filter((s) => s !== '');
    if (list.length === 0) fail(2, '--columns 需要至少一个列名', HELP_HINT);
    opts.columns = list;
  }
  if (opts.groupBy !== null) {
    opts.groupBy = opts.groupBy.trim();
    if (opts.groupBy === '') fail(2, '--group-by 需要一个列名', HELP_HINT);
  }
  return opts;
}

/* ---------------- RFC4180 解析 ---------------- */

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = [];
  let record = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      record.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      i++;
      continue;
    }
    if (ch === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/* ---------------- 数值判定与统计 ---------------- */

const NUMERIC_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function isNumeric(text) {
  const t = text.trim();
  if (t === '' || !NUMERIC_RE.test(t)) return false;
  return Number.isFinite(Number(t));
}

function round6(v) {
  return Number(v.toFixed(6));
}

function analyzeColumn(values) {
  let missing = 0;
  const nonEmpty = [];
  for (const raw of values) {
    const t = String(raw).trim();
    if (t === '') missing++;
    else nonEmpty.push(t);
  }

  const numeric = nonEmpty.every(isNumeric);

  if (numeric) {
    const nums = nonEmpty.map(Number);
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (const n of nums) {
      if (n < min) min = n;
      if (n > max) max = n;
      sum += n;
    }
    const count = nums.length;
    return {
      type: 'numeric',
      missing,
      count,
      mean: count ? round6(sum / count) : null,
      min: count ? round6(min) : null,
      max: count ? round6(max) : null,
      sum: count ? round6(sum) : null
    };
  }

  const counts = new Map();
  for (const v of nonEmpty) counts.set(v, (counts.get(v) || 0) + 1);

  let best = 0;
  let top = [];
  for (const [value, c] of counts) {
    if (c > best) { best = c; top = [value]; }
    else if (c === best) { top.push(value); }
  }
  top.sort();
  const tie = top.length > 1;

  return {
    type: 'categorical',
    missing,
    count: nonEmpty.length,
    unique: counts.size,
    mode: counts.size === 0 ? null : (tie ? 'tie' : top[0]),
    modeCount: counts.size === 0 ? null : best,
    tie: tie,
    tiedValues: tie ? top : undefined
  };
}

/* ---------------- 报告构建 ---------------- */

function pickColumns(header, wanted) {
  if (!wanted) return header.map((name, idx) => ({ name, index: idx }));
  return wanted.map((name) => {
    const idx = header.indexOf(name);
    if (idx === -1) {
      fail(2, '未知列名: ' + name, '可用列名: ' + header.join(', '));
    }
    return { name, index: idx };
  });
}

function buildStats(rows, cols) {
  return cols.map((col) => {
    const stats = analyzeColumn(rows.map((r) => r[col.index]));
    return Object.assign({ column: col.name }, stats);
  });
}

function buildReport(rows, header, opts, source) {
  const cols = pickColumns(header, opts.columns);

  let groupIdx = -1;
  if (opts.groupBy !== null) {
    groupIdx = header.indexOf(opts.groupBy);
    if (groupIdx === -1) {
      fail(2, '未知列名: ' + opts.groupBy, '可用列名: ' + header.join(', '));
    }
  }

  const base = {
    source,
    groupBy: opts.groupBy,
    rows: rows.length,
    columns: header.slice(),
    stats: groupIdx === -1 ? buildStats(rows, cols) : undefined,
    groups: undefined
  };

  if (groupIdx === -1) {
    return base;
  }

  const buckets = new Map();
  for (const row of rows) {
    const key = String(row[groupIdx]);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  const keys = Array.from(buckets.keys()).sort((a, b) => {
    const na = isNumeric(a) ? Number(a) : null;
    const nb = isNumeric(b) ? Number(b) : null;
    if (na !== null && nb !== null) return na - nb;
    if (na !== null) return -1;
    if (nb !== null) return 1;
    return a < b ? -1 : (a > b ? 1 : 0);
  });

  base.groups = keys.map((key) => {
    const groupRows = buckets.get(key);
    return {
      key,
      label: key.trim() === '' ? '(空)' : key,
      rows: groupRows.length,
      stats: buildStats(groupRows, cols)
    };
  });
  return base;
}

/* ---------------- 输出 ---------------- */

function fmtCell(v) {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

const TABLE_HEAD = ['列', '类型', '缺失', '有效', 'mean', 'min', 'max', 'sum', '唯一值', '众数'];
const TABLE_DIV = TABLE_HEAD.map(() => '---');

function statsRow(st) {
  if (st.type === 'numeric') {
    return [st.column, 'numeric', st.missing, st.count, fmtCell(st.mean), fmtCell(st.min),
      fmtCell(st.max), fmtCell(st.sum), '-', '-'];
  }
  return [st.column, 'categorical', st.missing, st.count, '-', '-', '-', '-',
    st.unique, fmtCell(st.mode)];
}

function renderTable(stats) {
  const lines = [];
  lines.push('| ' + TABLE_HEAD.join(' | ') + ' |');
  lines.push('| ' + TABLE_DIV.join(' | ') + ' |');
  for (const st of stats) {
    lines.push('| ' + statsRow(st).map((c) => String(c).replace(/\|/g, '\\|')).join(' | ') + ' |');
  }
  return lines;
}

function renderMarkdown(report) {
  const out = [];
  out.push('# csvstat 统计报告');
  out.push('');
  out.push('- 数据源: `' + report.source + '`');
  out.push('- 数据行数: ' + report.rows);
  const statCols = report.stats
    ? report.stats.map((s) => s.column)
    : (report.groups && report.groups[0] ? report.groups[0].stats.map((s) => s.column) : []);
  out.push('- 统计列: ' + (statCols.length ? statCols.join(', ') : '(无)'));
  if (report.groupBy !== null) {
    out.push('- 分组列: `' + report.groupBy + '`（' + report.groups.length + ' 组）');
  }
  out.push('');

  if (report.groupBy === null) {
    out.push('## 全部数据（' + report.rows + ' 行）');
    out.push('');
    out.push.apply(out, renderTable(report.stats));
    out.push('');
    return out.join('\n');
  }

  for (const group of report.groups) {
    out.push('## ' + report.groupBy + ' = ' + group.label + '（' + group.rows + ' 行）');
    out.push('');
    out.push.apply(out, renderTable(group.stats));
    out.push('');
  }
  return out.join('\n');
}

/* ---------------- 主流程 ---------------- */

function readInput(inputArg) {
  if (inputArg === null || inputArg === '-') {
    try {
      return { text: fs.readFileSync(0, 'utf8'), source: '<stdin>' };
    } catch (err) {
      fail(1, '读取 stdin 失败: ' + err.message);
    }
  }

  let stat = null;
  try {
    stat = fs.statSync(inputArg);
  } catch (err) {
    fail(1, '文件不存在: ' + inputArg);
  }
  if (stat && stat.isDirectory()) {
    fail(1, '这是一个目录而不是文件: ' + inputArg);
  }
  try {
    return { text: fs.readFileSync(inputArg, 'utf8'), source: inputArg };
  } catch (err) {
    fail(1, '读取文件失败: ' + inputArg + ' (' + err.message + ')');
  }
  return null;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  if (opts.input === null && process.stdin.isTTY) {
    process.stderr.write(USAGE);
    process.exit(2);
  }

  const { text, source } = readInput(opts.input);
  const records = parseCsv(text);

  if (records.length === 0) {
    const empty = { source, groupBy: opts.groupBy, rows: 0, columns: [], stats: [], groups: [] };
    if (opts.json) {
      process.stdout.write(JSON.stringify(empty, null, 2) + '\n');
    } else {
      process.stdout.write('# csvstat 统计报告\n\n- 数据源: `' + source + '`\n- 数据行数: 0\n- 无表头，未统计任何列\n');
    }
    process.exit(0);
  }

  const header = records[0].map((h) => h.trim());
  const dataRecords = records.slice(1);

  const nameCount = new Map();
  for (const name of header) nameCount.set(name, (nameCount.get(name) || 0) + 1);
  for (const [name, c] of nameCount) {
    if (c > 1) {
      process.stderr.write('warning: 表头存在重复列名 "' + name + '"（按位置区分，统计结果可能歧义）\n');
    }
  }

  const rows = [];
  let warned = 0;
  for (let i = 0; i < dataRecords.length; i++) {
    const rec = dataRecords[i];
    if (rec.length !== header.length) {
      warned++;
      if (warned <= 10) {
        process.stderr.write('warning: 第 ' + (i + 2) + ' 行列数为 ' + rec.length +
          '，表头为 ' + header.length + ' 列；' +
          (rec.length < header.length ? '缺失字段按空值补齐' : '多余字段已忽略') + '\n');
      } else if (warned === 11) {
        process.stderr.write('warning: 列数不一致的警告过多，后续同类警告已省略\n');
      }
    }
    const fixed = rec.slice(0, header.length);
    while (fixed.length < header.length) fixed.push('');
    rows.push(fixed);
  }

  const report = buildReport(rows, header, opts, source);

  if (opts.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(renderMarkdown(report) + '\n');
  }
}

main();
