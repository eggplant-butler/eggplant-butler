# 🍆 茄子管家 (Eggplant Butler)

个人生活管理后端服务，全方位管理你的日常生活。

## ✨ 功能模块

| 模块 | 说明 |
|------|------|
| 🌤️ 天气助手 | 实时天气查询，降雨自动提醒带伞 |
| 📅 动态日程 | 智能生成每日时间轴，动态安排家务 |
| 💰 财务管理 | 收支记录、分类预算、宠物开销分析 |
| ✅ 习惯打卡 | 早起/健身/睡觉打卡，连续天数统计 |
| 💪 健康管理 | 饮水、经期、如厕记录与提醒 |
| 🐱 宠物护理 | 驱虫/疫苗/洗澡提醒，紧急症状建议 |
| 🧹 家务引擎 | 忙闲模式切换，智能计算家务周期 |
| 🛒 库存买菜 | 物品库存管理，自动生成购物清单 |
| 👥 社交人脉 | 人脉管理、生日提醒、互动时间线 |
| 💼 工作引擎 | 销售/家教/面试多模式切换 |
| 📷 摄影学习 | 摄影日志、复盘记录、技能趋势 |
| 📚 阅读模块 | 阅读记录、连续天数、阅读提醒 |
| 🎯 愿望清单 | 储蓄目标、进度追踪、预计达成日期 |
| 🎉 成就小确幸 | 记录小确幸，自动生成成就 |
| 📝 闪念笔记 | 快速记录，AI智能分类建议 |
| ❓ 今日之问 | 基于昨日数据动态生成反思问题 |
| 📰 每日新闻 | 新闻速览、分类浏览、每日简报推送 |
| 🔐 安全访问 | 密码保护所有API接口，安全工作台 |
| ⚙️ 管理员中心 | 模块开关、跨模块规则、系统概览 |

## 🛠️ 技术栈

- **Node.js** + **Express** - 后端框架
- **本地JSON文件** - 数据存储（`/data`目录）
- **uuid** - 唯一ID生成
- **moment** - 日期时间处理
- **node-schedule** - 定时任务调度
- **chinese-lunar** - 农历转换
- **axios** - HTTP请求

## 📁 项目结构

```
eggplant-butler/
├── server.js              # 主入口
├── package.json           # 项目配置
├── README.md              # 说明文档
├── config/                # 配置文件
│   ├── user.js           # 用户个人配置
│   └── budget.js         # 预算配置
├── routes/                # 路由模块
│   ├── weather.js        # 天气助手
│   ├── schedule.js       # 动态日程
│   ├── finance.js        # 财务管理
│   ├── habit.js          # 习惯打卡
│   ├── health.js         # 健康管理
│   ├── pet.js            # 宠物护理
│   ├── chores.js         # 家务引擎
│   ├── inventory.js      # 库存买菜
│   ├── social.js         # 社交人脉
│   ├── work.js           # 工作引擎
│   ├── photo.js          # 摄影学习
│   ├── reading.js        # 阅读模块
│   ├── wish.js           # 愿望清单
│   ├── joy.js            # 成就小确幸
│   ├── inbox.js          # 闪念笔记
│   ├── todayQuestion.js  # 今日之问
│   └── admin.js          # 管理员中心
├── utils/                 # 工具函数
│   ├── store.js          # 数据存储层
│   ├── helpers.js        # 通用工具函数
│   ├── notifier.js       # 通知调度器
│   ├── lunar.js          # 农历工具
│   ├── backup.js         # 备份工具
│   ├── auth.js           # 安全中间件
│   └── newsFetcher.js    # 新闻抓取工具
├── data/                  # 数据文件（自动创建）
├── backup/                # 备份文件（自动创建）
└── public/                # 静态文件
    ├── index.html        # 完整工作台界面（密码保护）
    └── test.html         # 简易测试界面
```

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
npm start
```

服务默认运行在 `http://localhost:3000`

### 测试界面

打开浏览器访问：`http://localhost:3000/public/test.html`

## 🔧 环境变量配置

在项目根目录创建 `.env` 文件，配置以下环境变量：

```env
# 服务端口（可选，默认3000）
PORT=3000

# 和风天气API Key（可选，无则使用模拟数据）
# 申请地址：https://dev.qweather.com/
WEATHER_API_KEY=your_weather_api_key

# PushPlus Token（可选，用于微信推送通知）
# 申请地址：http://www.pushplus.plus/
PUSHPLUS_TOKEN=your_pushplus_token

# 访问密码（必填，所有API接口需要此密码）
# 默认：eggplant2026
ACCESS_PASSWORD=your_password

# 新闻API Key（可选，无则使用模拟数据）
# 推荐天行数据：https://www.tianapi.com/
NEWS_API_KEY=your_news_api_key
```

### 环境变量说明

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `PORT` | 服务端口，默认3000 | 否 |
| `WEATHER_API_KEY` | 和风天气API Key，用于获取真实天气数据 | 否 |
| `PUSHPLUS_TOKEN` | PushPlus推送Token，用于微信通知 | 否 |
| `ACCESS_PASSWORD` | 访问密码，所有API接口需验证此密码，默认eggplant2026 | 否 |
| `NEWS_API_KEY` | 新闻API Key（推荐天行数据），无则使用模拟数据 | 否 |

## 📡 API 概览

所有API统一返回格式：
```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功"
}
```

### 🔐 安全访问

所有 `/api/*` 接口（除静态文件外）需通过密码验证，在请求头中添加：
```
x-access-password: your_password
```

默认密码为 `eggplant2026`，可通过环境变量 `ACCESS_PASSWORD` 修改。

