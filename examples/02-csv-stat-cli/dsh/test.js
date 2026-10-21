'use strict';
/*
 * csvstat 测试 —— 零第三方依赖
 * 全部用例都通过 child_process.spawnSync 真实启动 `node csvstat.js`。
 * 运行: node test.js    （全部通过时退出码 0）
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const NODE = process.execPath;
const CLI = path.join(__dirname, 'csvstat.js');

function run(args, opts) {
  const options = {
    cwd: __dirname,
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true
  };
  if (opts && Object.prototype.hasOwnProperty.call(opts, 'input')) {
    options.input = opts.input;
  } else {
    options.input = '';
  }
  return spawnSync(NODE, [CLI].concat(args), options);
}

function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error((label || '值') + ' 期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual));
  }
}

function ok(cond, message) {
  if (!cond) throw new Error(message || '断言失败');
}

function parseJson(res) {
  try {
    return JSON.parse(res.stdout);
  } catch (err) {
    throw new Error('stdout 不是合法 JSON: ' + err.message + '\n--- stdout ---\n' + res.stdout);
  }
}

function stat(report, column) {
  const s = (report.stats || []).find((x) => x.column === column);
  if (!s) throw new Error('报告中缺少列 ' + column);
  return s;
}

let total = 0;
let passed = 0;

function test(desc, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log('ok ' + total + ' - ' + desc);
  } catch (err) {
    console.log('fail ' + total + ' - ' + desc);
    const lines = String(err && err.message ? err.message : err).split('\n');
    for (const line of lines) console.log('  ' + line);
  }
}

/* ---------------- 用例 ---------------- */

test('--help 打印用法并退出 0', () => {
  const res = run(['--help']);
  eq(res.status, 0, '退出码');
  ok(res.stdout.indexOf('用法') >= 0, '帮助中应含「用法」');
  ok(res.stdout.indexOf('--group-by') >= 0, '帮助中应含 --group-by');
  ok(res.stdout.indexOf('退出码') >= 0, '帮助中应含退出码说明');
});

test('基本统计：数值列 mean/min/max/sum 与分类列唯一值', () => {
  const res = run(['--json'], { input: 'a,b\n1,x\n2,y\n3,z\n' });
  eq(res.status, 0, '退出码');
  const r = parseJson(res);
  eq(r.rows, 3, '行数');
  const a = stat(r, 'a');
  eq(a.type, 'numeric', 'a 类型');
  eq(a.sum, 6, 'a sum');
  eq(a.mean, 2, 'a mean');
  eq(a.min, 1, 'a min');
  eq(a.max, 3, 'a max');
  eq(a.missing, 0, 'a 缺失');
  const b = stat(r, 'b');
  eq(b.type, 'categorical', 'b 类型');
  eq(b.unique, 3, 'b 唯一值');
});

test('引号内逗号不会被当作分隔符', () => {
  const res = run(['--json'], { input: 'id,name\n1,"Zhang, San"\n2,Li\n' });
  eq(res.status, 0, '退出码');
  const r = parseJson(res);
  eq(r.rows, 2, '行数');
  const name = stat(r, 'name');
  eq(name.unique, 2, 'name 唯一值');
  eq(name.mode, 'tie', '两个值各出现一次应为 tie');
  eq(name.tie, true, 'tie 标记');
});

test('"" 转义还原为一个双引号', () => {
  const res = run(['--json'], { input: 'id,note\n1,"He said ""hi"""\n' });
  eq(res.status, 0, '退出码');
  const r = parseJson(res);
  eq(r.rows, 1, '行数');
  const note = stat(r, 'note');
  eq(note.unique, 1, '唯一值');
  eq(note.mode, 'He said "hi"', '还原后的字段内容');
});

test('字段内换行不会被拆成两行', () => {
  const res = run(['--json'], { input: 'id,text\n1,"line1\nline2"\n2,flat\n' });
  eq(res.status, 0, '退出码');
  const r = parseJson(res);
  eq(r.rows, 2, '行数');
  eq(stat(r, 'text').unique, 2, 'text 唯一值');
});

