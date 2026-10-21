#!/usr/bin/env node
'use strict';

/**
 * check-contract.js — 契约文档静态检查器
 *
 * 用法:
 *   node check-contract.js <contract.md> [--verbose] [--json]
 *
 * 检查项（全部从文档内容解析，不写死章节号/字段名）:
 *   1. 提取所有 `## ` / `### ` 标题，建立章节树（## 1 -> 1；### 1.1 -> 1.1）
 *   2. 顶层编号必须为 1..N 连续（缺号/重复/倒退均报错并给行号）
 *   3. 正文所有 `§x` / `§x.y` 引用必须能解析到已定义章节
 *   4. 所有 ```json 代码块必须能被 JSON.parse
 *   5. 提到 report.json 的章节若含字段清单，则该章节 JSON 示例必须含全部字段
 *
 * 退出码: 0 = 全通过；1 = 有错误
 * 最后一行: checked <S> sections, <R> refs, <E> errors
 *
 * 零依赖：仅使用 fs / path。
 */

const fs = require('fs');
const path = require('path');

const EXIT_OK = 0;
const EXIT_ERROR = 1;

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function collapse(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

/** 取错误行附近的原文片段，便于定位 */
function snippetAt(line, index, len) {
  const start = Math.max(0, index - 30);
  const end = Math.min(line.length, index + len + 30);
  let s = collapse(line.slice(start, end));
  if (start > 0) s = '…' + s;
  if (end < line.length) s = s + '…';
  return s;
}

/**
 * 从标题文本拆出编号与标题。
 * "1 任务入口" -> {number:"1", title:"任务入口"}
 * "1.1 xxx"    -> {number:"1.1", title:"xxx"}
 * "修订记录"    -> {number:null, title:"修订记录"}
 */
function splitNumber(text) {
  let raw = text.replace(/\s+#+\s*$/, '').trim(); // 闭合式 ATX 标题
  const m = /^(\d+(?:\.\d+)*)\s*(?:[.、．)]\s*)?(.*)$/.exec(raw);
  if (!m) return { number: null, title: raw };
  let rest = m[2].replace(/^[.、．)\s]+/, '').trim();
  return { number: m[1], title: rest };
}

/* ------------------------------------------------------------------ */
/* 主检查                                                              */
/* ------------------------------------------------------------------ */

