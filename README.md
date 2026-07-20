<h1 align="center">BOSS Tools</h1>

<p align="center">
  在本机 Chrome 中筛选 BOSS 岗位、串行发起沟通，并用可见页面信号确认结果。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-blue" alt="Version 0.1.0" />
  <img src="https://img.shields.io/badge/platform-Chrome-lightgrey" alt="Chrome" />
  <img src="https://img.shields.io/badge/manifest-MV3-green" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/built%20with-WXT-7c3aed" alt="Built with WXT" />
</p>

<p align="center">
  <a href="https://github.com/Blake-YH/BOSS-Tools/releases/latest"><strong>下载最新版</strong></a>
  · <a href="#安装与加载">安装与加载</a>
  · <a href="#快速开始">快速开始</a>
  · <a href="#安全边界">安全边界</a>
  · <a href="#开发与构建">开发与构建</a>
</p>

## 这是什么

BOSS Tools 是一个本地运行的 Chrome Manifest V3 扩展。它在 BOSS 职位页面读取当前可见的岗位信息，按照城市、公司规模、包含词和排除词筛选岗位，再由用户主动开始串行预沟通。

扩展不会把一次点击直接视为成功。只有页面出现至少两个一致的可见信号后，本次沟通才会计入成功数量并写入本地历史。

| 你的目标         | BOSS Tools 的处理方式                                        |
| ---------------- | ------------------------------------------------------------ |
| 缩小岗位范围     | 按城市、公司规模和关键词筛选当前职位列表                     |
| 排除不合适的岗位 | 排除词同时检查职位信息与公司名称，并拥有更高优先级           |
| 控制单次沟通数量 | 每次运行可设置 `1-200` 的预沟通上限，达到上限后自动停止      |
| 避免重复沟通     | 成功记录保存在本机，后续扫描会跳过已经成功处理的岗位         |
| 随时掌握进度     | 侧边栏显示已沟通、已扫描、已匹配和历史成功数量               |
| 遇到异常及时停下 | 登录失效、验证码、额度限制、账号异常或未知弹窗出现时停止运行 |

## 核心能力

- 自定义城市、公司规模、包含词和排除词。
- 包含词匹配职位名称、技能标签和职位描述。
- 排除词额外匹配公司名称，且排除结果优先。
- 支持开始、暂停、恢复和停止。
- 自动识别“已向 BOSS 发送消息”弹窗，只点击该弹窗范围内的“继续沟通”。
- 在页面跳转期间保存检查点，并在可恢复场景中继续当前任务。
- 连续三次无法确认沟通结果时停止，避免继续执行不确定操作。
- 使用 `chrome.storage.local` 保存配置、运行状态、检查点和处理历史。
- 历史区域支持二次确认后清空全部记录或删除单条记录。

## 安装与加载

普通用户可以直接下载已经通过自动化检查的扩展压缩包：

