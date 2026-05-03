const fs = require('fs').promises;
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const USERS_DIR = path.join(DATA_DIR, 'users');

const DEFAULTS = {
  'settings.json': {},
  'memory.json': { identity: [], knowledge: [], inference: [], archive: [], meta: {} },
  'tasks.json': { tasks: [], meta: {} },
  'research.json': { topics: [] },
  'latest-data.json': {}
};

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }
function getUserDataPath(userId) { return path.join(USERS_DIR, userId); }
async function readUserData(userId, filename) {
  const p = path.join(getUserDataPath(userId), filename);
  try { return JSON.parse(await fs.readFile(p, 'utf-8')); } catch { return DEFAULTS[filename] || {}; }
}
async function writeUserData(userId, filename, data) {
  const dir = getUserDataPath(userId); await ensureDir(dir);
  await fs.writeFile(path.join(dir, filename), JSON.stringify(data, null, 2) + '\n', 'utf-8');
}
const getUserSettings = (u) => readUserData(u, 'settings.json');
const saveUserSettings = (u, d) => writeUserData(u, 'settings.json', d);
const getUserMemory = (u) => readUserData(u, 'memory.json');
const saveUserMemory = (u, d) => writeUserData(u, 'memory.json', d);
const getUserTasks = (u) => readUserData(u, 'tasks.json');
const saveUserTasks = (u, d) => writeUserData(u, 'tasks.json', d);
const getUserResearch = (u) => readUserData(u, 'research.json');
const saveUserResearch = (u, d) => writeUserData(u, 'research.json', d);
const getUserConversationPath = (u) => path.join(getUserDataPath(u), 'conversations');
const getUserReportsPath = (u) => path.join(getUserDataPath(u), 'reports');
module.exports = { DATA_DIR, USERS_DIR, getUserDataPath, readUserData, writeUserData, getUserSettings, saveUserSettings, getUserMemory, saveUserMemory, getUserTasks, saveUserTasks, getUserResearch, saveUserResearch, getUserConversationPath, getUserReportsPath, ensureDir };
