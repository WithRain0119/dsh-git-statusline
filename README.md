# dsh-git-statusline

DSH Web 的紧凑 Git 状态插件，参考 ccstatusline-zh 的 Git widgets。显示位置可在设置页切换：侧边栏底部（默认）、会话顶部标题后方、对话框上方、对话框下方，或关闭。

要求 DSH `>=0.2.0-rc.1 <0.3.0`（本仓库 0.2.1 起）。0.1.x 请用 `v0.2.0` 或更早的 tag。

显示格式：

```text
main (+16,-2) ↑2 ↓1
```

- `(+16,-2)`：已暂存和未暂存文本改动的新增/删除行数。
- `↑2`：当前分支相对 upstream 待推送的提交数。
- `↓1`：当前分支相对 upstream 待拉取的提交数。
- `✓`：工作区干净，且相对 upstream 没有领先或落后。
- 无 upstream 时不会显示错误的“已推送”结论，悬停提示会说明无法判断。

## 显示位置

设置 → **Git 状态栏** → 显示位置。选择保存在浏览器 `localStorage`（键 `dsh-git-statusline:config`），改完立即生效，无需重启 DSH。

| 位置 | DSH 插槽 | 形态 |
| --- | --- | --- |
| 侧边栏底部（默认） | `sidebar.footer.action` | 侧边栏一行；收起成 56px 轨道时退化为 `↑` / `↓` / `±` / `✓` 单字符 |
| 会话顶部标题后方 | `conversation.session.header.actions` | 标题栏内的小 chip |
| 对话框上方 | `conversation.input.dock` | 输入框上方的 chip，独占一行 |
| 对话框下方 | `conversation.composer.dock` | 输入框下方状态行内的纯文本 |
| 不显示 | — | 完全不注册插槽，也不发请求 |

> “对话框下方”与 DSH 内置的用量统计、上下文占比同处一行且宽度预算很紧：实测带边框 chip 会把那一行挤到省略号，所以该位置改用无边框纯文本。若在意那一行，建议选“会话顶部标题后方”。

## 兼容性

DSH 启动时会校验插件 `package.json` 中所有 `@deepseek-ai/dsh*` peer 的版本范围是否覆盖当前运行时版本；不覆盖就打印 `skipping profile bundle` 并**静默跳过整个插件**，界面上不会有任何报错。

因此本插件的 peer 范围跟随 DSH 的次版本线：

| DSH 版本线 | 可用插件版本 |
| --- | --- |
| `>=0.2.0-rc.1 <0.3.0` | 0.2.1 起 |
| `0.1.x` | 0.2.0（注入的是已删除的 `@deepseek-ai/dsh-client-runtime`，在 0.2.x 上会被跳过） |

`npm test` 里有一组兼容性回归测试，会直接调用 DSH 自己的 `evaluatePluginCompatibility`（来自 `@deepseek-ai/dsh-app-boot`）复现这道闸门，并检查 `dsh.client.inject` 的每一项在已安装的 DSH 里都是真实可注入的 Web 客户端模块——避免再次出现「升级 DSH 后插件凭空消失」。找不到 DSH 安装时该组测试自动跳过（可用 `DSH_INSTALL_DIR` 指定）。

## 安装

① ② ③ 在 DSH 0.2.0-rc.1 + pnpm 11.21.0 上实测通过，③ 安装的是同一份预构建代码。插件是纯 JavaScript，`lib/` 已随仓库提交，**不需要任何构建步骤，也不会触发 pnpm 的构建授权提示**。

**① 从 GitHub 直接安装（推荐）**

```bash
dsh plugin --profile web add github:pinzza/dsh-git-statusline
```

**② 从本地检出安装**（在包含本目录的父目录执行；`dsh plugin` 会把相对路径锚定到调用目录）

```bash
dsh plugin --profile web add ./dsh-git-statusline
```

**③ 从 Release 的预构建 tarball 安装**（与 ① 等价，离线也可用）

```bash
curl -L -o dsh-git-statusline.tgz \
  https://github.com/pinzza/dsh-git-statusline/releases/latest/download/dsh-git-statusline.tgz
dsh plugin --profile web add ./dsh-git-statusline.tgz
```

