# P2 — csvstat：零依赖 Node CLI

## 交付物（全部放在本目录）
1. `csvstat.js` — `node csvstat.js ...` 直接运行，零第三方依赖，只用 Node 标准库。
2. `test.js` — `node test.js` 全绿退出码 0，零第三方依赖。
3. `README.md` — 用法与设计说明（不超过 80 行）。
4. 可附 `fixtures/` 测试数据。

## 功能要求
- 输入：`--input <path>` 读文件；`--input -` 或省略时读 stdin。
- 正确处理 RFC4180：字段内逗号、双引号转义 `""`、字段内换行、CRLF、UTF-8 BOM。
- `--group-by <col>`：按列分组；每组输出行数、各数值列的 mean/min/max/sum、各列缺失值计数。
- `--columns a,b,c`：只统计指定列；未知列名 → stderr 报错、退出码 2、列出可用列名。
- 列类型自动识别：所有非空值都能解析为有限数字 → 数值列（输出 mean/min/max/sum）；
  否则为分类列（输出唯一值个数与众数，众数并列时输出 `tie`）。
- 默认输出 Markdown 表格到 stdout；`--json` 输出 JSON。
- `--help` 打印用法、退出码 0；无参数且 stdin 是 TTY → 打印用法、退出码 2。
- 文件不存在 → 退出码 1 + 清晰错误信息。
- 某行列数与表头不一致 → stderr 警告但继续处理。

## 测试要求（test.js）
- 至少 12 个用例，覆盖：基本统计、引号内逗号、`""` 转义、字段内换行、BOM、CRLF、
  缺失值、未知列名（退出码 2）、分组统计、JSON 模式、文件不存在（退出码 1）、列数不齐。
- 必须用 `child_process.spawnSync` 真实调用 `node csvstat.js`，不得只测导出函数。
- 每个用例打印 `ok N - 描述` / `fail N - 描述`，最后打印汇总。

## 验收
- `node test.js` 退出码 0，用例数 ≥ 12。
- 造一份含引号/换行/BOM/缺失值的 100 行 CSV，实际跑 `node csvstat.js --input ... --json` 输出合法 JSON。
- 人工检查 README 与帮助文本是否与实际行为一致。

## 环境提示
- Node.js 可执行文件：`<home>/.ai-manager/runtimes/node/24.20.0/node.exe`（PATH 里可能没有，直接用绝对路径）。
- 本机 shell 只有 PowerShell，没有可用的 bash。
- 交付前必须真实运行一次测试命令，并把输出贴进 README 末尾。
