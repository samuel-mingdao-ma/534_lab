# 全球汇率仪表盘

一个中文静态网页，通过 `fetch` 获取 [Frankfurter API](https://frankfurter.dev/) 的真实汇率数据，无需 API key、后端服务或第三方依赖。

## 功能

- 支持 USD、CNY、EUR、GBP、JPY、CHF，切换基准与目标币种。
- 查看最新汇率，以及近 30 / 90 个日历日的 SVG 走势图。
- 输入金额进行换算，交换币种或手动刷新数据。
- 提供加载状态、请求失败提示与重试；不会用示例数据替代请求结果。

## 本地预览

直接双击 `index.html`，用浏览器打开即可。也可以在项目目录运行：

```bash
python3 -m http.server 8000
```

然后访问 [http://localhost:8000](http://localhost:8000)。获取汇率需要联网。

项目只有三个页面文件：`index.html`、`styles.css` 和 `app.js`，无需安装或构建。

## 在 GitHub Pages 上发布

将页面文件放到仓库 `main` 分支根目录后，在 GitHub 手动设置：

1. 打开仓库 **Settings → Pages**。
2. 在 **Build and deployment** 中选择 **Deploy from a branch**。
3. 选择 **main** 分支和 **/ (root)**，点击 **Save**。
4. 等待 GitHub 完成发布，再打开 Pages 设置页显示的网站链接。

## 数据与计算

最新汇率请求示例：

```text
https://api.frankfurter.dev/v2/rates?base=USD&quotes=CNY,EUR,GBP,JPY,CHF
```

历史请求在同一接口添加 `from=YYYY-MM-DD&to=YYYY-MM-DD`，起止日期均包含。API 返回一个数组，单行数据形状如下：

```json
{
  "date": "2026-10-19",
  "base": "USD",
  "quote": "CNY",
  "rate": 6.6788
}
```

`rate` 表示 **1 单位 base 可兑换多少 quote**，金额换算使用 `金额 × 汇率`。同币种汇率为 1。

Frankfurter 默认汇总多个官方来源的参考汇率，按日更新，周末也可能有记录。页面的数据日期以 API 响应为准；最新记录不一定对应浏览当天。汇率不代表实时成交价，换算结果不包含银行手续费、点差或其他费用。

接口说明见 [Frankfurter 文档](https://frankfurter.dev/) 和 [v2 OpenAPI](https://api.frankfurter.dev/v2/openapi.json)。
