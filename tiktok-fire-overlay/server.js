// TikTok LIVE のいいねを受け取り、overlay.html に WebSocket で中継するサーバー
// 使い方: node server.js <TikTokユーザー名(@なし)>
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const tiktok = require('tiktok-live-connector');

const USERNAME = (process.argv[2] || process.env.TIKTOK_USER || '').replace(/^@/, '');
const PORT = +process.env.PORT || 8080;

// v1 / v2 どちらのライブラリでも動くようにする
const Connection = tiktok.TikTokLiveConnection || tiktok.WebcastPushConnection;

// ---- HTTP: overlay.html の配信 + テスト用 /like ----
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/like') {
    const n = Math.max(1, +url.searchParams.get('n') || 1);
    broadcast({ type: 'like', count: n, name: url.searchParams.get('name') || 'テスト' });
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(`いいね +${n} を送信しました`);
  }
  if (url.pathname === '/' || url.pathname === '/overlay.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(path.join(__dirname, 'overlay.html')).pipe(res);
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server });
let lastStatus = '待機中';
function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(data);
}
function setStatus(text) {
  lastStatus = text;
  console.log(text);
  broadcast({ type: 'status', text });
}
wss.on('connection', ws => ws.send(JSON.stringify({ type: 'status', text: lastStatus })));

server.listen(PORT, () => {
  console.log(`オーバーレイURL: http://localhost:${PORT}/`);
  console.log(`テスト送信:     http://localhost:${PORT}/like?n=10`);
});

// ---- TikTok LIVE 接続 ----
if (!USERNAME) {
  setStatus('ユーザー名未指定のためテスト専用モードで起動しました（node server.js ユーザー名）');
} else {
  connectTikTok();
}

function connectTikTok() {
  const conn = new Connection(USERNAME);
  setStatus(`@${USERNAME} のLIVEに接続しています...`);

  conn.connect()
    .then(() => setStatus(`@${USERNAME} のLIVEに接続しました`))
    .catch(err => {
      setStatus(`接続失敗（LIVE配信中か確認してください）: ${err?.message || err}。30秒後に再試行します`);
      setTimeout(connectTikTok, 30000);
    });

  conn.on('like', data => {
    const user = data.user || data; // v2 は data.user、v1 は data 直下
    broadcast({
      type: 'like',
      count: data.likeCount || 1,
      name: user.nickname || user.uniqueId || '',
    });
  });

  let connected = false;
  conn.on('connected', () => { connected = true; });
  conn.on('error', err => console.error('エラー:', err?.message || err));
  conn.on('streamEnd', () => setStatus('LIVEが終了しました'));
  conn.on('disconnected', () => {
    if (!connected) return; // 接続失敗時は catch 側で再試行する
    connected = false;
    setStatus('切断されました。15秒後に再接続します');
    setTimeout(connectTikTok, 15000);
  });
}
