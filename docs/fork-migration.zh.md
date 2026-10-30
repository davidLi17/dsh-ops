# 个人分支：迁移旧八行配置

[English](fork-migration.en.md)

统一插件页**不会自动转移已退役行中的设置**。激活升级前，请备份旧 profile patch，并生成供审核的新副本：

```sh
npm ci --ignore-scripts
npm run build
node bin/migrate-profile.mjs /path/to/old-patch.yml /path/to/NEW-review-patch.json
```

在本仓库目录运行。输入必须是明确指定的 JSON/YAML **patch 数组**，不能使用已合成配置的导出结果。
JSON 输入只需已构建的包；YAML 输入使用仓库现有的 `yaml` 开发依赖。输出始终为 JSON（也是合法 YAML）。
脚本不会查找 DSH home、联网、重载 DSH 或安装配置。输入输出同路径、输出已存在（包括符号链接）均拒绝；
新文件在支持的文件系统上使用仅所有者可读写的权限。保留备份，检查差异，再按正常配置编辑流程自行应用
审核后的副本。重启或重载后，先检查统一页开关，再开始会话。注释与排版不会保留，但无关 patch 数据和顺序保留。

## 转移范围

- 八个固定 ID：`dsh-ops-mode-minimal`、`-mode-standard`、`-mode-ptc`、`-mode-cordis`、
  `-discovery`、`-compat`、`-panel`、`-tui`；如有 `name`，必须与 ID 匹配。
- 普通行覆盖和简单 `insert` 数组。结果合为一个 `dsh-ops` 覆盖，无关行保留。
  输出用于新的单行 bundle，不能应用到旧 bundle。
- 支持且通过校验的配置、worker 路径、限制和工具列表；行级 `disabled` 转为分区 `enabled`。
  部分覆盖未写 `disabled` 时，遵循旧 bundle 默认值（panel/TUI/compat 关闭）；
  `insert` 中的新行按宿主通常的默认启用语义处理。
- 保留 `publishBashTool`，同时复制为 `bash`，确保已保存的 false 不会重新打开 Bash。
- Discovery 的旧 `config.enabled` 与行开关合并，任一关闭即关闭。
- Panel 的 `capture: false` 保持 false，即使 panel 行本身启用也不会开始采集。
- 已启用的兼容开关转为 `global.hideOfficialTools: false` 和 `global.hidePwsh: false`。

## 明确拒绝的情况

重复旧行、已有统一行、ID/name 不匹配、条件式 `disabled`、涉及 OPS 的嵌套/定位/删除操作、未知键，
以及更老的 `shell`/`file`/`ptc`/`background`/`hide-official` 行均拒绝并且不写输出。
仅供旧版使用的 FastCtx 键、`shellPolicy`、`deniedHostTools`、`configUpdateVersion` 也需要人工核对，
不能静默丢弃。错误会指出 patch 位置或键。请在**副本**中处理后重试或人工迁移，不要修改唯一原件。
不常见的无关数据若引用 OPS 标识，也可能触发保守拒绝。YAML 重复键和别名会被拒绝。

该工具仅转移配置，不保证跨版本运行行为完全一致。它使用统一配置校验器，但不加载宿主、不授予权限、
不启动采集、不执行工具。测试命令：`node test/run.mjs fork-profile-migration`。
