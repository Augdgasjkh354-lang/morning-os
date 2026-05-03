const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/invites', require('./routes/invites'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/memory', require('./routes/memory'));
app.use('/api/research', require('./routes/research'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/portrait', require('./routes/portrait'));
app.use('/api/verify', require('./routes/verify'));
app.use('/', require('./routes/report'));

async function startServer() {
  try {
    const { initDB } = require('./lib/dbInit');
    await initDB();
    console.log('数据库初始化完成');

    const { initAdminUser } = require('./lib/users');
    await initAdminUser();
    console.log('管理员账号检查完成');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`服务已启动，端口：${PORT}`);
    });
  } catch (err) {
    console.error('服务启动失败：', err.message);
    process.exit(1);
  }
}

startServer();
