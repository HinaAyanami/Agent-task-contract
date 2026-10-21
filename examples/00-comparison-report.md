# dsh × Hermes 同题对比报告

测试日期：2026-10-20　｜　dsh = DeepSeek Harness `0.2.1-rc.2`（bridge `0.11.4`，模型 `deepseek-flash`）
　｜　Hermes = 本机桌面端（`deepseek-flash`）

---

## 0. 结论先行

| 维度 | 谁更好 | 一句话 |
| --- | --- | --- |
| 单点完成度 | **dsh** | P1 的边界用例、视觉自检、P3 的来源密度都更狠 |
| 自证能力 | **dsh** | 会自己写 223 行 CDP 脚本截图、自己构建 SEA 跑冷启动基准 |
| 速度与节奏 | **Hermes** | 24 分钟交完三个项目；dsh 38 分钟里 25 分钟在等卡死的调用 |
| 稳定性 | **Hermes** | dsh 两次工具调用永久挂起，`timeoutMs` 没生效 |
| 并发 | **Hermes** | dsh 的"并行队列"实际串行，且三个任务共用同一个会话上下文 |
| 检索质量 | **dsh** | 19 条一手来源（api.github.com / unpkg / registry）全可访问，版本号全对 |

**选型建议**：要"一次做深、可以等"的单任务，丢给 dsh；要"多线并进、按时交付"，用 Hermes。
最实际的用法是混合：Hermes 拆任务 + 验收，dsh 做需要反复自证的单点深挖。

---

## 1. 测试方法

三个项目，同一份 brief（两侧 `BRIEF.md` 的 md5 完全一致），同一套验收脚本 `_tools/verify.py`：

| 项目 | 考什么 | 验收方式 |
| --- | --- | --- |
| P1 SortLab | 单文件前端、动画、可测试架构 | `node selftest.js` 退出码 + 静态检查 + 两档视口截图 |
| P2 csvstat | 零依赖 CLI、RFC4180、退出码语义 | `node test.js` + 用**同一份** 100 行脏 CSV 交叉实测 |
| P3 简报 | 检索、引用、不编造 | `sources.json` 解析 + URL 逐条可访问性 + 抽查 claim |

公平性控制：brief 里给了同一行 Node 绝对路径、同一句"本机没有 bash"；给 dsh 的任务文本带派发方声明，
不含"这是比赛/要赢"之类提示；我的三份在 dsh 跑的同时独立完成。

---

## 2. dsh 功能面实测（25 个工具）

**正常**：`echo` `status_get` `config_get` `harness_list_tools` `preset_list` `policy_get` `approval_list`
`session_list` `session_log` `session_search` `session_stats` `rename_session` `attach_session`
`task_list` `task_result` `task_cancel` `agent_run` `task_inbox` `fs_list`

**有问题**：
`fs_read` / `fs_stat` —— 对 `<workspace>\...\README.md` 报 `path outside allowed roots`，
而同一目录 `fs_list` 正常返回 5 个文件；会话已 `attach_session` 仍拒绝。白名单不一致（bridge bug）。

### 过程中撞到的 6 个坑

1. **cwd 只能是 workspaceRoots 的精确根**。传 `<workspace>\dsh\p1-sortlab` 直接
   `error: cwd not allowed (outside workspaceRoots)`；必须传 `<workspace>`，再在任务里给绝对输出路径。
2. **"并行队列"是假的**。三个 `task_inbox` 同时推入 → `queueActive: 3`、`activeSessionsCount: 1`，实际串行。
3. **三个任务共用一个会话**。`session_stats` 显示同一 session 累计 101 步 / 10.1 分钟 LLM / 137k 输出 token；
   P3 能看到 P1/P2 的上下文。任务间不隔离。
4. **工具调用会永久挂起**。P1 卡在自己写的 Edge headless 脚本（`timeoutMs: 180000` 未生效，12 分钟无事件）；
   P3 卡在自己构建的 `sea.exe` 基准上（16 分钟无事件）。两次都是 `task_cancel` 才解开。
5. **沙箱里没有可用的 shell 工具链**。msys2 `bash` 启动即崩（`NtCreateDirectoryObject ... 0xC0000022`），
   没有系统 bash、没有 python，只能 pwsh + 绝对路径 node。dsh 自己在 leftovers 里正确报告了这一点。
6. **它的"认真"就是卡死来源**。为了验证视觉自己写 CDP 截图，为了验证体积自己 `--build-sea` 跑 25 次基准。
   质量因此更高，但也因此更容易挂在长命令上。

---

## 3. 项目逐项对比

### P1 SortLab

| | dsh | Hermes |
| --- | --- | --- |
| index.html | 17,828 B / 575 行 | 14,775 B / 578 行 |
| selftest | 354 断言 / 28 用例 / **7 组输入**（多一组"负数+重复"） | 144 断言 / 24 用例 / 6 组输入 |
| 测试结果 | `RESULT: PASS`，退出码 0 | `144 passed, 0 failed`，退出码 0 |
| 外链 | 0 | 0 |
| 交互自证 | **Edge headless + CDP 实跑，1280×800 与 800×600 三张截图** | 仅静态截图（两档），未跑交互 |
| 界面信息 | 6 张统计卡（含状态/当前算法）+ 图例 + 文字状态 | 4 张统计卡，无图例、无坐标 |
| 视觉 | 信息更全，底部说明文字对比度偏低 | 更克制干净，但主按钮强调不足、缺图例 |

