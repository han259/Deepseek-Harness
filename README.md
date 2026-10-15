# Task Lens

一个**零依赖**的 Node.js 命令行工具：读取 `data/tasks.json` 中的任务，按状态汇总，或只查看某个状态下的任务。

## 特性

- 纯 ES Modules（`"type": "module"`），不使用 CommonJS
- **零第三方依赖**，不需要 `npm install`
- 从 `data/tasks.json` 读取任务，并在读取时校验数据结构
- 默认输出 `todo` / `doing` / `done` 各状态的数量与任务总数
- 支持 `--status <状态>`，只显示指定状态的任务
- 使用 Node.js 内置 `node:test` 模块编写测试（同样零依赖）
- 出错时给出可读的错误信息，并用退出码区分成功与失败，便于脚本化调用

## 环境要求

- Node.js >= 18（内置 `node:test` 需要 18 及以上；开发验证使用 Node.js 24）
- npm 可选：仅用于执行 `npm start` / `npm test` 这类脚本，也可以直接用 `node` 命令运行

## 安装

本项目不依赖任何第三方包，**不需要安装步骤**：

```bash
# 方式一：克隆仓库
git clone <仓库地址> task-lens
cd task-lens

# 方式二：如果目录已经存在，直接进入即可
cd task-lens

node --version   # 确认输出 >= v18
```

> 无需执行 `npm install`。即使执行了，也不会下载任何依赖（`package.json` 中没有 `dependencies` / `devDependencies`）。
> 不要运行 `npm install <包名>`，本项目刻意保持零依赖。

## 目录结构

```
task-lens/
├── package.json          # ESM 配置与 start / test 脚本
├── README.md
├── data/
│   └── tasks.json        # 任务数据（title + status）
├── src/
│   ├── tasks.js          # 数据读取、校验、统计、筛选、渲染、参数解析
│   └── cli.js            # 命令行入口，负责输出与退出码
└── test/
    ├── tasks.test.js     # node:test 测试用例
    └── fixtures/         # 测试用的数据文件（正常 / 非法状态 / 坏 JSON）
```

## 运行

默认输出各状态的任务数量和总数：

```bash
npm start
# 等价于：
node src/cli.js
```

输出示例：

```
Task Lens - task overview
----------------------------------------
todo  3
doing 2
done  2
----------------------------------------
total 7
```

只显示某个状态的任务（`todo`、`doing`、`done` 之一）：

```bash
npm start -- --status doing
# 等价于：
node src/cli.js --status doing
```

输出示例：

```
Task Lens - status: doing (2 of 7)
----------------------------------------
 1. Implement task loading
 2. Write the test suite
```

### 参数说明

| 参数 | 简写 | 说明 |
| --- | --- | --- |
| `--status <status>` | `-s` | 只显示该状态的任务，取值必须是 `todo`、`doing`、`done` |
| `--file <path>` | `-f` | 从其它 JSON 文件读取任务，默认 `data/tasks.json` |
| `--help` | `-h` | 显示帮助信息 |

支持的写法：`--status doing`、`--status=doing`、`-s doing`。

更多示例：

```bash
node src/cli.js --status=done            # 只看已完成任务
node src/cli.js -s todo                  # 只看待办任务
node src/cli.js --file ./my-tasks.json   # 指定数据文件
node src/cli.js --help                   # 查看帮助
```

### 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功（包括 `--status` 筛选结果为空、打印帮助） |
| `1` | 参数非法、数据文件不存在、JSON 格式错误或数据校验失败 |

## 数据格式

`data/tasks.json` 是一个 JSON 数组，每个任务包含 `title` 和 `status`：

```json
[
  { "title": "Draft the project brief", "status": "done" },
  { "title": "Implement task loading", "status": "doing" },
  { "title": "Publish the README", "status": "todo" }
]
```

约束：

- 根节点必须是数组
- `title`：非空字符串（读取时会自动去掉首尾空格）
- `status`：只能是 `todo`、`doing`、`done` 三者之一，大小写敏感

数据不符合约束时，程序会打印明确的错误（包含第几个任务、哪个字段有问题）并以退出码 `1` 结束，例如：

```bash
node src/cli.js --file ./bad.json
# task-lens: ./bad.json: task #2 has invalid status "blocked"; expected one of: todo, doing, done.
```

## 测试

测试使用 Node.js 内置的 `node:test` 与 `node:assert`，不需要安装 Jest、Mocha 等任何测试框架：

```bash
npm test
# 等价于：
node --test test/
```

预期结果：`pass 36`、`fail 0`。

如果运行环境限制了子进程创建（例如某些沙箱会拦截测试运行器 fork 出来的进程，报 `spawn EPERM`），可以改用同进程模式运行同一套测试：

```bash
npm run test:in-process
# 等价于：
node --test --test-isolation=none test/*.test.js
```

测试覆盖的内容：

- 状态白名单判断 `isStatus`
- 数据校验 `parseTasks`（缺字段、空标题、非法状态、根节点非数组）
- 统计与筛选 `countByStatus` / `summarize` / `filterByStatus`
- 输出渲染 `renderReport`（默认概览、按状态列表、空结果）
- 参数解析 `parseArgs`（各种写法、非法取值、未知参数）
- 数据加载 `loadTasks`（默认文件、指定文件、文件缺失、坏 JSON、非法状态）
- 命令行入口 `main`（退出码与 stdout / stderr 内容）

## 许可证

MIT
