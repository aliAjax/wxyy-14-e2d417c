const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { randomUUID } = require('crypto');
const config = require('./project.config');

const app = express();
const PORT = process.env.PORT || config.port;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'app.db');

app.use(express.json({ limit: '2mb' }));

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  return "'" + String(value).replaceAll("'", "''") + "'";
}

function runSql(sql) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  return execFileSync('sqlite3', [DB_FILE], {
    input: sql,
    encoding: 'utf8'
  });
}

function select(sql) {
  const output = runSql('.mode json\n' + sql);
  if (!output.trim()) return [];
  return JSON.parse(output);
}

function now() {
  return new Date().toISOString();
}

function toRecord(row) {
  const data = JSON.parse(row.data || '{}');
  return {
    id: row.id,
    collection: row.collection,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...data
  };
}

function findCollection(name) {
  const collection = config.collections[name];
  if (!collection) {
    const error = new Error('unknown collection: ' + name);
    error.status = 404;
    throw error;
  }
  return collection;
}

function titleFor(collectionConfig, data) {
  return (collectionConfig.titleFields || [])
    .map((field) => data[field])
    .filter(Boolean)
    .join(' / ') || data.name || data.title || data.code || '';
}

function validate(collectionConfig, data) {
  const missing = (collectionConfig.required || []).filter((field) => data[field] === undefined || data[field] === '');
  if (missing.length) {
    const error = new Error('missing required fields: ' + missing.join(', '));
    error.status = 400;
    throw error;
  }
}

function ensureCanEditRecord(collection, record) {
  if (collection === 'returnCountDrafts' && record.status === '已确认') {
    const error = new Error('返场清点草稿已确认，不可再修改');
    error.status = 400;
    throw error;
  }
}

function insertEvent({ recordId, collection, action, status, actor, note, data }) {
  runSql(
    'INSERT INTO events (id, record_id, collection, action, status, actor, note, data, created_at) VALUES (' +
    [
      sqlValue(randomUUID()),
      sqlValue(recordId),
      sqlValue(collection),
      sqlValue(action || '记录'),
      sqlValue(status || ''),
      sqlValue(actor || ''),
      sqlValue(note || ''),
      sqlValue(JSON.stringify(data || {})),
      sqlValue(now())
    ].join(', ') +
    ');'
  );
}

function initDb() {
  runSql(`
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  collection TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_records_collection ON records(collection);
CREATE INDEX IF NOT EXISTS idx_records_status ON records(status);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT,
  actor TEXT,
  note TEXT,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_record ON events(record_id);
`);

  const count = select('SELECT COUNT(*) AS count FROM records;')[0].count;
  if (count > 0) return;

  for (const seed of config.seed || []) {
    const collectionConfig = findCollection(seed.collection);
    const id = seed.id || randomUUID();
    const createdAt = seed.createdAt || now();
    const status = seed.status || collectionConfig.defaultStatus || '';
    const data = { ...seed.data, status };
    runSql(
      'INSERT INTO records (id, collection, status, title, data, created_at, updated_at) VALUES (' +
      [
        sqlValue(id),
        sqlValue(seed.collection),
        sqlValue(status),
        sqlValue(titleFor(collectionConfig, data)),
        sqlValue(JSON.stringify(data)),
        sqlValue(createdAt),
        sqlValue(seed.updatedAt || createdAt)
      ].join(', ') +
      ');'
    );
    insertEvent({
      recordId: id,
      collection: seed.collection,
      action: seed.eventAction || '创建',
      status,
      actor: seed.actor || 'system',
      note: seed.note || '',
      data
    });
  }
}

function loadRecord(collection, id) {
  const rows = select(
    'SELECT * FROM records WHERE collection = ' + sqlValue(collection) + ' AND id = ' + sqlValue(id) + ' LIMIT 1;'
  );
  return rows[0] ? toRecord(rows[0]) : null;
}

function saveRecord(collection, id, data, status) {
  const collectionConfig = findCollection(collection);
  runSql(
    'UPDATE records SET status = ' + sqlValue(status) +
    ', title = ' + sqlValue(titleFor(collectionConfig, data)) +
    ', data = ' + sqlValue(JSON.stringify(data)) +
    ', updated_at = ' + sqlValue(now()) +
    ' WHERE collection = ' + sqlValue(collection) + ' AND id = ' + sqlValue(id) + ';'
  );
}