function checkContract(file, options = {}) {
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);
  const errors = [];

  const addError = (line, message, file) => {
    errors.push({
      line: Number.isFinite(line) ? line : 0,
      message,
      file: file || null,
    });
  };

  /* ---------------- 1. 扫描代码围栏与标题 ---------------- */

  const fences = [];
  const headings = [];
  let open = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (open) {
      const closeRe = new RegExp(
        '^\\s{0,3}' + escapeRe(open.marker) + '{' + open.len + ',}\\s*$'
      );
      if (closeRe.test(line)) {
        fences.push({
          info: open.info,
          startLine: open.startLine,
          contentStartLine: open.contentStartLine,
          endLine: i + 1,
          text: open.buf.join('\n'),
        });
        open = null;
      } else {
        open.buf.push(line);
      }
      continue;
    }

    const fm = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fm) {
      open = {
        marker: fm[1][0],
        len: fm[1].length,
        info: fm[2].trim(),
        startLine: i + 1,
        contentStartLine: i + 2,
        buf: [],
      };
      continue;
    }

    const hm = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (hm) {
      const level = hm[1].length; // 2 或 3
      const parsed = splitNumber(hm[2]);
      headings.push({
        level,
        line: i + 1,
        number: parsed.number,
        title: parsed.title,
        raw: hm[2].trim(),
      });
    }
  }

  if (open) {
    addError(open.startLine, '代码块未闭合（缺少结束围栏）');
  }

  /* ---------------- 2. 章节树 ---------------- */

  const sections = headings.map((h) => ({
    ...h,
    endLine: lines.length,
    parent: null,
    children: [],
  }));

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j].level <= sections[i].level) {
        sections[i].endLine = sections[j].line - 1;
        break;
      }
    }
  }

  const byNumber = new Map();
  for (const s of sections) {
    if (!s.number) continue;
    if (byNumber.has(s.number)) {
      addError(
        s.line,
        `章节号 ${s.number} 重复定义（首次出现在 L${byNumber.get(s.number).line}）`
      );
    } else {
      byNumber.set(s.number, s);
    }
  }

  for (const s of sections) {
    if (s.level !== 3 || !s.number || !s.number.includes('.')) continue;
    const parentNo = s.number.split('.').slice(0, -1).join('.');
    if (!byNumber.has(parentNo)) {
      addError(s.line, `子章节 ${s.number} 的父章节 ${parentNo} 不存在`);
    } else {
      s.parent = byNumber.get(parentNo);
      s.parent.children.push(s);
    }
  }

  /* ---------------- 3. 顶层编号连续 1..N ---------------- */

  const topLevel = sections.filter((s) => s.level === 2 && s.number);

  for (const s of topLevel) {
    if (s.number.includes('.')) {
      addError(s.line, `顶层标题编号不合法（不应带子编号）：${s.number}`);
    }
  }

  // 允许文档以 §0 作为前置节（角色/范围等）；没有 §0 时仍从 1 开始
  let expected = topLevel.length && Number(topLevel[0].number) === 0 ? 0 : 1;
  for (const s of topLevel) {
    const n = Number(s.number);
    if (!Number.isInteger(n) || n < 0) {
      addError(s.line, `顶层编号不是非负整数：${s.number}「${s.title}」`);
      continue;
    }
    if (n > expected) {
      const missing = [];
      for (let k = expected; k < n; k++) missing.push(k);
      addError(
        s.line,
        `顶层编号不连续：缺少 ${missing.join(', ')}（章节 ${n}「${s.title}」之前）`
      );
    } else if (n < expected) {
      addError(
        s.line,
        `顶层编号不连续：章节 ${n}「${s.title}」出现在预期 ${expected} 的位置`
      );
    }
    expected = n + 1;
  }

  if (topLevel.length === 0) {
    addError(1, '未找到任何编号的顶层章节（## N 标题）');
  }

  /* ---------------- 4. § 引用解析 ---------------- */

  const fenceLines = new Set();
  for (const f of fences) {
    for (let i = f.startLine; i <= f.endLine; i++) fenceLines.add(i);
  }

  const refs = [];
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    if (fenceLines.has(lineNo)) continue;
    const line = lines[i];
    const re = /§\s*(\d+(?:\.\d+)*)/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      const number = m[1];
      const resolved = byNumber.has(number);
      refs.push({ number, line: lineNo, resolved });
      if (!resolved) {
        addError(
          lineNo,
          `无法解析引用 §${number}（原文：「${snippetAt(line, m.index, m[0].length)}」）`
        );
      }
    }
  }

  /* ---------------- 5. JSON 代码块 ---------------- */

  const jsonBlocks = [];
  for (const f of fences) {
    if (!/^json(?:\s|$)/i.test(f.info)) continue;
    const text = f.text.trim();
    if (!text) {
      addError(f.contentStartLine, 'JSON 代码块为空');
      continue;
    }
    try {
      const value = JSON.parse(text);
      jsonBlocks.push({
        startLine: f.startLine,
        contentStartLine: f.contentStartLine,
        endLine: f.endLine,
        line: f.contentStartLine,
        value,
      });
    } catch (e) {
      let line = f.contentStartLine;
      const pm = /position (\d+)/.exec(e.message);
      if (pm) {
        const pos = Math.min(Number(pm[1]), text.length);
        line += text.slice(0, pos).split('\n').length - 1;
      }
      addError(
        line,
        `JSON 解析失败（代码块起于 L${f.startLine}）：${collapse(e.message)}`
      );
    }
  }

  /* ---------------- 6. report.json 字段清单核对 ---------------- */

  const reportSections = sections.filter((s) => {
    const body = lines.slice(s.line, s.endLine).join('\n');
    return /report\.json/i.test(s.title) || /report\.json/i.test(body);
  });

  const sectionHasJson = (s) =>
    jsonBlocks.some((b) => b.startLine > s.line && b.startLine <= s.endLine);

  const target =
    reportSections.find(sectionHasJson) || reportSections[0] || null;

  let fieldSection = null;
  let requiredFields = [];
  let exampleFieldCount = null;
  let exampleFieldLine = null;

  if (target) {
    fieldSection = { number: target.number, title: target.title, line: target.line };
    const bodyLines = lines.slice(target.line, target.endLine);
    const blocks = jsonBlocks.filter(
      (b) => b.startLine > target.line && b.startLine <= target.endLine
    );
    const objectBlocks = blocks.filter((b) => isObject(b.value));

    if (objectBlocks.length === 0) {
      addError(
        target.line,
        `章节「${target.title}」提到 report.json，但未找到可解析的 JSON 对象示例，无法核对字段`
      );
    } else {
      const canonical = objectBlocks[0];
      exampleFieldCount = Object.keys(canonical.value).length;
      exampleFieldLine = canonical.line;
      const fields = new Map();
      for (const k of Object.keys(canonical.value)) {
        fields.set(k, `JSON 示例 L${canonical.line}`);
      }

      // 从正文清单里补充字段名：只认行首列表项 "- field: 说明"
      // 不再扫描全文反引号：那会把 §6 里提到的 task_result / sessionId / stats 误当成字段名
      for (const line of bodyLines) {
        const bm = /^\s*[-*+]\s+`?([A-Za-z_][A-Za-z0-9_]*)`?\s*(?:$|[:：])/.exec(
          line
        );
        if (bm && !fields.has(bm[1])) fields.set(bm[1], '正文清单');
      }

      requiredFields = Array.from(fields.keys());

      for (const b of objectBlocks) {
        for (const [name, src] of fields) {
          if (!Object.prototype.hasOwnProperty.call(b.value, name)) {
            addError(
              b.line,
              `report.json 示例缺少字段 "${name}"（字段清单来源：${src}）`
            );
          }
        }
      }
    }
  }

  /* ---------------- 7. TASK.md 声明字段数核对 ---------------- */

  let taskInfo = null;
  const taskPath = options.taskPath || null;
  if (taskPath && exampleFieldCount !== null) {
    try {
      const taskRaw = fs.readFileSync(taskPath, 'utf8').replace(/^\uFEFF/, '');
      const taskLines = taskRaw.split(/\r?\n/);
      let declared = null;
      for (let i = 0; i < taskLines.length; i++) {
        const m = /(\d+)\s*(?:个)?\s*(?:字段|fields?)/i.exec(taskLines[i]);
        if (m) {
          declared = {
            count: Number(m[1]),
            line: i + 1,
            text: collapse(taskLines[i]),
          };
          break;
        }
      }
      taskInfo = {
        file: taskPath,
        declared: declared ? declared.count : null,
        line: declared ? declared.line : null,
      };
      if (declared && declared.count !== exampleFieldCount) {
        addError(
          declared.line,
          `TASK.md 声明字段数 ${declared.count}，与 §6 示例实际 ${exampleFieldCount} 个字段不一致（原文：「${declared.text}」；示例见契约 L${exampleFieldLine}）`,
          taskPath
        );
      }
    } catch (e) {
      addError(0, `无法读取 TASK.md：${collapse(e.message)}`, taskPath);
    }
  }

  /* ---------------- 8. 汇总 ---------------- */

  errors.sort(
    (a, b) => (a.file ? 1 : 0) - (b.file ? 1 : 0) || a.line - b.line
  );

  return {
    file,
    lines: lines.length,
    sections: topLevel.length,
    allSections: sections,
    refs,
    jsonBlocks,
    fieldSection,
    requiredFields,
    exampleFieldCount,
    exampleFieldLine,
    taskInfo,
    errors,
  };
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function usage() {
  console.error(
    '用法: node check-contract.js <contract.md> [--task TASK.md|--no-task] [--verbose] [--json]'
  );
}

