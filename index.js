const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const express = require('express');
const QRCode = require('qrcode');

const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycby2pGi3_Xbisrn22e4D74KUAMtgwm3F6FIfJ-OJEck7sJac6QFWXDfqEh0jqmpA0G6N/exec";

const app = express();
let latestQR = null;

app.get('/', (req,res) => {
  if(latestQR) res.send(`<h1>QR POUR 762662699</h1><img src="${latestQR}" width="350"><br><a href="/">Rafraichir</a>`);
  else res.send(`<h1>✅ BOT 762662699 EN LIGNE</h1><p>Stock lié à Google Sheet</p>`);
});
app.get('/ping', (req,res) => res.send('ok'));
app.listen(process.env.PORT || 10000, () => console.log('Serveur OK'));

async function getStock() {
  const r = await fetch(`${GOOGLE_SHEET_URL}?action=stock`);
  return await r.text();
}
async function vendu(article, qte) {
  const r = await fetch(`${GOOGLE_SHEET_URL}?action=vendu&article=${article}&qte=${qte}`);
  return await r.text();
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const sock = makeWASocket({ auth: state, logger: P({ level: 'silent' }) });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if(qr) { latestQR = await QRCode.toDataURL(qr); console.log('QR READY'); }
    if(connection === 'close') {
      if(lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot();
    }
    if(connection === 'open') { console.log('✅ CONNECTE 762662699'); latestQR = null; }
  });
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if(!msg || !msg.message || msg.key.fromMe) return;
    const from = msg.key.remoteJid;
    let text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').toLowerCase().trim();
    console.log(`Message: ${text}`);
    if(text === 'stock' || text.includes('stock')) {
      let rep = await getStock();
      await sock.sendMessage(from, { text: rep });
    }
    else if(text.startsWith('vendu')) {
      let p = text.split(' ');
      if(p.length >=3) {
        let rep = await vendu(p[1], p[2]);
        await sock.sendMessage(from, { text: rep });
      }
    }
    else if(text === 'menu' || text === 'salam' || text === 'bonjour') {
      await sock.sendMessage(from, { text: "*DTS BOUTIQUE 762662699*\nTape *stock*" });
    }
  });
}
startBot();
