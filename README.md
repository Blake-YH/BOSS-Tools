# BOSS Tools

BOSS Tools 是一个仅在本机 Chrome 中运行的 Manifest V3 扩展。它在 BOSS 职位页面按城市、公司规模、包含词和排除词筛选岗位，串行点击“立即沟通”，并只在检测到两个一致的页面成功信号后记录本次沟通成功。

## 当前能力

- 自定义城市、公司规模、包含词和排除词。
- 包含词匹配职位名称、技能标签和职位描述。
- 排除词额外匹配公司名称，并优先于包含词。
- 本次预沟通数量范围为 `1-200`。
- 实时显示本次已沟通、已扫描、已匹配和历史成功数量。
- 支持开始、暂停、恢复和停止。
- 自动识别“已向BOSS发送消息”弹窗，并只点击弹窗内的“继续沟通”。
- 使用 `chrome.storage.local` 永久保存配置、检查点和处理历史。
- 历史页面支持二次确认后清空全部记录或删除单条记录。
- 遇到登录失效、验证码、额度限制、账号异常、未知弹窗或连续三次未确认时停止。

本项目不会发送简历、自动回复招聘者、读取或导出 Cookie、调用 BOSS 私有接口，也不会绕过验证码或平台风控。

## 技术栈

- Chrome Manifest V3
- WXT `0.20.27`
- React `19`
- TypeScript `5.9`
- Zod `4`
- Vitest + jsdom

## 快速运行

```powershell
npm install
npm run build
```

然后打开 Chrome 的 `chrome://extensions`，开启“开发者模式”，点击“加载已解压的扩展程序”，选择：

```text
D:\VibeCoding_project\BOSS-Tools\.output\chrome-mv3
```

在当前 Chrome 中登录 BOSS，打开职位页，再点击工具栏中的 BOSS Tools 图标。扩展会在 Chrome 侧边栏中打开。

更完整的安装、更新、调试和故障处理步骤见 [调试运行指南.md](./调试运行指南.md)。

## 开发命令

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run build:zip
```

## 风险说明

BOSS 用户协议对未经许可的第三方工具、插件和自动化浏览存在限制。即使扩展只操作可见 DOM，仍可能触发平台限制或账号风险。首次真实验证应将预沟通数量设为 `1`，并由用户本人观察页面结果；项目不会通过隐藏特征或修改安全逻辑规避平台拒绝。
