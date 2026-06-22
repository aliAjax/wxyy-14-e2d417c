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

## 返场清点草稿示例

### 创建返场清点草稿
草稿保存后不改变原有资产状态，仅记录清点内容。

```bash
POST /api/returnCountDrafts
Content-Type: application/json

{
  "tourBoxId": "tour-box-id-123",
  "checker": "张三",
  "headChecks": [
    {
      "headId": "head-seed-1",
      "role": "武生",
      "play": "火焰山",
      "checked": true,
      "problem": "左颊掉彩，开口机关偏紧"
    },
    {
      "headId": "head-ok-1",
      "role": "孙悟空",
      "play": "火焰山",
      "checked": true,
      "problem": ""
    }
  ],
  "accessoryChecks": [
    {
      "accessoryId": "accessory-seed-1",
      "name": "红缨冠",
      "role": "武生",
      "play": "火焰山",
      "checked": true,
      "problem": "红缨有脱落"
    }
  ],
  "notes": "巡演返场清点，发现2项问题"
}
```

### 确认提交草稿
确认提交后，所有带问题的项将生成缺损追踪记录，草稿状态变为"已确认"，不可重复提交。

```bash
POST /api/returnCountDrafts/{draftId}/confirm
```

返回示例：
```json
{
  "draft": { ... },
  "generatedReports": [
    {
      "id": "loss-report-id-1",
      "itemType": "偶头",
      "itemName": "武生",
      "problem": "左颊掉彩，开口机关偏紧"
    },
    {
      "id": "loss-report-id-2",
      "itemType": "配件",
      "itemName": "红缨冠",
      "problem": "红缨有脱落"
    }
  ],
  "generatedReportCount": 2
}
```

### 查询草稿时间线
查看草稿的创建、更新、确认提交等历史记录。

```bash
GET /api/returnCountDrafts/{draftId}/timeline
```

### 更新草稿（仅草稿状态可修改）
```bash
PATCH /api/returnCountDrafts/{draftId}
Content-Type: application/json

{
  "notes": "补充：道具箱也有磕碰痕迹"
}
```

### 查询某巡演装箱单的所有返场清点草稿
```bash
GET /api/returnCountDrafts?tourBoxId={tourBoxId}
```

SQLite数据库文件会在首次启动时创建到`data/app.db`。