test('UTF-8 BOM 不会污染首列表头', () => {
  const res = run(['--json'], { input: '\ufeffa\n1\n2\n' });
  eq(res.status, 0, '退出码');
  const r = parseJson(res);
  eq(r.columns[0], 'a', '首列表名');
  eq(r.rows, 2, '行数');
  eq(stat(r, 'a').sum, 3, 'a sum');
});

test('CRLF 行尾可正确解析', () => {
  const res = run(['--json'], { input: 'a,b\r\n1,2\r\n3,4\r\n' });
  eq(res.status, 0, '退出码');
  const r = parseJson(res);
  eq(r.rows, 2, '行数');
  eq(stat(r, 'a').sum, 4, 'a sum');
  eq(stat(r, 'b').max, 4, 'b max');
});

test('缺失值计入 missing 且不参与数值统计', () => {
  const res = run(['--json'], { input: 'a,b\n1,\n2,x\n,x\n' });
  eq(res.status, 0, '退出码');
  const r = parseJson(res);
  eq(r.rows, 3, '行数');
  const a = stat(r, 'a');
  eq(a.missing, 1, 'a 缺失数');
  eq(a.count, 2, 'a 有效值');
  eq(a.mean, 1.5, 'a mean');
  eq(a.sum, 3, 'a sum');
});

test('--columns 只统计指定列并保持给定顺序', () => {
  const res = run(['--json', '--columns', 'c,a'], { input: 'a,b,c\n1,2,3\n4,5,6\n' });
  eq(res.status, 0, '退出码');
  const r = parseJson(res);
  eq(r.stats.map((s) => s.column).join(','), 'c,a', '统计列顺序');
  eq(r.stats.length, 2, '统计列数量');
});

test('未知列名退出码 2 并列出可用列名', () => {
  const res = run(['--columns', 'nope'], { input: 'a,b\n1,2\n' });
  eq(res.status, 2, '退出码');
  ok(res.stderr.indexOf('未知列名') >= 0, 'stderr 应提示未知列名');
  ok(res.stderr.indexOf('a, b') >= 0, 'stderr 应列出可用列名');
});

test('--group-by 未知列退出码 2', () => {
  const res = run(['--group-by', 'ghost'], { input: 'a,b\n1,2\n' });
  eq(res.status, 2, '退出码');
  ok(res.stderr.indexOf('未知列名') >= 0, 'stderr 应提示未知列名');
});

test('--group-by 分组统计（JSON）行数与统计正确', () => {
  const csv = 'g,v\nx,1\nx,3\ny,10\ny,\n';
  const res = run(['--json', '--group-by', 'g'], { input: csv });
  eq(res.status, 0, '退出码');
  const r = parseJson(res);
  eq(r.rows, 4, '总行数');
  eq(r.groups.length, 2, '分组数');
  const gx = r.groups.find((g) => g.key === 'x');
  const gy = r.groups.find((g) => g.key === 'y');
  ok(gx && gy, '应包含 x / y 两组');
  eq(gx.rows, 2, 'x 行数');
  eq(gx.stats.find((s) => s.column === 'v').mean, 2, 'x 的 v mean');
  eq(gy.rows, 2, 'y 行数');
  eq(gy.stats.find((s) => s.column === 'v').missing, 1, 'y 的 v 缺失数');
});

test('--group-by 的 Markdown 输出包含分组标题与行数', () => {
  const res = run(['--group-by', 'g'], { input: 'g,v\nx,1\nx,3\ny,10\n' });
  eq(res.status, 0, '退出码');
  ok(res.stdout.indexOf('## g = x（2 行）') >= 0, 'Markdown 应包含 x 组标题');
  ok(res.stdout.indexOf('## g = y（1 行）') >= 0, 'Markdown 应包含 y 组标题');
  ok(res.stdout.indexOf('| 列 | 类型 |') >= 0, 'Markdown 应包含表格');
});

test('--json 输出可被 JSON.parse 且结构完整', () => {
  const res = run(['--json', '--input', 'fixtures/sample100.csv']);
  eq(res.status, 0, '退出码');
  const r = parseJson(res);
  eq(r.rows, 100, 'fixtures 行数');
  ok(Array.isArray(r.columns), 'columns 应为数组');
  ok(Array.isArray(r.stats), 'stats 应为数组');
  eq(r.stats.length, r.columns.length, '每列都有统计');
});

