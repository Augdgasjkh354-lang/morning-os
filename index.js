const express = require('express');
const path = require('path');
const cors = require('cors');
const { initDB } = require('./lib/dbInit');
const { initAdminUser } = require('./lib/users');


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

(async () => {
  try {
    await initDB();
    await initAdminUser();
    app.listen(PORT, () => console.log(`服务已启动，端口：${PORT}`));
  } catch (error) {
    console.error('服务启动失败', error.message);
  }
})();
