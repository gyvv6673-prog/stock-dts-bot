index.js const { default: makeWASocket, useMultiFileAuthState, downloadMediaMessage, DisconnectReason } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const P = require("pino")({ level: "silent" });
// Petit serveur pour que Render ne dise pas "Deploy failed"
const express = require('express');
const app = express();
app.get('/', (req,res) => res.send('BOT STOCK DTS en ligne - 771269905'));
app.listen(process.env.PORT || 10000, () => console.log('Serveur web OK sur port '+ (process.env.PORT || 10000)));
let STOCK = {};
if(fs.existsSync("stock.json")) STOCK = JSON.parse(fs.readFileSync("stock.json"));

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const sock = makeWASocket({ auth: state, logger: P, printQRInTerminal: false });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect, qr } = u;
    if(qr) { console.log("=== SCANNE CE QR AVEC 771269905 ==="); qrcode.generate(qr, { small: true }); }
    if(connection === 'open') console.log("✅ BOT CONNECTÉ - 771269905 peut être éteint maintenant");
    if(connection === 'close' && lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) start();
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if(!m.message) return;
    const from = m.key.remoteJid;
    const text = m.message.conversation || m.message.extendedTextMessage?.text || m.message.documentMessage?.caption || "";
    
    console.log(`Message de ${from}: ${text.substring(0,50)}`);

    // AFFICHE L'ID DE TES GROUPES DANS LES LOGS
    if(from.endsWith("@g.us")) console.log(`ID GROUPE DETECTÉ: ${from} - Nom: ${m.pushName} - Texte: ${text}`);

    // 1. SI MESSAGE DANS STOCK DTS AVEC FICHIER = SAUVEGARDE
    if(m.message.documentMessage){
      let doc = m.message.documentMessage;
      let ref = (doc.caption || doc.fileName || "").split('.')[0].toUpperCase().trim(); // REF12
      if(!ref.startsWith("REF")) ref = "REF" + Date.now();
      let buffer = await downloadMediaMessage(m, 'buffer', {}, { logger: P });
      STOCK[ref] = { buffer: buffer.toString('base64'), fileName: doc.fileName || ref+".dst" };
      fs.writeFileSync("stock.json", JSON.stringify(STOCK));
      console.log(`✅ STOCK AJOUTÉ: ${ref} - ${doc.fileName}`);
      await sock.sendMessage(from, { text: `✅ ${ref} ajouté au stock Render. Stock total: ${Object.keys(STOCK).length}` });
    }

    // 2. SI COMMANDE VALIDE DEPUIS TON SITE
    if(text.includes("COMMANDE VALIDE")){
      try {
        let refMatch = text.match(/Ref:(REF[0-9A-Z]+)/i);
        let clientMatch = text.match(/Client:(221[0-9]+)/);
        if(!refMatch || !clientMatch) return;
        let ref = refMatch[1].toUpperCase();
        let clientNum = clientMatch[1] + "@s.whatsapp.net";
        
        console.log(`COMMANDE: ${ref} pour ${clientNum}`);

        if(!STOCK[ref]){
          await sock.sendMessage(from, { text: `❌ Stock ${ref} introuvable. Vérifie groupe STOCK DTS` });
          await sock.sendMessage(clientNum, { text: `Désolé, le fichier ${ref} n'est pas encore dans le stock STOCK DTS. Contacte 771269905` });
          return;
        }

        let file = STOCK[ref];
        let buff = Buffer.from(file.buffer, 'base64');
        await sock.sendMessage(clientNum, { document: buff, mimetype: 'application/octet-stream', fileName: file.fileName });
        await sock.sendMessage(clientNum, { text: `✅ Voici ton fichier *${ref}* depuis STOCK DTS ! Merci pour ton achat 1000F. ID validé.` });
        await sock.sendMessage(from, { text: `✅ ${ref} envoyé à ${clientMatch[1]}` });
        console.log(`ENVOYÉ ${ref} à ${clientNum}`);
      } catch(e){ console.log("Erreur commande", e); }
    }
  });
}
start();
