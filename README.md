# 传统木偶戏班偶头与巡演装箱API

维护偶头、服装配件、修补流转、巡演装箱和返场缺损追踪。

## 启动

```bash
npm install
npm start
```

默认地址：http://localhost:3914

## 常用接口

- `GET /api/puppetHeads?play=火焰山&status=可演出`
- `POST /api/repairRecords`
- `POST /api/tourBoxes`
- `POST /api/lossReports`
- `GET /api/:collection/:id/timeline`

## 剧目演出清单示例

### 查询某剧目演出清单
```bash
GET /api/playChecklists?playName=火焰山
```

### 创建剧目演出清单
```bash
POST /api/playChecklists
Content-Type: application/json

{
  "playName": "白蛇传",
  "standardRoles": ["许仙", "白娘子", "小青", "法海"],
  "requiredPuppetHeadCount": 4,
  "requiredAccessories": ["油纸伞", "拂尘", "僧帽", "宝剑"],
  "remarks": "经典爱情神话剧"
}
```

### 更新剧目演出清单
```bash
PATCH /api/playChecklists/{id}
Content-Type: application/json

{
  "remarks": "经典爱情神话剧，需重点维护白娘子偶头"
}
```

### 删除剧目演出清单
```bash
DELETE /api/playChecklists/{id}
```

SQLite数据库文件会在首次启动时创建到`data/app.db`。
