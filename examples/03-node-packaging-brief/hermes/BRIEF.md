# 2026 年 Node.js 单文件打包路线对比：SEA / pkg / nexe

结论先行：**新项目直接用 Node 官方 SEA；`pkg` 只用于维护旧流水线；`nexe` 只在需要它的交叉编译或旧 Node 版本时才考虑。**

## 一、三条路线的现状

**Node SEA（官方）** 自 v19.7.0 / v18.16.0 起提供，目前仍标注 `Stability: 1.1 - Active development`[S1]。
早期只能跑单个 CommonJS 脚本；新版文档已写明支持 CommonJS 或 ESM 入口[S1]。
v25.5.0 起内置 `--build-sea`，不再必须外挂 `postject`[S1]；v26.9.0 起可以用 `useVfs` 把资源暴露成只读虚拟文件系统[S1]。
它不是"归档项目"，而是跟着 Node 主版本走的特性，版本兼容性天然与运行时一致。

**`pkg`** 的 README 第一行就是弃用声明：`5.8.1` 是最后一个版本，仓库已于 2024-01-13 归档、只读[S2]。
`pkg-fetch` 的发布记录显示它预编译到 Node 18.5.0 为止[S3]，也就是说 Node 20 以后的运行时基本没有官方预编译包。
它仍然能跑，但等于把一个停止维护的打包器和一份旧运行时一起冻结。

**`nexe`** 没有归档：npm 上 `latest` 指向 `5.0.0-beta.4`（发布于 2025-03-08），`no-snapshot` 标签停在 `4.0.0-rc.7`[S4]；
仓库在 2026-03 还有依赖维护提交，2025-03 合入了 Node 22 的参数顺序修复[S5]。
它的问题不是"死了"，而是"长期停在 beta"——版本号本身就在提示 API 还会动。

## 二、资源、ESM、签名

| | SEA | pkg | nexe |
| --- | --- | --- | --- |
| 资源注入 | `assets` 映射，`sea.getAsset()` 读取；v26.9+ 可 `useVfs` 挂成只读 FS[S1] | `assets` / `scripts` 字段打进快照 | `-r` glob 嵌入资源[S5] |
| ESM | 文档明确支持 CJS 或 ESM 入口[S1] | 以 CJS 为主，ESM 需先 bundle 成 CJS | 依赖打包器先把 ESM 转 CJS |
| 签名 | macOS 先 `codesign --remove-signature`，注入后重签；Windows 可选 `signtool`[S1] | 注入后同样要重签，无内置步骤 | 同样需要自行重签 |
| 交叉编译 | 不支持：目标平台二进制必须与构建机一致[S1] | 支持按 target 拉取预编译二进制 | 支持 `-t platform-arch-version` |

SEA 的平台支持有明确边界：CI 只覆盖 Windows、macOS arm64、非 Alpine 的 Linux（x64 之外的 s390x 不测）[S1]。
如果发布目标是 Alpine 或 macOS x64，SEA 目前不在保证范围内。

## 三、体积与硬限制

SEA 的产物就是"Node 二进制 + 注入的 blob"，所以体积下限等于 Node 本身。本机 `node.exe`（v24.20.0，Windows x64）实测 89 MiB[S6]；
一个空项目打出来也在这个量级，业务代码只占几百 KB。好处是冷启动与 `node app.js` 基本一致，没有解压步骤。

`pkg` 会把快照附加到裁剪过的 Node 二进制上，体积通常小于官方 Node，但代价是运行时版本被锁死[S3]。
`nexe` 同理：产物大小取决于它拉到的目标 Node 版本，预编译包缺失时要本地编译 Node，构建时间会明显上升[S4]。

三者共同的硬限制：

- **原生模块（`.node`）**不能直接 `require`。SEA 的做法是把 `.node` 当 asset 打进包，运行时先写到临时文件再加载[S1]；
  `useVfs` 是只读的，写操作会直接 `EROFS`[S1]。
- **动态 `require`/`import`**：路径在运行时拼出来的模块，打包器静态分析不到，必须显式声明为 asset 或 external。
- **`__dirname`** 在 SEA 里指向可执行文件所在目录的虚拟位置，不能用它反推源码目录[S1]。

## 四、选型建议

1. **Windows 桌面工具**（内网分发、双击即用）：选 **SEA**。单文件、无安装器、和目标机 Node 版本无关；
   用 `signtool` 签一遍可以少一堆 SmartScreen 提示[S1]。如果安装包已经有 NSIS/MSI 外壳，用 `pkg` 也能凑合，但没必要为它冻结运行时。
2. **公开发布的 CLI**（npm + 二进制双通道）：选 **SEA**，并按平台分别构建。它不支持交叉编译，
   所以 CI 需要 Windows / macOS / Linux 三个 runner 各打一份[S1]。要在 Alpine 上跑就退回 `nexe` 或直接发 npm 包。
3. **依赖原生模块的服务**：优先 **不发单文件**——容器 + `npm ci` 最稳。必须单文件时选 `nexe` 或 `pkg`，
   因为 SEA 需要把每个 `.node` 手动列进 assets 并在运行时落盘[S1]，模块一多就是维护负担。

`pkg` 的唯一合理场景是"已有流水线、能跑就不动"。新项目从它起步，第一天就欠了一笔技术债[S2]。

## 引用

- [S1] Node.js — Single executable applications（v26.12.0 文档）
- [S2] vercel/pkg README（弃用与归档声明）
- [S3] pkg releases（pkg-fetch 预编译版本）
- [S4] npm nexe 版本页
- [S5] nexe 仓库提交记录
