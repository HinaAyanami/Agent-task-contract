# csvstat — 零依赖 CSV 统计 CLI

只用 Node 标准库（`fs`），单脚本直接运行，无第三方依赖。

## 用法

```
node csvstat.js --input data.csv                  # Markdown 表格
node csvstat.js --input data.csv --json           # JSON 输出
node csvstat.js --input data.csv --group-by dept  # 按列分组
node csvstat.js --input data.csv --columns score,age
node csvstat.js --input - < data.csv              # 读 stdin（省略 --input 同效）
node csvstat.js --help                            # 用法，退出码 0
```

| 参数 | 说明 |
| --- | --- |
| `--input <path>` | 输入文件；`-` 或省略时读 stdin |
| `--group-by <col>` | 按该列分组，逐组输出行数与统计 |
| `--columns a,b,c` | 只统计指定列，顺序即输出顺序 |
| `--json` | 输出 JSON（默认 Markdown） |
| `-h, --help` | 打印用法并退出 0 |

## 输出格式

Markdown 表头为 `| 列 | 类型 | 缺失 | 有效 | mean | min | max | sum | 唯一值 | 众数 |`；分组时每组
一个 `## 列名 = 取值（N 行）` 小节。`--json` 输出 `{ source, groupBy, rows, columns, stats[] }`，
带 `--group-by` 时为 `groups: [{ key, label, rows, stats[] }]`。

## 设计要点

- 手写状态机解析 RFC4180：引号内逗号与换行、`""` 转义、CRLF、文件头 BOM。
- 去空格后为空即缺失，计入 `missing`，不参与统计。
- 类型识别：非空值全可解析为有限数字 → 数值列，否则分类列；全空列按数值列处理，
  `count=0`、`mean/min/max/sum` 为 `null`。
- 众数并列时 `mode` 输出 `tie`，另用 `tie: true` 与 `tiedValues` 区分「真实取值恰为 tie」。
- 行列数不一致：stderr 告警后继续，少补空值、多截断，不丢行。
- 空输入或只有表头：输出 0 行报告，退出码 0。

| 退出码 | 含义 |
| --- | --- |
| 0 | 成功 |
| 1 | 输入文件不存在或读取失败 |
| 2 | 用法错误：未知参数、参数缺值、未知列名、无输入且 stdin 是终端 |

## 测试

```
$ node test.js
ok 1 - --help 打印用法并退出 0
ok 2 - 基本统计：数值列 mean/min/max/sum 与分类列唯一值
ok 3 - 引号内逗号不会被当作分隔符
ok 4 - "" 转义还原为一个双引号
ok 5 - 字段内换行不会被拆成两行
ok 6 - UTF-8 BOM 不会污染首列表头
ok 7 - CRLF 行尾可正确解析
ok 8 - 缺失值计入 missing 且不参与数值统计
ok 9 - --columns 只统计指定列并保持给定顺序
ok 10 - 未知列名退出码 2 并列出可用列名
ok 11 - --group-by 未知列退出码 2
ok 12 - --group-by 分组统计（JSON）行数与统计正确
ok 13 - --group-by 的 Markdown 输出包含分组标题与行数
ok 14 - --json 输出可被 JSON.parse 且结构完整
ok 15 - 文件不存在退出码 1 并给出清晰错误
ok 16 - 列数不齐时告警但继续处理
ok 17 - 分类列众数并列时输出 tie
ok 18 - 全空列被识别为数值列且缺失数等于行数
ok 19 - --input - 与省略 --input 都从 stdin 读取且结果一致
ok 20 - 未知参数退出码 2
ok 21 - fixtures/sample100.csv 含引号/换行/BOM/缺失值仍解析为 100 行
ok 22 - 空输入输出 0 行报告且退出码 0
ok 23 - --input 缺少参数值退出码 2

1..23
总计: 23 个用例，23 通过，0 失败
RESULT: PASS
```
