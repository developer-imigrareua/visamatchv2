require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

app.use('/linkedin', require('./routes/linkedin'));
app.use('/chat', require('./routes/chat'));
app.use('/lead', require('./routes/lead'));
app.use('/admin', require('./routes/admin'));

app.get('/health', (_, res) => res.json({ ok: true, version: 'v2' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`VisaMatch V2 backend running on :${PORT}`));
