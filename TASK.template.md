# Task: &lt;short title&gt;

> 任务书模板，由 `SPEC.md` §1 提炼。**七项必须齐全**；缺项时执行方只做可静态核验的部分，
> 并在 leftovers 里写明缺哪项，不自造标准。
>
> `lite` 模式只需填 1、2、6 三项（预算 ≤15 分钟、单文件、无自检脚本）。

---

## 1. 产物位置

```
<绝对路径>
```

## 2. 验收命令与期望结果

```sh
<command>
```

- 期望退出码：`0`
- 期望输出：最后一行匹配 `<pattern>`（例如 `checked N sections, M refs, 0 errors`）

## 3. 预算

| 项 | 值 |
| --- | --- |
| 档位 | `lite` / `standard` / `deep` |
| 墙钟分钟 | `<n>`（lite 15 / standard 30 / deep 60） |
| 派发时间戳 | `<ISO 8601>` |

到预算 3/4 停止打磨，交「可用版本 + 未完成清单」。

## 4. 禁止项

- [ ] 不安装任何包
- [ ] 不构建二进制
- [ ] 不跑基准循环
- [ ] 不写本任务目录以外的文件

## 5. 允许的工具面

- shell：`<pwsh / bash / …>`
- 运行时：`<node path>`、`<python path>`（写明绝对路径）
- 网络：允许 / 不允许

## 6. 交付物清单

- [ ] `<file 1>`
- [ ] `<file 2>`
- [ ] `_evidence/test.log`（原始 stdout + stderr，UTF-8 无 BOM）
- [ ] `_evidence/report.json`（12 字段，见 `REPORT.schema.json`）

## 7. long-run 配额

| 项 | 值 |
| --- | --- |
| 允许条数 | `<n>` |
| 单条上限 | `<n>` 分钟 |
| 要求 | 每条必须带 `timeoutMs`；到点终止进程树 |

---

## 上下文与自检

```
context: isolated
```

- 本任务与既有会话上下文无关，不得引用历史任务内容。
- 同一类自检最多 2 次（第 1 次失败可修，第 2 次仍失败即停）。
- 若改过测试，`report.json.tests_modified` 必须为 `true` 并附改前/改后 diff 与理由。
- 允许 `stop-and-report`，触发条件：已试 ≥2 条路径都失败 / 预算用掉 3/4 / 环境缺能力。
