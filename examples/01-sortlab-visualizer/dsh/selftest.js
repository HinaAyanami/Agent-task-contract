'use strict';
/*
 * SortLab 自测脚本
 * 用法: node selftest.js   （退出码 0 = 全部通过）
 *
 * 关键约束：不复制任何排序实现。本脚本读取 index.html，用正则抽取
 * <script id="sort-core"> ... </script> 的源码，交给 new Function 执行，
 * 取出其中的 window.SortCore 后做黑盒 + 步骤重放校验。
 */

const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, 'index.html');
const SCRIPT_RE = /<script[^>]*\bid\s*=\s*["']sort-core["'][^>]*>([\s\S]*?)<\/script>/i;

let assertions = 0;
let failures = 0;
let fatal = false;

function assert(cond, msg) {
  assertions++;
  if (!cond) {
    failures++;
    console.log('  FAIL  ' + msg);
  }
}

function fatalExit(code, msg) {
  console.log('FATAL: ' + msg);
  fatal = true;
  process.exitCode = code;
}

/* ---------------- 1. 读取并抽取 sort-core ---------------- */

if (!fs.existsSync(HTML_PATH)) {
  fatalExit(2, '找不到 index.html: ' + HTML_PATH);
}
const html = fs.existsSync(HTML_PATH) ? fs.readFileSync(HTML_PATH, 'utf8') : '';

const match = html.match(SCRIPT_RE);
if (!match) {
  fatalExit(2, 'index.html 中未找到 <script id="sort-core"> ... </script>');
}

let SortCore = null;
if (match) {
  try {
    const factory = new Function('window', match[1] + '\n;return window.SortCore;');
    SortCore = factory({});
  } catch (err) {
    fatalExit(3, 'sort-core 源码执行失败: ' + err.message);
  }
}

/* ---------------- 2. 静态检查 ---------------- */

if (!fatal) {
  const coreCount = (html.match(/id\s*=\s*["']sort-core["']/gi) || []).length;
  assert(coreCount === 1, 'sort-core 脚本块应唯一，实际 ' + coreCount + ' 处');
  assert(!/http:\/\//i.test(html), 'index.html 中不应出现 http://');
  assert(!/https:\/\//i.test(html), 'index.html 中不应出现 https://');
  assert(!/\bsrc\s*=/i.test(html), 'index.html 中不应出现 src= 外链');
  assert(/<style[\s>]/i.test(html), 'index.html 应包含内联 <style>');

  const algs = SortCore && Array.isArray(SortCore.algorithms) ? SortCore.algorithms : [];
  assert(algs.length === 4, '应导出 4 个算法，实际 ' + algs.length);
  for (const id of ['bubble', 'insertion', 'quick', 'merge']) {
    assert(algs.some((a) => a.id === id && typeof a.run === 'function'), '缺少算法实现: ' + id);
  }
  for (const fn of ['bubbleSort', 'insertionSort', 'quickSort', 'mergeSort']) {
    assert(typeof SortCore[fn] === 'function', 'SortCore.' + fn + ' 应为函数');
  }
}

/* ---------------- 3. 测试辅助 ---------------- */

function isSorted(arr) {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i - 1] > arr[i]) return false;
  }
  return true;
}

function counts(list) {
  const m = new Map();
  for (const v of list) m.set(v, (m.get(v) || 0) + 1);
  return m;
}

function sameMultiset(a, b) {
  if (a.length !== b.length) return false;
  const ma = counts(a);
  const mb = counts(b);
  if (ma.size !== mb.size) return false;
  for (const [k, v] of ma) {
    if (mb.get(k) !== v) return false;
  }
  return true;
}

function sameNumbers(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function inRange(idx, len) {
  return Number.isInteger(idx) && idx >= 0 && idx < len;
}

/* 独立重算：只看 steps，重新统计比较/写入次数，并仅用写入步骤重放数组 */
function recount(input, steps) {
  const replay = input.slice();
  let compares = 0;
  let writes = 0;
  let error = '';
  const len = input.length;
  for (let k = 0; k < steps.length; k++) {
    const s = steps[k];
    const tag = 'steps[' + k + '] ';
    if (!s || typeof s !== 'object') { error = tag + '不是对象'; break; }
    if (s.t === 'c') {
      compares++;
      if (!inRange(s.i, len) || !inRange(s.j, len)) { error = tag + '比较下标越界'; break; }
    } else if (s.t === 'w') {
      writes++;
      if (!inRange(s.i, len)) { error = tag + '写入下标越界'; break; }
      if (!Number.isInteger(s.v)) { error = tag + '写入值非整数'; break; }
      replay[s.i] = s.v;
    } else {
      error = tag + '未知步骤类型 ' + JSON.stringify(s.t);
      break;
    }
  }
  return { compares, writes, replay, error };
}

function lcg(seed) {
  let s = seed >>> 0;
  return function next(lo, hi) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return lo + Math.floor((s / 4294967296) * (hi - lo + 1));
  };
}

function makeInputs() {
  const rnd = lcg(20261020);
  const r200 = [];
  for (let i = 0; i < 200; i++) r200.push(rnd(4, 100));

  const rnd2 = lcg(7);
  const mixed = [];
  for (let i = 0; i < 25; i++) mixed.push(rnd2(-20, 8));

  return [
    { name: '空数组', data: [] },
    { name: '单元素', data: [42] },
    { name: '已排序', data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    { name: '逆序', data: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] },
    {
      name: '大量重复值',
      data: Array.from({ length: 60 }, (_, i) => [5, 3, 9, 3, 1, 7][i % 6]),
    },
    { name: '随机 200 元素', data: r200 },
    { name: '含负数与重复', data: mixed },
  ];
}

/* ---------------- 4. 逐算法校验 ---------------- */

function runAlgorithm(algo, inputs) {
  let casePass = 0;
  let totalCompares = 0;
  let totalWrites = 0;

  for (const item of inputs) {
    const before = failures;
    const input = item.data.slice();
    let res = null;
    try {
      res = algo.run(input);
    } catch (err) {
      assert(false, '[' + algo.name + ' / ' + item.name + '] 抛出异常: ' + err.message);
      continue;
    }

    assert(res && typeof res === 'object', '[' + algo.name + ' / ' + item.name + '] 无返回值');
    assert(Array.isArray(res.sorted), '[' + algo.name + ' / ' + item.name + '] sorted 不是数组');
    assert(Array.isArray(res.steps), '[' + algo.name + ' / ' + item.name + '] steps 不是数组');

    const out = res.sorted;
    assert(out.length === item.data.length,
      '[' + algo.name + ' / ' + item.name + '] 长度变化 ' + item.data.length + '→' + out.length);
    assert(isSorted(out), '[' + algo.name + ' / ' + item.name + '] 结果未按升序排列');
    assert(sameMultiset(out, item.data), '[' + algo.name + ' / ' + item.name + '] 元素多重集被改变');
    assert(sameNumbers(input, item.data), '[' + algo.name + ' / ' + item.name + '] 入参数组被就地修改');

    const rec = recount(item.data, res.steps);
    assert(rec.error === '', '[' + algo.name + ' / ' + item.name + '] 步骤非法: ' + rec.error);
    assert(res.comparisons === rec.compares,
      '[' + algo.name + ' / ' + item.name + '] 比较计数不一致：返回 ' + res.comparisons +
      '，独立重算 ' + rec.compares);
    assert(res.writes === rec.writes,
      '[' + algo.name + ' / ' + item.name + '] 写入计数不一致：返回 ' + res.writes +
      '，独立重算 ' + rec.writes);
    assert(res.steps.length === rec.compares + rec.writes,
      '[' + algo.name + ' / ' + item.name + '] 步数应等于比较+写入');
    assert(sameNumbers(rec.replay, out),
      '[' + algo.name + ' / ' + item.name + '] 按写入步骤重放的结果与 sorted 不一致');

    if (item.data.length === 0) {
      assert(res.steps.length === 0, '[' + algo.name + ' / 空数组] 不应产生任何步骤');
    }

    totalCompares += res.comparisons;
    totalWrites += res.writes;
    if (failures === before) casePass++;
  }

  console.log(
    '  ' + algo.name + '  : ' + casePass + '/' + inputs.length + ' 组通过' +
    '  (累计比较 ' + totalCompares + ' 次 / 写入 ' + totalWrites + ' 次)'
  );
  return casePass;
}

/* ---------------- 5. 主流程 ---------------- */

if (!fatal) {
  const inputs = makeInputs();
  const algoList = SortCore.algorithms;

  console.log('SortLab selftest');
  console.log('================');
  console.log('index.html      : ' + html.length + ' 字符，已读取');
  console.log('sort-core       : 已抽取 ' + match[1].length + ' 字符');
  console.log('算法            : ' + algoList.map((a) => a.name).join(' / '));
  console.log('输入组          : ' + inputs.length + ' 组（' + inputs.map((i) => i.name).join('、') + '）');
  console.log('静态检查        : 无 http(s) 外链 / 无 src= / 无第二份算法实现');
  console.log('');

  let totalCases = 0;
  for (const algo of algoList) {
    totalCases += runAlgorithm(algo, inputs);
  }

  console.log('');
  console.log('断言总数        : ' + assertions);
  console.log('用例总数        : ' + totalCases + ' / ' + algoList.length * inputs.length);
  console.log('失败数          : ' + failures);
  console.log(failures === 0 ? 'RESULT: PASS' : 'RESULT: FAIL');

  process.exitCode = failures === 0 ? 0 : 1;
}
