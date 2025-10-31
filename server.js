// server.js
// Node.js bridge: reads Arduino serial and emits 'captcha' via Socket.IO
// Usage:
// 1) Install dependencies: npm install
// 2) Start: on Linux/macOS: SERIAL_PATH=/dev/ttyACM0 node server.js
//           on Windows (cmd): set SERIAL_PATH=COM3 && node server.js
//           or edit SERIAL_PATH default below.
const path = require('path');
const express = require('express');
const http = require('http');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const socketio = require('socket.io');

const SERIAL_PATH = process.env.SERIAL_PATH || 'COM15'; // change if needed
const BAUD_RATE = Number(process.env.BAUD) || 9600;
const PORT = Number(process.env.PORT) || 3000;

const app = express();
const server = http.createServer(app);
const io = socketio(server);

let lastCaptcha = null;

app.use(express.static(path.join(__dirname, 'public')));

// Simple API to read last known CAPTCHA (optional)
app.get('/api/captcha', (req, res) => {
  res.json({ captcha: lastCaptcha });
});

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));

function startSerial() {
  try {
    const sp = new SerialPort({ path: SERIAL_PATH, baudRate: BAUD_RATE, autoOpen: false });
    const parser = sp.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    sp.open(err => {
      if (err) {
        console.error('Failed to open serial port:', err.message || err);
        return;
      }
      console.log(`Serial open on ${SERIAL_PATH} @ ${BAUD_RATE}`);
    });

    parser.on('data', line => {
      const text = String(line || '').trim();
      console.log('[Serial]', text);
      io.emit('serial', text);
      if (text.startsWith('CAPTCHA:')) {
        const captcha = text.split(':').slice(1).join(':').trim();
        lastCaptcha = captcha;
        io.emit('captcha', captcha);
      }
    });

    sp.on('error', err => {
      console.error('Serial error:', err);
    });

    sp.on('close', () => {
      console.warn('Serial port closed; attempting to reopen in 3s...');
      setTimeout(() => startSerial(), 3000);
    });
  } catch (err) {
    console.error('Error while starting serial:', err);
  }
}

startSerial();

io.on('connection', socket => {
  console.log('Client connected', socket.id);
  if (lastCaptcha) socket.emit('captcha', lastCaptcha);
  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
  });
});