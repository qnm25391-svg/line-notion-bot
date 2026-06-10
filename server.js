/**
 * LINE → Claude → Notion 日報Bot
 * 
 * 【対応フォーマット例】
 *   OCC訪問 亀井さんと育休手続き確認
 *   東海フィルター 電話 倉知さんに書類確認
 *   OCC メール 就業規則改定の件
 */

import express from 'express';
import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@notionhq/client';

const app = express();

// ========================
// 環境変数
// ========================
const {
  LINE_CHANNEL_SECRET,
  LINE_CHANNEL_ACCESS_TOKEN,
  ANTHROPIC_API_KEY,
  NOTION_TOKEN,
  PORT = 3000
} = process.env;

// ========================
// Notionの日報DBのdata_source_id
// ========================
const NOTION_DATASOURCE_ID = '0b9c88a0-e4d8-4779-840b-039e3d68d57f';

// ========================
// クライアント初期化
// ========================
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const notion = new Client({ auth: NOTION_TOKEN });

// ========================
// LINE署名検証
// ========================
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

function verifyLineSignature(body, signature) {
  const hash = crypto
    .createHmac('SHA256', LINE_CHANNEL_SECRET)
    .update(body)
    .digest('base64');
  return hash === signature;
}

// ========================
// Claude APIでメッセージを解析
// ========================
async function parseMessage(text) {
  const today = new Date().toISOString().split('T')[0];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `以下のLINEメッセージを解析して、Notionの日報データベース用にJSONで返してください。

メッセージ：「${text}」

抽出するフィールド：
- 主会社名: 主なクライアント会社名（例: 株式会社OCC → OCC、東海フィルターエンジニアリング）
- 従会社名: サブのクライアントや関係先（なければ空文字）
- 内容: 業務内容の説明
- 手段: 以下から最も近いものを選択 → ["訪問","電話","メール送信","メールリプライ","メール受信","LINE送信","LINEリプライ","LINE受信","オンラインミーティング","GOOGLECHAT","FAX","ショートメール","問い合わせ","ミツモア","Messenger","予定","データ格納"]
  （不明な場合は "データ格納"）
- キーワード: 1〜3個のキーワード（カンマ区切り）

今日の日付: ${today}

必ずJSON形式のみで返してください。余分なテキスト不要。
{
  "主会社名": "",
  "従会社名": "",
  "内容": "",
  "手段": [""],
  "キーワード": ""
}`
    }]
  });

  const raw = response.content[0].text.trim();
  const json = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(json);
}

// ========================
// Notionの日報DBに保存
// ========================
async function saveToNotion(parsed, originalText) {
  const today = new Date().toISOString().split('T')[0];

  const properties = {
    '主会社名': {
      title: [{ text: { content: parsed.主会社名 || '未分類' } }]
    },
    '内容': {
      rich_text: [{ text: { content: parsed.内容 || originalText } }]
    },
    '手段': {
      multi_select: (parsed.手段 || ['データ格納']).map(name => ({ name }))
    },
    '日付（入力用）': {
      date: { start: today }
    }
  };

  if (parsed.従会社名) {
    properties['従会社名'] = {
      rich_text: [{ text: { content: parsed.従会社名 } }]
    };
  }

  if (parsed.キーワード) {
    properties['キーワード'] = {
      rich_text: [{ text: { content: parsed.キーワード } }]
    };
  }

  const page = await notion.pages.create({
    parent: {
      type: 'database_id',
      database_id: NOTION_DATASOURCE_ID
    },
    properties
  });

  return page.id;
}

// ========================
// LINEへ返信
// ========================
async function replyToLine(replyToken, message) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text: message }]
    })
  });
}

// ========================
// Webhookエンドポイント
// ========================
app.post('/webhook', async (req, res) => {
  // LINE署名検証
  const signature = req.headers['x-line-signature'];
  if (!verifyLineSignature(req.body, signature)) {
    return res.status(401).send('Invalid signature');
  }

  res.status(200).send('OK'); // LINEには即座に200を返す

  const body = JSON.parse(req.body.toString());
  const events = body.events || [];

  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;

    const text = event.message.text.trim();
    const replyToken = event.replyToken;

    try {
      // Claude APIで解析
      const parsed = await parseMessage(text);

      // Notionに保存
      const pageId = await saveToNotion(parsed, text);

      // 確認メッセージを返信
      const reply = [
        '✅ 日報に記録しました！',
        '',
        `📋 会社: ${parsed.主会社名}`,
        `📝 内容: ${parsed.内容}`,
        `🔧 手段: ${(parsed.手段 || []).join('・')}`,
        parsed.キーワード ? `🏷 KW: ${parsed.キーワード}` : '',
      ].filter(Boolean).join('\n');

      await replyToLine(replyToken, reply);

    } catch (err) {
      console.error('処理エラー:', err);
      await replyToLine(replyToken, `⚠️ エラーが発生しました。\n${err.message}`);
    }
  }
});

// ========================
// ヘルスチェック
// ========================
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`✅ LINEBot起動: http://localhost:${PORT}`);
});
