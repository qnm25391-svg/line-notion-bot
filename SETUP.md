# LINE → Notion 日報Bot セットアップガイド

## 概要

LINEでメッセージを送るだけで、Claude APIが内容を解析して  
Notionの「日報」データベースに自動登録するBotです。

---

## ステップ1：LINE Developers でBotを作成

1. https://developers.line.biz/ にアクセス
2. 「コンソール」→「プロバイダー作成」
3. 「チャネル作成」→「Messaging API」を選択
4. チャネル名：`ぶにゅう日報Bot`（任意）
5. 作成後、以下を取得：
   - **チャネルシークレット**（Basic settings）
   - **チャネルアクセストークン**（Messaging API → 長期トークン発行）

---

## ステップ2：Notion Integration を作成

1. https://www.notion.so/my-integrations にアクセス
2. 「New integration」→ 名前：`日報Bot`
3. 「Internal Integration Token」（`ntn_` で始まる）をコピー
4. Notionの「日報」データベースを開き、
   右上「…」→「Connections」→ `日報Bot` を追加

---

## ステップ3：Railway でサーバーをデプロイ

1. https://railway.app にアクセス（GitHubでログイン）
2. 「New Project」→「Deploy from GitHub repo」
3. このフォルダをGitHubにプッシュしてリポジトリを選択
4. 「Variables」タブで環境変数を設定：
   ```
   LINE_CHANNEL_SECRET=...
   LINE_CHANNEL_ACCESS_TOKEN=...
   ANTHROPIC_API_KEY=...
   NOTION_TOKEN=...
   ```
5. デプロイ完了後、「Domains」でURLを取得
   例：`https://line-notion-bot-production.up.railway.app`

---

## ステップ4：LINE Webhook URL を設定

1. LINE DevelopersのMessaging API設定画面へ
2. 「Webhook URL」に以下を入力：
   ```
   https://あなたのURL.railway.app/webhook
   ```
3. 「Verify」ボタンで接続確認（✅ Success が出ればOK）
4. 「Use webhook」をONに切り替え
5. 「Auto-reply messages」をOFFに設定（重要）

---

## 使い方

LINEでBotに以下のようなメッセージを送るだけで日報に記録されます：

```
OCC訪問 亀井さんと育休手続き確認
```
```
東海フィルター 電話 倉知さんに生産データ確認
```
```
社内 就業規則改定 Article16の残業手当条項を修正
```

Botから確認メッセージが届き、Notionの日報DBに登録されます：
```
✅ 日報に記録しました！

📋 会社: OCC
📝 内容: 亀井さんと育休手続きの確認
🔧 手段: 訪問
🏷 KW: 育休,亀井,手続き
```

---

## 日報DBのフィールドマッピング

| Notionフィールド | 自動設定内容 |
|---|---|
| 主会社名（タイトル） | Claudeが抽出した会社名 |
| 内容 | Claudeが整理した業務内容 |
| 手段 | Claudeが判定した手段（複数可） |
| 日付（入力用） | メッセージ送信日 |
| 従会社名 | サブのクライアント（検出時のみ） |
| キーワード | 1〜3個のキーワード |

---

## コスト目安

| サービス | 費用 |
|---|---|
| LINE Messaging API | 無料（月1,000通まで） |
| Railway | 無料枠あり（月500時間） |
| Claude API | 約0.003円/メッセージ（Sonnet） |
| Notion API | 無料 |

---

## トラブルシューティング

**署名エラー（401）が出る**  
→ `LINE_CHANNEL_SECRET` が間違っている可能性。Developerコンソールで再確認。

**Notionに保存されない**  
→ IntegrationをNotionのDBに「接続」しているか確認。

**Botが返信しない**  
→ Railway側のログ（Deploy logs）を確認。エラー内容が表示される。
