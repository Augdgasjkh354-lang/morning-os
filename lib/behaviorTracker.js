const fs = require('fs').promises;
const path = require('path');
const { getUserDataPath } = require('./userData');

async function trackInteraction(userId, event) {
  const trackPath = path.join(getUserDataPath(userId), 'behavior_log.jsonl');
  const line = JSON.stringify({ ...event, timestamp: new Date().toISOString() }) + '\n';
  await fs.mkdir(getUserDataPath(userId), { recursive: true }).catch(() => {});
  await fs.appendFile(trackPath, line).catch(() => {});
}

module.exports = { trackInteraction };