test('文件不存在退出码 1 并给出清晰错误', () => {
  const res = run(['--input', 'no-such-file.csv']);
  eq(res.status, 1, '退出码');
  ok(res.stderr.indexOf('文件不存在') >= 0, 'stderr 应提示文件不存在');
  ok(res.stderr.indexOf('no-such-file.csv') >= 0, 'stderr 应包含文件名');
});

test('列数不齐时告警但继续处理', () => {
  const res = run(['--json'], { input: 'a,b\n1,2\n3\n4,5,6\n' });
  eq(res.status, 0, '退出码');
  ok(res.stderr.indexOf('warning') >= 0, 'stderr 应有 warning');
  ok(res.stderr.indexOf('列数') >= 0, 'warning 应提到列数');
  const r = parseJson(res);
  eq(r.rows, 3, '仍然统计 3 行');
  eq(stat(r, 'a').sum, 8, 'a sum（1+3+4）');
});

test('分类列众数并列时输出 tie', () => {
  const res = run(['--json'], { input: 'c\np\nq\np\nq\n' });
  eq(res.status, 0, '退出码');
  const r = parseJson(res);
  const c = stat(r, 'c');
  eq(c.mode, 'tie', '并列众数');
  eq(c.modeCount, 2, '并列次数');
  eq(c.unique, 2, '唯一值');
});

test('全空列被识别为数值列且缺失数等于行数', () => {
  const res = run(['--json'], { input: 'a,b\n1,\n2,\n' });
  eq(res.status, 0, '退出码');
  const r = parseJson(res);
  const b = stat(r, 'b');
  eq(b.type, 'numeric', '类型');
  eq(b.missing, 2, '缺失数');
  eq(b.count, 0, '有效值');
  eq(b.mean, null, 'mean 应为 null');
});

test('--input - 与省略 --input 都从 stdin 读取且结果一致', () => {
  const csv = 'a\n1\n2\n3\n';
  const a = run(['--input', '-', '--json'], { input: csv });
  const b = run(['--json'], { input: csv });
  eq(a.status, 0, '退出码');
  eq(b.status, 0, '退出码');
  eq(a.stdout, b.stdout, '两种写法的输出应完全一致');
  eq(parseJson(a).rows, 3, '行数');
});

test('未知参数退出码 2', () => {
  const res = run(['--nope'], { input: 'a\n1\n' });
  eq(res.status, 2, '退出码');
  ok(res.stderr.indexOf('未知参数') >= 0, 'stderr 应提示未知参数');
});

test('fixtures/sample100.csv 含引号/换行/BOM/缺失值仍解析为 100 行', () => {
  const file = path.join(__dirname, 'fixtures', 'sample100.csv');
  ok(fs.existsSync(file), 'fixtures/sample100.csv 应存在');
  const res = run(['--input', file, '--json']);
  eq(res.status, 0, '退出码');
  const r = parseJson(res);
  eq(r.rows, 100, '数据行数');
  const name = stat(r, 'name');
  eq(name.type, 'categorical', 'name 类型');
  ok(name.missing > 0, 'name 应存在缺失值');
  const score = stat(r, 'score');
  eq(score.type, 'numeric', 'score 类型');
  ok(score.missing > 0, 'score 应存在缺失值');
});

test('空输入输出 0 行报告且退出码 0', () => {
  const res = run(['--json'], { input: '' });
  eq(res.status, 0, '退出码');
  const r = parseJson(res);
  eq(r.rows, 0, '行数');
  eq(r.columns.length, 0, '列数');
});

test('--input 缺少参数值退出码 2', () => {
  const res = run(['--input'], { input: '' });
  eq(res.status, 2, '退出码');
  ok(res.stderr.indexOf('缺少参数值') >= 0, 'stderr 应提示缺少参数值');
});

/* ---------------- 汇总 ---------------- */

console.log('');
console.log('1..' + total);
console.log('总计: ' + total + ' 个用例，' + passed + ' 通过，' + (total - passed) + ' 失败');
console.log(passed === total ? 'RESULT: PASS' : 'RESULT: FAIL');
process.exitCode = passed === total ? 0 : 1;
