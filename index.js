const express = require('express');
const path = require('path');
const cors = require('cors');
const { initSystem } = require('./lib/users');

const authRoutes = require('./routes/auth');
const inviteRoutes = require('./routes/invites');
const adminRoutes = require('./routes/admin');
const chatRoutes = require('./routes/chat');
const tasksRoutes = require('./routes/tasks');
const memoryRoutes = require('./routes/memory');
const reportRoutes = require('./routes/report');
const researchRoutes = require('./routes/research');
const settingsRoutes = require('./routes/settings');
const conversationsRoutes = require('./routes/conversations');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));

app.use('/api/auth', authRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/research', researchRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/', reportRoutes);

app.listen(PORT, async () => {
  await initSystem();
  console.log(`服务已启动，端口：${PORT}`);
});
