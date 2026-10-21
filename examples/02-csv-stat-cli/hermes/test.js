#!/usr/bin/env node
"use strict";
/**
 * csvstat 的端到端测试：每个用例都通过 child_process.spawnSync 真实调用 CLI。
 * 运行：node test.js
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CLI = path.join(__dirname, "csvstat.js");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "csvstat-test-"));

let pass = 0;
let fail = 0;
const lines = [];

function ok(name, cond, detail) {
  if (cond) {
    pass++;
    lines.push(`ok ${pass + fail} - ${name}`);
  } else {
    fail++;
    lines.push(`fail ${pass + fail} - ${name}${detail ? " :: " + detail : ""}`);
  }
}

function run(args, input) {
  return spawnSync(process.execPath, [CLI, ...args], {
    input: input === undefined ? "" : input,
    encoding: "utf8",
    timeout: 20000,
  });
}

function fixture(name, content) {
  const p = path.join(TMP, name);
  fs.writeFileSync(p, content, "utf8");
  return p;
}

// 1. 基本统计
{
  const p = fixture("basic.csv", "name,age,city\nAlice,30,Beijing\nBob,25,Shanghai\nCarol,35,Beijing\n");
  const r = run(["--input", p, "--json"]);
  let j = null;
  try { j = JSON.parse(r.stdout); } catch (_) {}
  ok("基本统计：退出码 0", r.status === 0);
  ok("基本统计：JSON 可解析", j !== null);
  ok("基本统计：行数 3", j && j.rows === 3);
  ok("基本统计：age mean=30", j && j.stats.age.mean === 30, j && String(j.stats.age.mean));
  ok("基本统计：age sum=90", j && j.stats.age.sum === 90);
  ok("基本统计：city 众数 Beijing", j && j.stats.city.mode === "Beijing");
  ok("基本统计：city unique=2", j && j.stats.city.unique === 2);
}

// 2. 引号内的逗号
{
  const p = fixture("comma.csv", 'name,city\n"Doe, John",NY\n');
  const r = run(["--input", p, "--json"]);
  const j = JSON.parse(r.stdout);
  ok("引号内逗号：只拆成 2 列", j.columns.length === 2, JSON.stringify(j.columns));
  ok("引号内逗号：字段完整", j.stats.name.mode === "Doe, John", j.stats.name.mode);
}

// 3. "" 转义
{
  const p = fixture("esc.csv", 'text\n"He said ""hi"""\n');
  const r = run(["--input", p, "--json"]);
  const j = JSON.parse(r.stdout);
  ok('双引号转义：解析为 He said "hi"', j.stats.text.mode === 'He said "hi"', j.stats.text.mode);
}

// 4. 字段内换行
{
  const p = fixture("newline.csv", 'id,note\n1,"line1\nline2"\n2,ok\n');
  const r = run(["--input", p, "--json"]);
  const j = JSON.parse(r.stdout);
  ok("字段内换行：行数 2", j.rows === 2, String(j.rows));
  ok("字段内换行：note unique=2", j.stats.note.unique === 2);
}

// 5. BOM
{
  const p = fixture("bom.csv", "\uFEFFa,b\n1,2\n");
  const r = run(["--input", p, "--json"]);
  const j = JSON.parse(r.stdout);
  ok("BOM：表头首列是 a", j.columns[0] === "a", JSON.stringify(j.columns));
  ok("BOM：数值解析正确", j.stats.a.mean === 1);
}

// 6. CRLF
{
  const p = fixture("crlf.csv", "a,b\r\n1,2\r\n3,4\r\n");
  const r = run(["--input", p, "--json"]);
  const j = JSON.parse(r.stdout);
  ok("CRLF：行数 2", j.rows === 2, String(j.rows));
  ok("CRLF：b sum=6", j.stats.b.sum === 6);
}

// 7. 缺失值
{
  const p = fixture("missing.csv", "a,b\n1,x\n,y\n3,\n");
  const r = run(["--input", p, "--json"]);
  const j = JSON.parse(r.stdout);
  ok("缺失值：a 缺失 1", j.stats.a.missing === 1, String(j.stats.a.missing));
  ok("缺失值：b 缺失 1", j.stats.b.missing === 1, String(j.stats.b.missing));
  ok("缺失值：a 非空 2", j.stats.a.count === 2);
}

// 8. 未知列 → 退出码 2 且列出可用列
{
  const p = fixture("basic2.csv", "a,b\n1,2\n");
  const r = run(["--input", p, "--columns", "nope"]);
  ok("未知列：退出码 2", r.status === 2, String(r.status));
  ok("未知列：提示可用列", /可用列/.test(r.stderr) && /a, b/.test(r.stderr), r.stderr.trim());
}

// 9. 分组统计
{
  const p = fixture("group.csv", "dept,score\nA,10\nA,20\nB,5\n");
  const r = run(["--input", p, "--group-by", "dept", "--json"]);
  const j = JSON.parse(r.stdout);
  ok("分组：两组", j.groups && j.groups.length === 2, JSON.stringify(j.groups && j.groups.map((g) => g.key)));
  const a = j.groups.find((g) => g.key === "A");
  ok("分组：A 组 2 行", a && a.rows === 2);
  ok("分组：A 组 mean=15", a && a.columns.score.mean === 15);
}

// 10. Markdown 默认输出
{
  const p = fixture("md.csv", "a,b\n1,2\n3,4\n");
  const r = run(["--input", p]);
  ok("Markdown：退出码 0", r.status === 0);
  ok("Markdown：含表头", /\| 列 \| 非空 \| 缺失 \| mean/.test(r.stdout), r.stdout.slice(0, 80));
  ok("Markdown：含 mean 值", /\| a \| 2 \| 0 \| 2 \| 1 \| 3 \| 4 \|/.test(r.stdout), r.stdout);
}

// 11. 文件不存在 → 退出码 1
{
  const r = run(["--input", path.join(TMP, "nope.csv")]);
  ok("文件不存在：退出码 1", r.status === 1, String(r.status));
  ok("文件不存在：错误信息", /文件不存在/.test(r.stderr), r.stderr.trim());
}

// 12. 列数不齐 → 警告但继续
{
  const p = fixture("ragged.csv", "a,b\n1,2,3\n4,5\n");
  const r = run(["--input", p, "--json"]);
  const j = JSON.parse(r.stdout);
  ok("列数不齐：退出码 0", r.status === 0, String(r.status));
  ok("列数不齐：stderr 警告", /警告/.test(r.stderr), r.stderr.trim());
  ok("列数不齐：仍统计 2 行", j.rows === 2);
}

// 13. --help
{
  const r = run(["--help"]);
  ok("--help：退出码 0", r.status === 0);
  ok("--help：打印用法", /用法:/.test(r.stdout), r.stdout.slice(0, 40));
}

// 14. --columns 过滤
{
  const p = fixture("cols.csv", "a,b,c\n1,2,3\n");
  const r = run(["--input", p, "--columns", "a,c", "--json"]);
  const j = JSON.parse(r.stdout);
  ok("--columns：只含 a,c", JSON.stringify(Object.keys(j.stats)) === JSON.stringify(["a", "c"]), JSON.stringify(Object.keys(j.stats)));
}

// 15. stdin 输入
{
  const r = run(["--input", "-", "--json"], "x,y\n2,4\n6,8\n");
  const j = JSON.parse(r.stdout);
  ok("stdin：行数 2", j.rows === 2, String(j.rows));
  ok("stdin：y mean=6", j.stats.y.mean === 6);
}

// 16. 众数并列 → tie
{
  const p = fixture("tie.csv", "v\nx\ny\n");
  const r = run(["--input", p, "--json"]);
  const j = JSON.parse(r.stdout);
  ok("并列众数：输出 tie", j.stats.v.mode === "tie", j.stats.v.mode);
}

// 17. 未知参数 → 退出码 2
{
  const r = run(["--bogus"]);
  ok("未知参数：退出码 2", r.status === 2, String(r.status));
}

lines.push("");
lines.push(`${pass} passed, ${fail} failed  (fixtures: ${TMP})`);
console.log(lines.join("\n"));
process.exit(fail === 0 ? 0 : 1);