function applyQuery(records, query) {
  return records.filter((record) => {
    if (query.status && record.status !== query.status) return false;
    if (query.search) {
      const haystack = JSON.stringify(record).toLowerCase();
      if (!haystack.includes(String(query.search).toLowerCase())) return false;
    }
    for (const [key, value] of Object.entries(query)) {
      if (['status', 'search', 'limit'].includes(key)) continue;
      if (record[key] === undefined) return false;
      if (!String(record[key]).toLowerCase().includes(String(value).toLowerCase())) return false;
    }
    return true;
  });
}

initDb();

app.post('/api/returnCountDrafts/:id/confirm', (req, res, next) => {
  try {
    const draft = loadRecord('returnCountDrafts', req.params.id);
    if (!draft) return res.status(404).json({ error: '草稿不存在' });
    if (draft.status !== '草稿') return res.status(400).json({ error: '草稿已确认，不可重复提交' });

    const tourBox = loadRecord('tourBoxes', draft.tourBoxId);
    if (!tourBox) return res.status(400).json({ error: '关联的巡演装箱单不存在' });

    const headChecks = draft.headChecks || [];
    const accessoryChecks = draft.accessoryChecks || [];
    const generatedReports = [];

    for (const check of headChecks) {
      if (!check.problem || !check.problem.trim()) continue;
      const head = loadRecord('puppetHeads', check.headId);
      const reportData = {
        tourBoxId: draft.tourBoxId,
        itemType: '偶头',
        itemId: check.headId,
        itemName: check.role || (head ? head.role : '') || check.headId,
        problem: check.problem,
        checker: draft.checker,
        draftId: draft.id
      };
      const reportConfig = findCollection('lossReports');
      const reportStatus = reportConfig.defaultStatus || '待处理';
      reportData.status = reportStatus;
      validate(reportConfig, reportData);
      const reportId = randomUUID();
      const createdAt = now();
      runSql(
        'INSERT INTO records (id, collection, status, title, data, created_at, updated_at) VALUES (' +
        [
          sqlValue(reportId),
          sqlValue('lossReports'),
          sqlValue(reportStatus),
          sqlValue(titleFor(reportConfig, reportData)),
          sqlValue(JSON.stringify(reportData)),
          sqlValue(createdAt),
          sqlValue(createdAt)
        ].join(', ') +
        ');'
      );
      insertEvent({
        recordId: reportId,
        collection: 'lossReports',
        action: '返场清点登记',
        status: reportStatus,
        actor: draft.checker,
        note: '从返场清点草稿' + draft.id + '生成',
        data: reportData
      });
      generatedReports.push({ id: reportId, itemType: '偶头', itemName: reportData.itemName, problem: check.problem });
    }

    for (const check of accessoryChecks) {
      if (!check.problem || !check.problem.trim()) continue;
      const acc = loadRecord('accessories', check.accessoryId);
      const reportData = {
        tourBoxId: draft.tourBoxId,
        itemType: '配件',
        itemId: check.accessoryId,
        itemName: check.name || (acc ? acc.name : '') || check.accessoryId,
        problem: check.problem,
        checker: draft.checker,
        draftId: draft.id
      };
      const reportConfig = findCollection('lossReports');
      const reportStatus = reportConfig.defaultStatus || '待处理';
      reportData.status = reportStatus;
      validate(reportConfig, reportData);
      const reportId = randomUUID();
      const createdAt = now();
      runSql(
        'INSERT INTO records (id, collection, status, title, data, created_at, updated_at) VALUES (' +
        [
          sqlValue(reportId),
          sqlValue('lossReports'),
          sqlValue(reportStatus),
          sqlValue(titleFor(reportConfig, reportData)),
          sqlValue(JSON.stringify(reportData)),
          sqlValue(createdAt),
          sqlValue(createdAt)
        ].join(', ') +
        ');'
      );
      insertEvent({
        recordId: reportId,
        collection: 'lossReports',
        action: '返场清点登记',
        status: reportStatus,
        actor: draft.checker,
        note: '从返场清点草稿' + draft.id + '生成',
        data: reportData
      });
      generatedReports.push({ id: reportId, itemType: '配件', itemName: reportData.itemName, problem: check.problem });
    }

    const draftData = { ...draft };
    delete draftData.id;
    delete draftData.collection;
    delete draftData.createdAt;
    delete draftData.updatedAt;
    draftData.status = '已确认';
    saveRecord('returnCountDrafts', draft.id, draftData, '已确认');
    insertEvent({
      recordId: draft.id,
      collection: 'returnCountDrafts',
      action: '确认提交',
      status: '已确认',
      actor: draft.checker,
      note: '生成' + generatedReports.length + '条缺损追踪记录',
      data: { generatedReportCount: generatedReports.length, generatedReports }
    });

    if (tourBox.status !== '已闭环') {
      const tourBoxData = { ...tourBox };
      delete tourBoxData.id;
      delete tourBoxData.collection;
      delete tourBoxData.createdAt;
      delete tourBoxData.updatedAt;
      tourBoxData.status = '返场清点中';
      saveRecord('tourBoxes', tourBox.id, tourBoxData, '返场清点中');
      insertEvent({
        recordId: tourBox.id,
        collection: 'tourBoxes',
        action: '返场清点',
        status: '返场清点中',
        actor: draft.checker,
        note: '返场清点草稿' + draft.id + '已提交，发现' + generatedReports.length + '项问题',
        data: { draftId: draft.id, issueCount: generatedReports.length }
      });
    }

    res.json({
      draft: loadRecord('returnCountDrafts', draft.id),
      generatedReports,
      generatedReportCount: generatedReports.length
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/packing-check', (req, res, next) => {
  try {
    const { play, headIds = [], accessoryIds = [] } = req.body;
    if (!play) {
      return res.status(400).json({ error: 'missing required field: play' });
    }

    const usableHeadStatuses = ['可演出'];
    const usableAccessoryStatuses = ['在库'];

    const unusableHeads = [];
    const unfoundHeadIds = [];
    const coveredRoles = new Set();
    const headMap = new Map();

    for (const headId of headIds) {
      const head = loadRecord('puppetHeads', headId);
      if (!head) {
        unfoundHeadIds.push(headId);
        continue;
      }
      headMap.set(headId, head);
      if (!usableHeadStatuses.includes(head.status)) {
        unusableHeads.push({
          id: headId,
          role: head.role || '',
          play: head.play || '',
          status: head.status,
          reason: '偶头状态为\'' + head.status + '\'，不可演出'
        });
      } else {
        if (head.role) coveredRoles.add(head.role);
      }
    }

    const missingAccessories = [];
    const unfoundAccessoryIds = [];
    const coveredAccessoryNames = new Set();

    for (const accId of accessoryIds) {
      const acc = loadRecord('accessories', accId);
      if (!acc) {
        unfoundAccessoryIds.push(accId);
        continue;
      }
      if (!usableAccessoryStatuses.includes(acc.status)) {
        missingAccessories.push({
          id: accId,
          name: acc.name || '',
          role: acc.role || '',
          play: acc.play || '',
          status: acc.status,
          reason: '配件状态为\'' + acc.status + '\'，不在库'
        });
      } else {
        if (acc.name) coveredAccessoryNames.add(acc.name);
      }
    }

    const checklistRows = select(
      'SELECT * FROM records WHERE collection = \'playChecklists\' AND title LIKE ' + sqlValue('%' + play + '%') + ';'
    ).map(toRecord);
    const checklist = checklistRows.find((c) => c.playName === play);

    const requiredItemsMissing = { roles: [], accessories: [] };

    if (checklist) {
      const standardRoles = checklist.standardRoles || [];
      const requiredAccessories = checklist.requiredAccessories || [];
      requiredItemsMissing.roles = standardRoles.filter((r) => !coveredRoles.has(r));
      requiredItemsMissing.accessories = requiredAccessories.filter((a) => !coveredAccessoryNames.has(a));
    }

    const hasIssues =
      unusableHeads.length > 0 ||
      missingAccessories.length > 0 ||
      unfoundHeadIds.length > 0 ||
      unfoundAccessoryIds.length > 0 ||
      requiredItemsMissing.roles.length > 0 ||
      requiredItemsMissing.accessories.length > 0;

    res.json({
      play,
      unusableHeads,
      missingAccessories,
      unfoundHeadIds,
      unfoundAccessoryIds,
      requiredItemsMissing,
      canProceed: !hasIssues
    });
  } catch (error) {
    next(error);
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, service: config.title, port: PORT });
});

app.get('/api/meta', (req, res) => {
  res.json({
    title: config.title,
    description: config.description,
    collections: config.collections,
    examples: config.examples || []
  });
});

app.get('/api/:collection', (req, res, next) => {
  try {
    findCollection(req.params.collection);
    const rows = select(
      'SELECT * FROM records WHERE collection = ' + sqlValue(req.params.collection) + ' ORDER BY updated_at DESC;'
    ).map(toRecord);
    const filtered = applyQuery(rows, req.query);
    const limit = Number(req.query.limit || 0);
    res.json(limit > 0 ? filtered.slice(0, limit) : filtered);
  } catch (error) {
    next(error);
  }
});

app.post('/api/:collection', (req, res, next) => {
  try {
    const collectionConfig = findCollection(req.params.collection);
    const data = { ...collectionConfig.defaults, ...req.body };
    const status = data.status || collectionConfig.defaultStatus || '';
    data.status = status;
    validate(collectionConfig, data);
    const id = randomUUID();
    const createdAt = now();
    runSql(
      'INSERT INTO records (id, collection, status, title, data, created_at, updated_at) VALUES (' +
      [
        sqlValue(id),
        sqlValue(req.params.collection),
        sqlValue(status),
        sqlValue(titleFor(collectionConfig, data)),
        sqlValue(JSON.stringify(data)),
        sqlValue(createdAt),
        sqlValue(createdAt)
      ].join(', ') +
      ');'
    );
    insertEvent({
      recordId: id,
      collection: req.params.collection,
      action: req.body.action || '创建',
      status,
      actor: req.body.actor || '',
      note: req.body.note || '',
      data
    });
    res.status(201).json(loadRecord(req.params.collection, id));
  } catch (error) {
    next(error);
  }
});

app.get('/api/:collection/:id', (req, res, next) => {
  try {
    findCollection(req.params.collection);
    const record = loadRecord(req.params.collection, req.params.id);
    if (!record) return res.status(404).json({ error: 'not found' });
    res.json(record);
  } catch (error) {
    next(error);
  }
});

app.patch('/api/:collection/:id', (req, res, next) => {
  try {
    findCollection(req.params.collection);
    const record = loadRecord(req.params.collection, req.params.id);
    if (!record) return res.status(404).json({ error: 'not found' });
    ensureCanEditRecord(req.params.collection, record);
    const nextData = { ...record, ...req.body };
    delete nextData.id;
    delete nextData.collection;
    delete nextData.createdAt;
    delete nextData.updatedAt;
    const status = nextData.status || record.status;
    nextData.status = status;
    saveRecord(req.params.collection, req.params.id, nextData, status);
    insertEvent({
      recordId: req.params.id,
      collection: req.params.collection,
      action: req.body.action || '更新',
      status,
      actor: req.body.actor || '',
      note: req.body.note || '',
      data: req.body
    });
    res.json(loadRecord(req.params.collection, req.params.id));
  } catch (error) {
    next(error);
  }
});

app.post('/api/:collection/:id/events', (req, res, next) => {
  try {
    const collectionConfig = findCollection(req.params.collection);
    const record = loadRecord(req.params.collection, req.params.id);
    if (!record) return res.status(404).json({ error: 'not found' });
    ensureCanEditRecord(req.params.collection, record);
    const status = req.body.status || record.status;
    if (collectionConfig.statuses && !collectionConfig.statuses.includes(status)) {
      return res.status(400).json({ error: 'invalid status: ' + status });
    }
    const nextData = { ...record, ...(req.body.fields || {}), status };
    delete nextData.id;
    delete nextData.collection;
    delete nextData.createdAt;
    delete nextData.updatedAt;
    saveRecord(req.params.collection, req.params.id, nextData, status);
    insertEvent({
      recordId: req.params.id,
      collection: req.params.collection,
      action: req.body.action || status || '记录',
      status,
      actor: req.body.actor || '',
      note: req.body.note || '',
      data: req.body
    });
    res.json(loadRecord(req.params.collection, req.params.id));
  } catch (error) {
    next(error);
  }
});

app.get('/api/:collection/:id/timeline', (req, res, next) => {
  try {
    findCollection(req.params.collection);
    const record = loadRecord(req.params.collection, req.params.id);
    if (!record) return res.status(404).json({ error: 'not found' });
    const events = select(
      'SELECT * FROM events WHERE record_id = ' + sqlValue(req.params.id) + ' ORDER BY created_at ASC;'
    ).map((event) => ({
      id: event.id,
      action: event.action,
      status: event.status,
      actor: event.actor,
      note: event.note,
      data: JSON.parse(event.data || '{}'),
      createdAt: event.created_at
    }));
    res.json({ record, events });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/:collection/:id', (req, res, next) => {
  try {
    findCollection(req.params.collection);
    runSql('DELETE FROM records WHERE collection = ' + sqlValue(req.params.collection) + ' AND id = ' + sqlValue(req.params.id) + ';');
    runSql('DELETE FROM events WHERE record_id = ' + sqlValue(req.params.id) + ';');
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  res.status(error.status || 500).json({ error: error.message || 'server error' });
});

app.listen(PORT, () => {
  console.log(config.title + ' API running at http://localhost:' + PORT);
});
