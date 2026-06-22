module.exports = {
  port: 3914,
  title: '传统木偶戏班偶头与巡演装箱API',
  description: '维护偶头、服装配件、修补流转、巡演装箱和返场缺损追踪。',
  collections: {
    puppetHeads: {
      label: '偶头档案',
      defaultStatus: '可演出',
      statuses: ['可演出', '待修补', '修补中', '试演中', '不可演出', '已装箱'],
      required: ['role', 'play', 'paintStatus', 'mechanism', 'boxNo'],
      titleFields: ['role', 'play'],
      defaults: { currentUsable: true }
    },
    accessories: {
      label: '服装配件',
      defaultStatus: '在库',
      statuses: ['在库', '已装箱', '缺损', '遗失'],
      required: ['name', 'role', 'play', 'boxNo'],
      titleFields: ['name', 'role']
    },
    repairRecords: {
      label: '修补记录',
      defaultStatus: '待处理',
      statuses: ['待处理', '补漆中', '换线中', '修机关中', '换眼珠中', '试演中', '已完成'],
      required: ['puppetHeadId', 'repairType', 'handler'],
      titleFields: ['repairType', 'handler']
    },
    tourBoxes: {
      label: '巡演装箱单',
      defaultStatus: '草稿',
      statuses: ['草稿', '已装箱', '巡演中', '返场清点中', '已闭环'],
      required: ['showName', 'venue', 'play', 'headIds', 'accessoryIds'],
      titleFields: ['showName', 'play']
    },
    lossReports: {
      label: '缺损追踪',
      defaultStatus: '待处理',
      statuses: ['待处理', '修复中', '已补齐', '确认为遗失'],
      required: ['tourBoxId', 'itemType', 'itemName', 'problem'],
      titleFields: ['itemName', 'problem']
    },
    playChecklists: {
      label: '剧目演出清单',
      defaultStatus: '启用',
      statuses: ['启用', '停用', '修订中'],
      required: ['playName'],
      titleFields: ['playName'],
      defaults: { standardRoles: [], requiredAccessories: [] }
    },
    returnCountDrafts: {
      label: '返场清点草稿',
      defaultStatus: '草稿',
      statuses: ['草稿', '已确认'],
      required: ['tourBoxId', 'checker'],
      titleFields: ['tourBoxId', 'checker'],
      defaults: { headChecks: [], accessoryChecks: [], notes: '' }
    }
  },
  seed: [
    {
      collection: 'puppetHeads',
      id: 'head-seed-1',
      status: '待修补',
      data: {
        role: '武生',
        play: '火焰山',
        paintStatus: '左颊掉彩',
        mechanism: '开口机关偏紧',
        accessories: ['红缨冠', '短靠'],
        boxNo: '木箱乙-04',
        currentUsable: false
      },
      note: '返场发现掉彩'
    },
    {
      collection: 'accessories',
      id: 'accessory-seed-1',
      status: '在库',
      data: {
        name: '红缨冠',
        role: '武生',
        play: '火焰山',
        boxNo: '配件箱-02'
      }
    },
    {
      collection: 'playChecklists',
      id: 'play-checklist-seed-1',
      status: '启用',
      data: {
        playName: '火焰山',
        standardRoles: ['孙悟空', '唐僧', '猪八戒', '沙僧', '铁扇公主', '牛魔王'],
        requiredPuppetHeadCount: 6,
        requiredAccessories: ['红缨冠', '金箍棒', '僧帽', '袈裟', '九齿钉耙', '月牙铲', '芭蕉扇'],
        remarks: '经典剧目，偶头需重点维护，铁扇公主和牛魔王为主要反派角色。'
      },
      note: '初始种子数据'
    }
  ],
  examples: [
    'GET /api/puppetHeads?play=火焰山&status=可演出 查询某剧目可用偶头',
    'POST /api/tourBoxes 创建巡演装箱单',
    'POST /api/lossReports 登记返场缺损或遗失',
    'GET /api/playChecklists?playName=火焰山 按剧目名称查询演出清单',
    'POST /api/packing-check {play,headIds,accessoryIds} 装箱预检',
    'POST /api/returnCountDrafts 创建返场清点草稿',
    'POST /api/returnCountDrafts/{id}/confirm 确认提交返场清点草稿并生成缺损记录',
    'GET /api/returnCountDrafts/{id}/timeline 查询返场清点草稿时间线'
  ]
};