补充：dsh 的 P1 在完成自检后卡在第二轮 CDP 复检，被我 `task_cancel`；三个交付文件 + 3 张截图都已落盘，
`selftest.js` 现场跑仍是 PASS，所以按完整产物计入对比。

结论：**dsh 胜**。多一组边界输入、多一层真实交互验证，界面信息密度也更高。
我的代码略短，但这不是优点——省下的是图例和状态文字。

### P2 csvstat

| | dsh | Hermes |
| --- | --- | --- |
| 代码 | 13,524 B，单文件 | 9,602 B |
| 用例 | 23 个（含"全空列"、"`--input` 缺值"） | 17 个用例 / 39 条断言 |
| 自测 | 23/23 PASS | 39/39 PASS |
| 交叉实测（我的 100 行脏 CSV） | 100 行、score missing 6、mean 69.180851 | 100 行、missing 6、mean 69.18 |
| 极端输入（LF-only、字段内换行、`""`、无尾换行） | 3 行，正确 | 3 行，正确 |
| 空输入 | 0 行报告 + 退出码 0 | 报错 + 退出码 2 |
| 结构 | `main()` 无 `require.main` 保护，`require` 即执行 | 有保护并导出函数 |

结论：**基本打平**。dsh 用例面更广（多覆盖全空列），我的断言更密、代码少 30%。
空输入行为两者都说得通，brief 没规定，不算失分。dsh 缺 `require.main` 保护是真实缺陷。

### P3 简报

| | dsh | Hermes |
| --- | --- | --- |
| 字数 | 898 字 | 916 字（修正后） |
| 来源 | **19 条**，全部 200 可访问 | 6 条，全部 200 可访问 |
| 来源类型 | nodejs.org 官方文档分节 + **api.github.com**（archived/pushed_at/PR/release）+ unpkg + registry.npmjs.org + Apple 公证文档 | nodejs.org + GitHub 页面 + npm registry |
| 硬证据 | `archived: true`、`pushed_at 2024-01-03`、`PR #1323 merged: false`、pkg 5.8.1 `2023-03-08`、nexe latest `5.0.0-beta.4` | 同左，但 nexe 版本我写错 |
| 错误 | 一处日期口径（nexe v3.3.3 release 实为 2017-08-30，它写 2020-06-22，取自 asset 时间） | **一处事实错误**：我采信 npm 页面摘要，把 nexe latest 写成 `4.0.0-rc.6`，实际 `dist-tags.latest = 5.0.0-beta.4` |

结论：**dsh 明显更好**。它优先查 API 而不是网页正文，所以 `archived`、`pushed_at`、PR 是否合并这类
硬字段全对；我的来源少，还在 nexe 版本上翻车（已修正）。这是本次对比里我输得最清楚的一项。

---

## 4. 总评

| 维度（1–5） | dsh | Hermes |
| --- | --- | --- |
| 事实正确性 | 5 | 4 |
| 需求完整度 | 5 | 4 |
| 自证深度 | 5 | 3 |
| 速度 | 2 | 5 |
| 稳定性 | 2 | 5 |
| 代码可维护性 | 4 | 4 |
| **合计** | **23** | **25** |

分差主要在"能不能按时、稳定地交付"，不在"做得好不好"。
如果只看产物质量，dsh 略强；如果看一整天的工作流，Hermes 更省心。

---

## 5. 下次用 dsh 的避坑清单

1. `cwd` 只传 `<workspace>`，输出路径写在任务正文里，用绝对路径。
2. 任务里明确给 Node 绝对路径；不要指望 bash / python。
3. 禁止它跑"可能不退出"的命令（headless 浏览器、自建二进制、基准循环），或在任务里写死"不要构建/不要跑基准"。
4. 用 `task_inbox` + `task_list` 轮询；超过 5 分钟没文件变化就查 `session_log` 的最后事件时间，
   卡住直接 `task_cancel`（会话保留，可续接）。
5. 不要用 `fs_read` / `fs_stat` 复核产物，用 `fs_list` 或直接读磁盘。
6. 每次只派一个任务。它的队列是串行的，并发派发只会互相排队。

---

## 6. 产物索引

```
<workspace>\
├─ dsh\p1-sortlab\      index.html / selftest.js / README.md / _shot-1280-*.png
├─ dsh\p2-csvstat\      csvstat.js / test.js / README.md / fixtures\sample100.csv
├─ dsh\p3-brief\        BRIEF.md / sources.json（19 条）
├─ hermes\p1-sortlab\   index.html / selftest.js / README.md / _shot-{1280,800}.png
├─ hermes\p2-csvstat\   csvstat.js / test.js / README.md / fixtures\dirty.csv
├─ hermes\p3-brief\     BRIEF.md / sources.json（6 条）
├─ _tools\              verify.py / dsh.py / probe_extra.py / verify_report.json
└─ REPORT.md            本文件
```

自动验收原始数据：`_tools/verify_report.json`。
