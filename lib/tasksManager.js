const fs = require('fs').promises;

const TASKS_TEMPLATE = { tasks: [], inbox: [], watch: [] };

async function readTasks(tasksPath, readJson) {
  const data = await readJson(tasksPath, TASKS_TEMPLATE);
  return {
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    inbox: Array.isArray(data.inbox) ? data.inbox : [],
    watch: Array.isArray(data.watch) ? data.watch : [],
  };
}

async function writeTasksLatest(tasksPath, readJson, writeJson, mutator) {
  const latest = await readTasks(tasksPath, readJson);
  const out = await mutator(latest);
  await writeJson(tasksPath, out);
  return out;
}

function findAndRemoveTask(data, id) {
  for (const key of ['tasks', 'inbox', 'watch']) {
    const idx = data[key].findIndex((x) => x.id === id);
    if (idx >= 0) return data[key].splice(idx, 1)[0];
  }
  return null;
}

function getDateRangeInTimezone(timezone) {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const startLocal = new Date(local.getFullYear(), local.getMonth(), local.getDate(), 0, 0, 0, 0);
  const endLocal = new Date(local.getFullYear(), local.getMonth(), local.getDate(), 23, 59, 59, 999);
  const offset = now.getTime() - local.getTime();
  return { start: new Date(startLocal.getTime() + offset), end: new Date(endLocal.getTime() + offset) };
}

module.exports = { TASKS_TEMPLATE, readTasks, writeTasksLatest, findAndRemoveTask, getDateRangeInTimezone };
