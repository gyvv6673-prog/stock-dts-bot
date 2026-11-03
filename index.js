const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const express = require('express');
const QRCode = require('qrcode');

const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycby2pGi3_Xbisrn22e4D74KUAMtgwm3F6FIfJ-OJEck7sJac6QFWXDfqEh0jqmpA0G6N/exec";

const app = express();
let latestQR = null;

app.get('/', (req,res) => {
  if(latestQR) res.send(`<h1>QR POUR 771269905</h1><img src="${latestQR}" width="350"><br><a href="/">Rafraichir</a>`);
  else res.send(`<h1>✅ BOT DTS CONNECTÉ</h1><p>Stock lié à Google Sheet<br>Heure: ${new Date().toLocaleString()}</p>`);
});
app.get('/ping', (req,res) => res.send('ok'));
app.listen(process.env.PORT || 10000, () => console.log('Serveur OK'));

async function getStock() {
  try { const r = await fetch(`${GOOGLE_SHEET_URL}?action=stock`); return await r.text(); }
  catch(e){ return "Erreur Google Sheet"; }
}
async function vendu(article, qte) {
  try { const r = await fetch(`${GOOGLE_SHEET_URL}?action=vendu&article=${article}&qte=${qte}`); return await r.text(); }
  catch(e){ return "Erreur vente"; }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const sock = makeWASocket({ auth: state, logger: P({ level: 'silent' }) });
  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if(qr) { latestQR = await QRCode.toDataURL(qr); console.log('QR -> https://bot-dst.onrender.com'); }
    if(connection === 'close') {
      console.log('DECONNECTE');
      if(lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot();
    }
    if(connection === 'open') { console.log('✅ CONNECTE 771269905'); latestQR = null; }
  });

  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if(!msg || !msg.message || msg.key.fromMe) return;
      const from = msg.key.remoteJid;
      let text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').toLowerCase().trim();
      console.log(`Message: ${text} de ${from}`);

      if(text === 'stock' || text.includes('stock')) {
        let rep = await getStock();
        await sock.sendMessage(from, { text: rep });
      }
      else if(text.startsWith('vendu')) {
        let parts = text.split(' ');
        if(parts.length >=3) {
          let article = parts[1]; let qte = parts[2];
          let rep = await vendu(article, qte);
          await sock.sendMessage(from, { text: rep });
        } else {
          await sock.sendMessage(from, { text: "Utilise: vendu chaussures 1" });
        }
      }
      else if(text === 'menu' || text === 'salam' || text === 'bonjour') {
        await sock.sendMessage(from, { text: "*DTS BOUTIQUE*\nTape *stock* pour voir le stock\nTape *vendu chaussures 1* pour vendre" });
      }
    } catch(e){ console.log('Erreur:', e); }
  });
}
startBot();
setInterval(()=> console.log('Bot vivant'), 1000*60*5);
