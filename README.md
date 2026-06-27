# 武林绘卷 · 岭南传统武术的流派传播与代际演变

聚焦传统体育、游艺与杂技——咏春、洪拳、蔡李佛、莫家拳等。

## 打开方式

直接双击 `index.html` 即可在默认浏览器打开（已内置 p5.js 和 Chart.js，无需网络）。

## 数据来源

- 原始数据：`1734684349991广东省省级以上非物质文化遗产代表性项目名录.xls`
- 截止时间：2024 年 12 月 4 日
- 由 `data/analyze.py` 读取并生成 `js/data.js`

## 技术栈

- p5.js（粒子系统、武字、火柴人、地图气泡）
- Chart.js（批次堆叠柱状图、核心区对比）
- 原生 HTML / CSS / JavaScript

## 目录结构

```
期末作业/
├── index.html
├── css/style.css
├── js/
│   ├── data.js      # 由 analyze.py 生成
│   ├── hero.js      # 卷一首：粒子武字
│   ├── map.js       # 卷二：广东 21 地市气泡地图
│   ├── charts.js    # 卷三：批次 + 核心区对比
│   └── main.js      # 滚动叙事 + 点击交互
├── data/analyze.py  # 一次性 Excel -> data.js 脚本
└── README.md
```

## 重新生成数据

```bash
python data/analyze.py
```

输出：`js/data.js`。