### 天气模块
- `GET /api/weather/today` - 获取当天天气

### 日程模块
- `GET /api/schedule/today?mode=auto` - 生成今日日程

### 财务模块
- `POST /api/finance/expense` - 记录支出（支持rawText解析）
- `POST /api/finance/income` - 记录收入
- `GET /api/finance/summary?month=7` - 月度汇总
- `GET /api/finance/budget` - 预算情况

### 习惯模块
- `POST /api/habit/checkin` - 习惯打卡
- `GET /api/habit/streak` - 连续打卡统计
- `GET /api/habit/today` - 今日打卡状态

### 健康模块
- `POST /api/health/water` - 记录饮水
- `GET /api/health/water/today` - 今日饮水情况
- `POST /api/health/period` - 记录经期
- `GET /api/health/period/predict` - 经期预测
- `POST /api/health/period/sync` - 同步外部数据
- `POST /api/health/toilet` - 记录如厕
- `GET /api/health/toilet/daily` - 当日如厕记录

### 宠物模块
- `POST /api/pet/event` - 记录宠物事件
- `GET /api/pet/reminder` - 获取护理提醒
- `POST /api/pet/emergency` - 紧急症状记录

### 家务模块
- `GET /api/chores/due` - 今日待做家务
- `POST /api/chores/set-mode` - 切换忙闲模式
- `POST /api/chores/:id/complete` - 标记完成

### 库存模块
- `POST /api/inventory/item` - 添加物品
- `PATCH /api/inventory/:id/consume` - 消耗物品
- `GET /api/inventory/shopping-list` - 购物清单
- `GET /api/inventory/fridge` - 冰箱物品

### 社交模块
- `POST /api/social/contact` - 创建人脉
- `GET /api/social/upcoming-birthdays` - 即将到来的生日
- `POST /api/social/interaction` - 记录互动
- `GET /api/social/contact/:id/timeline` - 互动时间线

### 工作模块
- `POST /api/work/mode` - 切换工作模式
- `GET /api/work/mode` - 获取当前模式
- `POST /api/work/client` - 添加客户（销售模式）
- `POST /api/work/interaction` - 记录客户互动
- `GET /api/work/daily-review` - 每日工作复盘

### 摄影模块
- `POST /api/photo/log` - 记录摄影日志
- `POST /api/photo/reflection` - 摄影复盘
- `GET /api/photo/progress` - 技能进步趋势

### 阅读模块
- `POST /api/reading/log` - 记录阅读
- `GET /api/reading/stats` - 阅读统计

### 愿望模块
- `POST /api/wish` - 创建愿望
- `POST /api/wish/saving` - 存入储蓄
- `GET /api/wish/status` - 愿望进度

### 成就模块
- `POST /api/joy/joy` - 记录小确幸
- `POST /api/joy/win` - 手动记录成就
- `POST /api/joy/auto-achieve` - 自动检查成就
- `GET /api/joy/timeline` - 时间线

### 笔记模块
- `POST /api/inbox` - 添加闪念笔记
- `GET /api/inbox/unprocessed` - 未处理笔记

### 今日之问
- `GET /api/today-question` - 获取今日之问

### 管理员模块
- `GET /api/admin/skills` - 所有模块状态
- `POST /api/admin/skill/:name/toggle` - 开关模块
- `GET /api/admin/rules` - 获取规则列表
- `POST /api/admin/rule` - 添加规则
- `POST /api/admin/rules/check` - 执行规则检查
- `GET /api/admin/overview` - 系统概览
- `POST /api/admin/backup` - 手动触发备份
- `GET /api/admin/backups` - 备份列表

### 新闻模块
- `GET /api/news/today` - 今日新闻（按分类分组，每类最多3条）
- `GET /api/news/category/:name` - 特定分类新闻
- `GET /api/news/briefing` - 新闻简报文本

## ⏰ 定时任务

| 时间 | 任务 |
|------|------|
| 每天 07:30 | 天气检查，降雨提醒带伞 |
| 每天 08:00 | 新闻简报推送 |
| 每天 21:00 | 阅读提醒 |
| 每小时整点 | 检查今日提醒 |
| 每天 03:00 | 自动备份数据 |

## 📋 预置规则

1. **日支出超标提醒**：日支出超近7日1.5倍，晚8点提醒
2. **连续无小确幸提醒**：连续3天无小确幸，推送鼓励
3. **库存低提醒**：库存低且愿望含同类物品，提醒优先消耗
4. **客户跟进提醒**：48h未跟进客户，加入提醒
5. **急躁互动提醒**：家人互动带"急躁"标签后，下次来访前提醒深呼吸
6. **出门迟到提醒**：连续两天未在07:50前完成出门打卡，推送作息提醒

## 💾 数据备份

- 每天凌晨3点自动备份 `/data` 目录到 `/backup`
- 保留最近10个备份
- 支持手动触发备份：`POST /api/admin/backup`

## 🔔 通知推送

支持通过 PushPlus 推送微信通知：

1. 访问 [PushPlus官网](http://www.pushplus.plus/) 注册
2. 获取Token并配置到环境变量 `PUSHPLUS_TOKEN`
3. 未配置时通知将打印到控制台

安静时段（22:00-07:00）不推送通知，天气预警除外。

## 📝 用户配置

编辑 `config/user.js` 自定义个人配置：

- 作息时间（起床、出门、工作时段）
- 宠物名称
- 个人护理周期（洗头频率等）
- 家务周期（洗衣、床单、拖地等）
- 生理周期
- 工作模式

## 📜 License

MIT
