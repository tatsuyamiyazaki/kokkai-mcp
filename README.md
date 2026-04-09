# kokkai-mcp

国会議事録検索・要約 MCP サーバー

国立国会図書館の[国会会議録検索システム API](https://kokkai.ndl.go.jp/api.html) を利用し、
発言検索・会議録取得・議事録要約を MCP ツールとして提供します。

## 機能

| ツール | 説明 |
|--------|------|
| `search_speeches` | キーワード・発言者・会議名・期間で発言を検索 |
| `get_meeting` | issueID を指定して会議録全体を取得 |
| `summarize_speeches` | 発言一覧を要約（brief / standard / detailed） |
| `summarize_meeting` | 会議録全体を取得して要約 |

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

```bash
cp .env.example .env
# .env を編集して ANTHROPIC_API_KEY を設定する
```

必須の環境変数:

| 変数名 | 説明 |
|--------|------|
| `ANTHROPIC_API_KEY` | Anthropic Claude API キー（https://console.anthropic.com/ で取得）|

### 3. ビルド

```bash
npm run build
```

### 4. Claude Desktop への登録

`claude_desktop_config.json` に以下を追加する:

```json
{
  "mcpServers": {
    "kokkai-mcp": {
      "command": "node",
      "args": ["/path/to/kokkai-mcp/dist/server.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## 開発

```bash
npm run dev      # ホットリロード起動
npm test         # テスト実行
npm run lint     # Lint チェック
npm run build    # ビルド
```

## 使用例

### 発言検索

```
生成AIに関する最近の国会議論を検索してください。
→ search_speeches({ query: "生成AI", from: "2024-01-01", limit: 10 })
```

### 会議録要約

```
issueID の会議録を要約してください。
→ summarize_meeting({ issueID: "...", mode: "standard" })
```

## アーキテクチャ

- Node.js 20+ / TypeScript 5.x
- MCP SDK (stdio transport)
- Anthropic Claude API（claude-3-5-haiku デフォルト）
- メモリキャッシュ（TTL: 発言 1 日、会議録・要約 7 日）

詳細は `docs/architecture/` を参照してください。

## ライセンス

本ソフトウェアの利用にあたっては、
[国会会議録検索システム利用規約](https://kokkai.ndl.go.jp/terms.html) に従うこと。
