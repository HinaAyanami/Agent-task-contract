# 2026 年 Node.js 单文件打包：Node SEA / pkg / nexe

## 一、维护状态

| 方案 | 最后发布 | 状态 | Node 版本 | 平台 |
| --- | --- | --- | --- | --- |
| Node SEA | 随 Node 发版，当前 v26.12.0（2026-10-14） | 官方 Stability 1.1，活跃开发；v25.5.0 起内置 --build-sea | 由所用 node 决定 | Windows、macOS 仅 arm64、Linux 除 Alpine 与 s390x [S1][S2][S3][S8] |
| pkg | 5.8.1（2023-03-08） | 仓库已归档，2024-01-03 后无推送 | 目标 node8–node16 与 latest | alpine/linux/linuxstatic/win/macos，x64/arm64 [S9][S10][S11] |
| nexe | npm latest 为 5.0.0-beta.4（预发布）；Releases 停在 v3.3.3（2020-06-22） | 未归档，2026-03-05 仍有推送 | 由 -t 指定或 --build 自建 | 可交叉编译 win/macos/linux [S14][S15][S16][S17] |

SEA 的用法已从「--experimental-sea-config 生成 blob + postject 注入」演进为一条 --build-sea 命令[S2]；它从 Node 19 就开始实验，到 v25.5.0 才有开箱命令[S1][S2]。

三者的根本差别是维护主体：SEA 由 Node 官方随版本发布，pkg 与 nexe 都是第三方工具，前者已归档、后者长期预发布，选型时维护成本往往比功能更重要[S9][S16]。

## 二、资源、ESM 与签名

- SEA：用配置里的 assets 打包文件，运行时 sea.getAsset 读取；v26.9.0 起 useVfs 提供只读虚拟文件系统，可按 __dirname 相对路径用 fs 访问[S4]。资源多时还可用 vfsArchive 直接内嵌 ZIP，压缩后能明显减小产物[S4]。ESM 入口设 mainFormat: module，但 import.meta.resolve 不可用，且不能与 useSnapshot 同用[S7]。
- pkg：package.json 的 pkg.assets／pkg.scripts 用 glob 收集，运行时位于 /snapshot/ 快照文件系统[S11]；官方无 ESM 支持，相关 PR #1323 未被合并[S12]。
- nexe：用 -r 通配符嵌入资源，应用内用 fs 读取[S17]；其 ESM 支持未找到公开来源。
- 签名：注入或打包后原签名失效，必须重签；macOS 用 codesign --sign -，Windows 用 signtool[S6]；面向终端用户分发时 macOS 还需公证[S19]。

## 三、体积与冷启动

- SEA 产物等于 node 可执行文件加注入的 blob，绝对值随所用 Node 版本与平台变化，官方未给数值[S2]；启动时只检查并执行注入脚本，没有解包到磁盘的步骤[S1]。它还可开启 useCodeCache 或 useSnapshot 改善启动，但跨平台生成时必须关闭二者，否则产物可能启动即崩[S2]。
- pkg 的基础二进制取自 pkg-fetch，单个在 20–50 MB 量级，应用快照另计；--compress 最多可把内嵌文件系统缩小 60%[S11][S13]。该压缩只作用于内嵌文件系统，不改变外层基础二进制的大小[S11]。
- nexe 的 v3.3.3 Release 附带大量预编译基础二进制，单个约 37–43 MB[S15]。
- 冷启动：pkg 首次运行会把原生模块落到临时文件、下次复用，压缩也会影响启动[S11]；nexe 的冷启动对比未找到公开来源。

## 四、硬限制

- SEA：注入脚本默认只能加载内建模块，业务依赖必须先打成单文件；__filename 等于 process.execPath，__dirname 为其所在目录；import() 只能加载内建模块；原生插件要作为 asset 写入临时文件再 process.dlopen[S5][S6]。生成 blob 的 Node 版本必须与接收注入的二进制一致[S2]。
- pkg：依赖静态分析 require，动态 require 与运行期拼接的路径必须显式写进 scripts／assets；__dirname 变为 /snapshot/...；linuxstatic 不能加载原生绑定[S11]。macos-arm64 仍是实验性目标，必须签名才能运行[S11]。
- nexe：原生模块不能嵌入，必须与二进制一起分发[S17]。

## 五、选型建议

- Windows 桌面工具：选 SEA。官方维护、行为与 node 一致、无需第三方工具链；代价是产物与 node 同量级，且要 Node 达到 v25.5.0 才有 --build-sea[S2][S8]。
- 公开发布 CLI：选 SEA，并自建多平台矩阵；macOS 仅 arm64 是硬约束[S3]。需要 node16 以下或源码级定制时改用 nexe，但须接受其长期预发布状态[S16]；pkg 已归档，不建议新项目采用[S9]。
- 依赖原生模块的服务：优先容器或 node 加 node_modules 直接发布；必须单文件时，SEA 的临时落盘方案可行但脆弱[S6]，pkg 虽原生支持 .node 却已停更[S9][S11]，不宜押注。
- 对照项：Bun 的 --compile 会把 Bun 运行时一起打进单文件并支持交叉编译[S18]，但运行时不是 Node，只能作为备选。

结论：2026 年新项目默认选 SEA，pkg 只用于存量 node16 及以下项目，nexe 留给需要自建运行时的场景[S2][S9][S16]。

## 参考来源

见同目录 sources.json（S1–S19）。