- [下载最新版 BOSS-Tools-chrome.zip](https://github.com/Blake-YH/BOSS-Tools/releases/latest/download/BOSS-Tools-chrome.zip)
- [查看全部版本与更新说明](https://github.com/Blake-YH/BOSS-Tools/releases)
- [下载 SHA-256 校验文件](https://github.com/Blake-YH/BOSS-Tools/releases/latest/download/BOSS-Tools-chrome.zip.sha256)

下载完成后：

1. 将 `BOSS-Tools-chrome.zip` 解压到一个固定目录。
2. 打开 Chrome 的 `chrome://extensions`。
3. 开启右上角的“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择刚才解压的目录；该目录根部应能看到 `manifest.json`。

更新扩展时，下载并解压新版本覆盖原目录，再回到扩展管理页点击 BOSS Tools 的“重新加载”。

### 从源码构建

开发者请先安装 Git、Node.js 和 npm，然后执行：

```powershell
git clone https://github.com/Blake-YH/BOSS-Tools.git
cd BOSS-Tools
npm install
npm run build
```

构建成功后：

1. 打开 `chrome://extensions`。
2. 开启右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择仓库中的 `.output/chrome-mv3` 目录。

更新代码后重新运行 `npm run build`，再回到扩展管理页点击 BOSS Tools 的“重新加载”。

## 快速开始

1. 在当前 Chrome 中登录 BOSS。
2. 打开 BOSS 的职位搜索页面，确认页面能够正常显示职位列表和详情。
3. 点击浏览器工具栏中的 BOSS Tools 图标，打开侧边栏。
4. 设置城市、公司规模、包含词、排除词和本次预沟通数量；包含词不能为空。
5. 首次实际使用建议将预沟通数量设置为 `1`，并由用户本人观察页面变化。
6. 点击“开始”，在侧边栏观察扫描、匹配、沟通结果和状态提示。
7. 需要临时中断时使用“暂停”，确认页面正常后再恢复；也可以随时停止。

扩展只会控制当前激活的 BOSS 职位或聊天页面，不会自动寻找其他标签页继续执行。

## 工作方式

一次运行遵循以下流程：

1. 读取当前列表中的岗位引用。
2. 打开岗位详情，并核对列表、详情和操作按钮是否属于同一岗位。
3. 应用包含词与排除词规则，跳过不匹配或已有沟通关系的岗位。
4. 在点击前再次读取运行状态；如果用户已经暂停或停止，则不再点击。
5. 点击“立即沟通”后等待页面确认，只有至少两个可见成功信号一致时才计数。
6. 保存结果和检查点，然后处理下一条岗位，直到达到上限或遇到阻断条件。

## 安全边界

BOSS Tools 的自动化范围被限制在用户当前可见的 Chrome 页面中：

- 不调用 BOSS 私有接口，不读取或导出 Cookie、凭据和聊天内容。
- 不向页面主世界注入脚本，不使用独立浏览器配置或隐藏自动化特征。
- 不绕过验证码、登录验证、账号异常或平台额度限制。
- 不发送简历，不自动回复招聘者，也不会在未确认结果时增加成功数量。
- 不保存页面 HTML、弹窗正文、查询密钥或其他敏感页面数据。
- 所有配置、状态和历史数据均保存在本机 `chrome.storage.local`。

## 已知限制

- 仅支持 Chrome Manifest V3 环境，以及 `https://www.zhipin.com/web/geek/*` 下的职位和聊天页面。
- BOSS 页面结构或文案变化可能导致岗位识别、按钮定位或成功确认失效。
- 页面必须保持已登录且可正常操作；登录、验证和账号异常需要用户本人处理。
- 扩展依赖可见页面信号判断结果，信号不足时会记录失败或主动停止，而不会假设成功。
- 本项目不能消除平台限制或账号风险。BOSS 用户协议可能限制未经许可的第三方插件和自动化工具，使用者应自行评估并承担相应风险。

## 技术栈

| 领域       | 技术                              |
| ---------- | --------------------------------- |
| 浏览器扩展 | Chrome Manifest V3、WXT `0.20.27` |
| 用户界面   | React `19`、Lucide React          |
| 语言与校验 | TypeScript `5.9`、Zod `4`         |
| 测试       | Vitest、jsdom                     |
| 本地存储   | `chrome.storage.local`            |

## 开发与构建

常用命令：

| 命令                | 用途                               |
| ------------------- | ---------------------------------- |
| `npm run dev`       | 启动 WXT 开发模式                  |
| `npm run typecheck` | 生成扩展类型并运行 TypeScript 检查 |
| `npm run lint`      | 运行 ESLint                        |
| `npm test`          | 运行自动化测试                     |
| `npm run build`     | 类型检查并构建 Chrome MV3 扩展     |
| `npm run build:zip` | 构建并生成扩展压缩包               |

项目主要目录：

```text
entrypoints/   扩展入口、内容脚本与侧边栏界面
src/domain/    筛选规则、状态机、数据结构与校验
src/extension/ BOSS 页面适配、运行控制与本地存储
src/ui/        侧边栏组件与交互逻辑
tests/         单元测试、控制器测试与 DOM fixtures
```

提交前建议运行：

```powershell
npm run lint
npm test
npm run build
```

## 反馈与许可

- 问题与建议：[GitHub Issues](https://github.com/Blake-YH/BOSS-Tools/issues)
- 项目仓库：[Blake-YH/BOSS-Tools](https://github.com/Blake-YH/BOSS-Tools)

当前项目未附带开源许可证，`package.json` 标记为 `UNLICENSED`。代码公开可见不代表授予复制、修改或分发许可。
