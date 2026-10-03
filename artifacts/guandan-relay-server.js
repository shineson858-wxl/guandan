/**
 * 掼蛋房间中继（可选部署在 www.gxtech.com）
 * 用法：
 *   npm i ws
 *   node guandan-relay-server.js
 * 默认端口 3088。Nginx 反代示例：
 *   location /guandan-ws/ {
 *     proxy_pass http://127.0.0.1:3088/;
 *     proxy_http_version 1.1;
 *     proxy_set_header Upgrade $http_upgrade;
 *     proxy_set_header Connection "upgrade";
 *     proxy_set_header Host $host;
 *   }
 */
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3088;
const rooms = new Map(); // code -> Set of ws

const server = http.createServer((_, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('GalaxyTECK Guandan Relay OK\n');
});

const wss = new WebSocketServer({ server });

function roomList(code) {
  if (!rooms.has(code)) rooms.set(code, new Set());
  return rooms.get(code);
}

wss.on('connection', (ws) => {
  ws.roomCode = null;
  ws.role = null;
  ws.seatId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (!msg || !msg.type) return;

    if (msg.type === 'join') {
      const code = String(msg.roomCode || '').trim();
      if (!/^\d{6}$/.test(code)) {
        ws.send(JSON.stringify({ type: 'error', text: '房间号无效' }));
        return;
      }
      // 离开旧房
      if (ws.roomCode) {
        const old = rooms.get(ws.roomCode);
        if (old) { old.delete(ws); if (!old.size) rooms.delete(ws.roomCode); }
      }
      ws.roomCode = code;
      ws.role = msg.role === 'host' ? 'host' : 'guest';
      const set = roomList(code);
      // 房主唯一
      if (ws.role === 'host') {
        for (const peer of set) {
          if (peer.role === 'host' && peer !== ws) {
            try { peer.send(JSON.stringify({ type: 'error', text: '房主已在其他页打开，旧连接被替换' })); } catch {}
            set.delete(peer);
            try { peer.close(); } catch {}
          }
        }
      }
      set.add(ws);
      ws.send(JSON.stringify({ type: 'joined', roomCode: code, role: ws.role, members: set.size }));
      // 通知房内其他人
      for (const peer of set) {
        if (peer !== ws && peer.readyState === 1) {
          peer.send(JSON.stringify({ type: 'peer_join', role: ws.role, members: set.size }));
        }
      }
      return;
    }

    // 房间内转发（带发送者角色）
    if (!ws.roomCode) return;
    const set = rooms.get(ws.roomCode);
    if (!set) return;
    const payload = JSON.stringify({ ...msg, _fromRole: ws.role, _fromSeat: ws.seatId });
    for (const peer of set) {
      if (peer !== ws && peer.readyState === 1) {
        try { peer.send(payload); } catch {}
      }
    }
  });

  ws.on('close', () => {
    if (!ws.roomCode) return;
    const set = rooms.get(ws.roomCode);
    if (!set) return;
    set.delete(ws);
    for (const peer of set) {
      if (peer.readyState === 1) {
        try { peer.send(JSON.stringify({ type: 'peer_leave', role: ws.role, members: set.size })); } catch {}
      }
    }
    if (!set.size) rooms.delete(ws.roomCode);
  });
});

server.listen(PORT, () => {
  console.log(`[Guandan Relay] ws://0.0.0.0:${PORT}  rooms ready`);
});
