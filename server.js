import express from 'express';
import crypto from 'crypto';
import { Client } from '@notionhq/client';

const app = express();
const { LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, NOTION_TOKEN, PORT = 3000 } = process.env;
const NOTION_DATABASE_ID = '5b370bb5-f935-4573-b452-001c8649e7d4';
const notion = new Client({ auth: NOTION_TOKEN });
const TEDAN_LIST = ['訪問','電話','メール送信','メールリプライ','メール受信','LINE送信','LINEリプライ','LINE受信','オンラインミーティング','GOOGLECHAT','FAX','ショートメール','問い合わせ','ミツモア','Messenger','メール','LINE','予定','データ格納'];

app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

function verifyLineSignature(body, signature) {
  const hash = crypto.createHmac('SHA256', LINE_CHANNEL_SECRET).update(body).digest('base64');
  return hash === signature;
}

function parseMessage(text) {
  const parts = text.trim().split(/\s+/);
  if (parts.length === 1) return { 主会社名: parts[0], 手段: ['データ格納'], 内容: '' };
  const matched = TEDAN_LIST.find(t => parts[1] === t);
  if (matched) return { 主会社名: parts[0], 手段: [matched], 内容: parts.slice(2).join(' ') };
  return { 主会社名: parts[0], 手段: ['データ格納'], 内容: parts.slice(1).join(' ') };
}

async function saveToNotion(parsed) {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = jst.toISOString().split('T')[0];
  const properties = {
    '主会社名': { title: [{ text: { content: parsed.主会社名 || '未分類' } }] },
    '手段': { multi_select: parsed.手段.map(name => ({ name })) },
    '日付（入力用）': { date: { start: today } }
  };
  if (parsed.内容) properties['内容'] = { rich_text: [{ text: { content: parsed.内容 } }] };
  await notion.pages.create({ parent: { type: 'database_id', database_id: NOTION_DATABASE_ID }, properties });
}

async function replyToLine(replyToken, message) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: message }] })
  });
}

app.post('/webhook', async (req, res) => {
  const signature = req.headers['x-line-signature'];
  if (!verifyLineSignature(req.body, signature)) return res.status(401).send('Invalid signature');
  res.status(200).send('OK');
  const body = JSON.parse(req.body.toString());
  for (const event of body.events || []) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;
    const text = event.message.text.trim();
    const replyToken = event.replyToken;
    if (text === 'ヘルプ' || text === 'help') {
      await replyToLine(replyToken, '【送信フォーマット】\n会社名 手段 内容\n\n例1: OCC 訪問 亀井さんと面談\n例2: 東海フィルター 電話 倉知さんに確認\n例3: 社内 就業規則改定の件');
      continue;
    }
    try {
      const parsed = parseMessage(text);
      await saveToNotion(parsed);
      const reply = ['✅ 日報に記録しました！', `📋 会社: ${parsed.主会社名}`, `🔧 手段: ${parsed.手段.join('・')}`, parsed.内容 ? `📝 内容: ${parsed.内容}` : ''].filter(Boolean).join('\n');
      await replyToLine(replyToken, reply);
    } catch (err) {
      await replyToLine(replyToken, `⚠️ エラー: ${err.message}`);
    }
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(PORT, () => console.log(`✅ Bot起動: port ${PORT}`));