function main() {
  const argv = process.argv.slice(2);
  const flags = new Set();
  const positional = [];
  let taskArg = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--task') {
      taskArg = argv[++i] || null;
    } else if (a.startsWith('--task=')) {
      taskArg = a.slice('--task='.length);
    } else if (a.startsWith('--')) {
      flags.add(a);
    } else {
      positional.push(a);
    }
  }

  if (positional.length !== 1) {
    usage();
    console.log('checked 0 sections, 0 refs, 1 errors');
    return EXIT_ERROR;
  }

  const file = path.resolve(positional[0]);

  let taskPath = null;
  if (!flags.has('--no-task')) {
    if (taskArg) {
      taskPath = path.resolve(taskArg);
    } else {
      const cwdTask = path.join(process.cwd(), 'TASK.md');
      const contractDirTask = path.join(path.dirname(file), 'TASK.md');
      if (fs.existsSync(cwdTask)) taskPath = cwdTask;
      else if (fs.existsSync(contractDirTask)) taskPath = contractDirTask;
    }
  }

  let result;
  try {
    result = checkContract(file, { taskPath });
  } catch (e) {
    console.log(`error L0: 无法读取或解析文件 ${file}：${collapse(e.message)}`);
    console.log('checked 0 sections, 0 refs, 1 errors');
    return EXIT_ERROR;
  }

  if (flags.has('--json')) {
    const payload = {
      file: result.file,
      lines: result.lines,
      sections: result.sections,
      refs: result.refs.length,
      unresolved_refs: result.refs.filter((r) => !r.resolved).length,
      json_blocks: result.jsonBlocks.length,
      field_section: result.fieldSection,
      required_fields: result.requiredFields,
      example_fields: result.exampleFieldCount,
      task_file: result.taskInfo ? result.taskInfo.file : null,
      task_declared_fields: result.taskInfo ? result.taskInfo.declared : null,
      errors: result.errors,
      ok: result.errors.length === 0,
    };
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    return result.errors.length === 0 ? EXIT_OK : EXIT_ERROR;
  }

  if (flags.has('--verbose')) {
    console.log(`file: ${result.file}`);
    console.log('sections:');
    for (const s of result.allSections) {
      const num = s.number ? `§${s.number}` : '(未编号)';
      console.log(
        `  L${String(s.line).padStart(4, ' ')}  ${'#'.repeat(s.level)} ${num} ${
          s.title
        }`
      );
    }
    console.log(`refs: ${result.refs.length}（未解析 ${
      result.refs.filter((r) => !r.resolved).length
    }）`);
    console.log(`json blocks: ${result.jsonBlocks.length}`);
    if (result.fieldSection) {
      console.log(
        `field section: §${result.fieldSection.number} ${result.fieldSection.title} ` +
          `(required: ${result.requiredFields.length}, example: ${result.exampleFieldCount})`
      );
    }
    if (result.taskInfo) {
      const declared =
        result.taskInfo.declared === null ? 'n/a' : result.taskInfo.declared;
      console.log(
        `task file: ${result.taskInfo.file} (declared fields: ${declared})`
      );
    }
    console.log('');
  }

  for (const e of result.errors) {
    const where = e.file ? `${path.basename(e.file)}:L${e.line}` : `L${e.line}`;
    console.log(`error ${where}: ${e.message}`);
  }

  console.log(
    `checked ${result.sections} sections, ${result.refs.length} refs, ${
      result.errors.length
    } errors`
  );

  return result.errors.length === 0 ? EXIT_OK : EXIT_ERROR;
}

if (require.main === module) {
  process.exitCode = main();
}
