#!/usr/bin/env node
"use strict";
/**
 * SortLab 自检：从 index.html 抽取唯一的算法实现并验证。
 * 运行：node selftest.js
 */
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const match = html.match(/<script id="sort-core">([\s\S]*?)<\/script>/);
if (!match) {
  console.error("fail - 找不到 <script id=\"sort-core\">，无法抽取算法实现");
  process.exit(1);
}

let SortCore;
try {
  SortCore = new Function(match[1] + "\nreturn SortCore;")();
} catch (err) {
  console.error("fail - 算法脚本无法执行: " + err.message);
  process.exit(1);
}

let pass = 0;
let fail = 0;
const lines = [];

function check(name, condition, detail) {
  if (condition) {
    pass++;
    lines.push("ok " + pass + " - " + name);
  } else {
    fail++;
    lines.push("fail " + (pass + fail) + " - " + name + (detail ? " :: " + detail : ""));
  }
}

function sameArray(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function replay(input, frames) {
  const a = input.slice();
  for (const f of frames) {
    if (f.t === "w") {
      if (!Number.isInteger(f.i) || f.i < 0 || f.i >= a.length) return null;
      a[f.i] = f.v;
    } else if (f.t === "c") {
      if (!Number.isInteger(f.i) || !Number.isInteger(f.j)) return null;
      if (f.i < 0 || f.j < 0 || f.i >= a.length || f.j >= a.length) return null;
    } else {
      return null;
    }
  }
  return a;
}

const cases = [
  { name: "空数组", input: [] },
  { name: "单元素", input: [7] },
  { name: "已排序 20", input: Array.from({ length: 20 }, (_, i) => i + 1) },
  { name: "逆序 20", input: Array.from({ length: 20 }, (_, i) => 20 - i) },
  { name: "大量重复值", input: [5, 5, 3, 3, 3, 1, 2, 2, 9, 1, 5, 2, 3, 3] },
  { name: "随机 200", input: SortCore.generate(200, 424242) },
];

const summary = {};

for (const algo of SortCore.algorithms) {
  summary[algo] = { comparisons: 0, writes: 0, frames: 0 };
  for (const c of cases) {
    const label = `${algo} / ${c.name}`;
    let run;
    try {
      run = SortCore[algo](c.input);
    } catch (err) {
      check(label + " 运行", false, err.message);
      continue;
    }
    check(label + " 返回结构", !!run && Array.isArray(run.sorted) && Array.isArray(run.frames));
    if (!run || !Array.isArray(run.sorted)) continue;

    const expected = c.input.slice().sort((a, b) => a - b);
    check(label + " 有序", sameArray(run.sorted, expected), JSON.stringify(run.sorted.slice(0, 8)));
    check(label + " 多重集不变", sameArray(run.sorted.slice().sort((a, b) => a - b), expected));

    const cmps = run.frames.filter((f) => f.t === "c").length;
    const writes = run.frames.filter((f) => f.t === "w").length;
    check(label + " 比较计数一致", cmps === run.comparisons, `${cmps} vs ${run.comparisons}`);
    check(label + " 写入计数一致", writes === run.writes, `${writes} vs ${run.writes}`);

    const replayed = replay(c.input, run.frames);
    check(label + " 帧序列可重放", replayed !== null && sameArray(replayed, run.sorted));

    summary[algo].comparisons += run.comparisons;
    summary[algo].writes += run.writes;
    summary[algo].frames += run.frames.length;
  }
}

lines.push("");
lines.push("算法汇总（6 组用例累计）:");
for (const algo of Object.keys(summary)) {
  const s = summary[algo];
  lines.push(`  ${algo.padEnd(10)} 比较 ${String(s.comparisons).padStart(6)}  写入 ${String(s.writes).padStart(6)}  帧 ${String(s.frames).padStart(6)}`);
}
lines.push("");
lines.push(`${pass} passed, ${fail} failed`);

console.log(lines.join("\n"));
process.exit(fail === 0 ? 0 : 1);
