# csvstat — 零依赖 CSV 统计 CLI

只用 Node 标准库：读 CSV、识别列类型、算统计量，输出 Markdown 或 JSON。

## 用法

```bash
node csvstat.js --input fixtures/dirty.csv
node csvstat.js --input fixtures/dirty.csv --group-by dept --json
node csvstat.js --columns score,hours --input data.csv
cat data.csv | node csvstat.js --group-by dept
```

| 选项 | 说明 |
| --- | --- |
| `-i, --input <path>` | 输入文件；`-` 或省略读 stdin |
| `--group-by <col>` | 按列分组 |
| `--columns a,b,c` | 只统计指定列 |
| `--json` | JSON 输出（默认 Markdown） |
| `-h, --help` | 用法 |

退出码：`0` 成功 / `1` 文件错误 / `2` 用法或列名错误。

## 行为

- **解析**：手写 RFC4180 状态机。支持引号内逗号、`""` 转义、字段内换行、CRLF、UTF-8 BOM。
- **类型识别**：某列所有非空值都能解析为有限数字 → 数值列，输出
  `mean/min/max/sum`；否则为分类列，输出 `unique/mode`，众数并列输出 `tie`。
- **缺失值**：空字符串或纯空白。缺失计入 `missing`，不参与统计。
- **列数不齐**：`stderr` 给出带行号的警告，多余字段截断、缺失字段补空，继续处理。
- **输入为空**：退出码 2 并说明原因。

## 结构

| 文件 | 作用 |
| --- | --- |
| `csvstat.js` | 解析器 + 统计 + 两种输出 + CLI |
| `test.js` | 17 组用例 / 39 条断言，全部走 `spawnSync` 真实调用 |
| `fixtures/dirty.csv` | 100 行脏数据：BOM、CRLF、引号内逗号、字段内换行、缺失值 |

`csvstat.js` 导出 `parseCsv` / `buildTable` / `statsFor` 供测试引用，但 `test.js` 不使用它们，
只测命令行行为——避免"函数对了、CLI 错了"漏网。

## 测试输出

```
$ node test.js
ok 1 - 基本统计：退出码 0
...
ok 39 - 未知参数：退出码 2

39 passed, 0 failed
```

100 行脏数据的实测：

```
$ node csvstat.js --input fixtures/dirty.csv --group-by dept --json
# rows 100, groups 5, score.missing 6
$ node csvstat.js --input fixtures/dirty.csv
| 列 | 非空 | 缺失 | mean | min | max | sum |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| id | 100 | 0 | 50.5 | 1 | 100 | 5050 |
| score | 94 | 6 | 69.18 | 40 | 98.7 | 6503 |
| hours | 100 | 0 | 20.83 | 2 | 40 | 2083 |
```
