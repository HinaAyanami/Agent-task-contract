# SortLab — 单文件排序算法可视化

深色主题的排序过程可视化：一根柱子一个元素，高度和色相都映射数值，
正在比较的两个元素高亮，结束后整排变绿。

## 运行

双击 `index.html`（或在浏览器里打开）。无构建、无网络、无依赖。

- 算法：冒泡 / 插入 / 快速 / 归并
- 规模：20–200；速度：1–60 帧每刷新
- 开始 / 暂停 / 单步 / 重置
- 实时统计：比较次数、写入次数、已播放帧数、用时

## 结构

| 文件 | 作用 |
| --- | --- |
| `index.html` | 全部 UI + 内联的 `<script id="sort-core">` 算法实现 |
| `selftest.js` | 从 `index.html` 抽出 `sort-core`，在 Node 里跑算法测试 |

算法只有一份实现：`selftest.js` 用正则抽取 `<script id="sort-core">` 的内容，
`new Function` 执行后拿到 `SortCore`，不复制第二份代码。

每个算法返回 `{ sorted, frames, comparisons, writes }`；`frames` 是
`{t:"c",i,j}`（比较）与 `{t:"w",i,v}`（写入）的序列，UI 逐帧重放，
测试则用它验证动画与最终结果一致。

## 测试输出

```
$ node selftest.js
...
算法汇总（6 组用例累计）:
  bubble     比较  20070  写入  21058  帧  41128
  insertion  比较  10749  写入  10753  帧  21502
  quick      比较   2221  写入   1236  帧   3457
  merge      比较   1405  写入   1433  帧   2838

144 passed, 0 failed
```