> 该资产名不含版本号，`releases/latest/download/` 会随最新 Release 走，因此不需要在每次发版后改这个链接。想固定版本就用钉住 tag 的形式：`.../releases/download/v0.2.1/dsh-git-statusline.tgz`。

安装后重启 `dsh web`。如果 Web 服务由其他进程管理，重启该进程并刷新 `http://127.0.0.1:3080`。

验证插件层已加载：

```bash
dsh --profile web --dump-config | grep -A2 dsh-git-statusline
```

应能看到 `# == dsh-git-statusline` 这一层。若同时出现 `dsh: skipping profile bundle "dsh-git-statusline"`，说明 peer 版本范围不覆盖当前 DSH —— 升级插件或按上面的「兼容性」一节处理。

卸载：

```bash
dsh plugin --profile web remove dsh-git-statusline
```

## 验证

```bash
node --test        # 在本目录执行：8 个测试（4 个 Git 解析 + 4 个兼容性回归）
```

插件每 5 秒固定轮询一次，并在窗口重新获得焦点时立即刷新。同一时刻最多一个进行中的请求（客户端并发去重）。Git 命令均为只读操作，设置 `GIT_OPTIONAL_LOCKS=0`。

> **不显示时的排查顺序**：⓪ **插件层是否被跳过**——跑一次 `dsh --profile web --dump-config | grep -A2 dsh-git-statusline`，看不到 `# == dsh-git-statusline` 或同时出现 `skipping profile bundle` 就是 peer 版本不兼容（升级 DSH 后最常见的静默失效原因，见「兼容性」）；① 当前会话的工作目录不是 git 仓库（`isRepo=false`，插件按设计隐藏）；② 插槽位置选了「不显示」。若浏览器 Network 里根本没有 `POST /git-statusline/status`，基本可判定为 ⓪ 或 ②；有请求却无渲染则是 ①。当前会话来源：`0.2.x` 的 `sessions.list` 快照不带 `current`，当前会话由 `uiSession` 服务的 `current` 绑定源暴露（值形如 `{ key: sessionId }`），`lib/client.js` 优先读该绑定源，`list.current` 仅作防御性兜底。

> **为什么 5 秒轮询不烧 CPU**：服务端每次请求先做 mtime 预检（stat `.git/HEAD` 与 `.git/index`，毫秒级）——工作区未变直接命中缓存，**连 git 进程都不拉起**；只有 index/HEAD 变化（如 git add/commit）才真正执行 git。因此轮询本身成本几乎为零，无需事件驱动或长间隔。

> **性能保护**（机制借鉴自 ccstatusline 的 git 缓存设计）：Windows 挂载路径（WSL 的 `/mnt/*`，即 9P/v9fs/drvfs）上 git 遍历工作树极慢（分钟级），服务端针对慢速文件系统：
> - **mtime 预检**：每次请求先 stat `.git/HEAD` 与 `.git/index`（两次 stat，毫秒级）——工作区未变则直接命中缓存，**连 git 进程都不拉起**；只有 index/HEAD 变化（如 git add/commit）才真正执行 git；
> - **超时 90 秒**（快路径 5 秒），保证查询能跑完而非被反复杀掉；
> - **完整行数统计**：`diff --numstat` 只比较已跟踪文件，实测秒级（远快于 status 的全工作树扫描），因此慢速路径同样返回 `(+x,-y)`；
> - **结果缓存**（慢速 60s / 快速 15s，从完成时刻起算；失败/超时只缓存 10s）+ **in-flight 去重**——同目录并发请求共享一次 git 执行。
>
> 因此 Windows 目录下的仓库可以正常显示完整 Git 状态（分支、`(+x,-y)` 行数、未跟踪数、前后提交数），且**工作区未变化时零 git 进程开销**。代价是工作区真实变化时首次查询较慢（数秒到一分钟级）。如需更快刷新，仍建议把仓库放在 Linux 原生文件系统（ext4，如 `/home`）路径下。
