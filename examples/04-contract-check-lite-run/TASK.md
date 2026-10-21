mode: lite
context: isolated（本任务与既有会话上下文无关，不得引用历史任务内容）

# 任务：契约检查器 check-contract.js

## 产物
`<workspace>\_runs\contract-check\check-contract.js`（单文件，零依赖，只用 fs/path）

## 验收命令
```
node check-contract.js <workspace>/COLLAB-v2.0.md
```
期望：退出码 0，stdout 最后一行形如 `checked 11 sections, N refs, 0 errors`

## 交付物
1. `check-contract.js`
2. `_evidence/test.log`（原始 stdout + stderr）
3. `_evidence/report.json`（§6 全部 13 个字段）
4. `_evidence/timeout-probe.log`

## 功能要求
1. 解析 Markdown，提取所有 `## ` 与 `### ` 标题，建立章节树（`## 1 xxx` → 1；`### 1.1 xxx` → 1.1）。
2. 检查顶层编号连续（1..N，允许缺号则报错并给行号）。
3. 扫描正文所有 `§x` / `§x.y` 引用，解析不到即报错（行号 + 原文片段）。
4. 提取所有 json 代码块，逐个 `JSON.parse`，失败报行号。
5. 若 §6 正文列出了 report.json 字段清单，检查 json 示例是否包含全部字段；缺哪个报哪个。
6. 退出码：0 = 全通过；1 = 有错误（每条错误一行，带行号）。
7. 不得写死章节号或字段名——必须从文档里解析，改一版契约要能直接跑。

## 契约验证项（必须做，结果写进 report.json 的 notes）

### A. 超时探针
执行一条命令，`timeoutMs` 设为 **25000**：
```
node -e "const t=Date.now(); setTimeout(()=>{console.log('finished', Date.now()-t)}, 60000)"
```
- 记录：实际耗时（秒）、是否被中断、退出码
- 写入 `_evidence/timeout-probe.log`，一行 JSON：`{"timeoutMs":25000,"elapsed_s":N,"killed":true/false,"exit_code":N}`
- 如果 25 秒未被中断而是跑满 60 秒，`killed: false` —— 这是有效结论，不要重试掩盖

### B. 自检计数
`report.json.selfcheck_runs` 按类填：`{"selftest":1,"url":0,"visual":0}`（本任务无 URL/视觉项）

## 禁止
- 不装任何 npm 包；不建二进制；不跑基准循环
- 不修改 `COLLAB-v2.0.md` 或任何既有文件（只读）
- 不写任务目录以外的文件

## 预算
15 分钟墙钟；超出则 stop-and-report。
