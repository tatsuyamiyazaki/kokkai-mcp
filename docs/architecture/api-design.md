# MCP ツール API 仕様

## 共通事項

- プロトコル: MCP (Model Context Protocol)
- Transport: stdio
- エラーレスポンス: MCP 標準の `isError: true` テキストコンテンツ形式

---

## ツール 1: `search_speeches`

### 説明

発言単位で国会議事録を検索する。
キーワード・発言者・会議名・期間を組み合わせて条件指定できる。

### 入力スキーマ (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "本文検索キーワード（AND 検索）"
    },
    "speaker": {
      "type": "string",
      "description": "発言者名（部分一致）"
    },
    "nameOfMeeting": {
      "type": "string",
      "description": "会議名（部分一致）"
    },
    "from": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
      "description": "検索開始日 (YYYY-MM-DD)"
    },
    "until": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
      "description": "検索終了日 (YYYY-MM-DD)"
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "default": 10,
      "description": "最大取得件数（既定: 10）"
    }
  },
  "additionalProperties": false
}
```

制約: `query`, `speaker`, `nameOfMeeting` の少なくとも 1 つが必須。

### 出力 (JSON テキスト)

```json
{
  "total": 42,
  "items": [
    {
      "speechID": "120615001X00020241001001",
      "issueID": "120615001X0002024100",
      "date": "2024-10-01",
      "nameOfMeeting": "衆議院 本会議",
      "speaker": "田中太郎",
      "speech": "...発言本文（最大 500 文字）...",
      "speechOrder": 3
    }
  ]
}
```

---

## ツール 2: `get_meeting`

### 説明

会議録識別子 (issueID) を指定して会議録全体を取得する。

### 入力スキーマ (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "issueID": {
      "type": "string",
      "description": "会議録識別子（search_speeches の items[].issueID から取得）"
    }
  },
  "required": ["issueID"],
  "additionalProperties": false
}
```

### 出力 (JSON テキスト)

```json
{
  "issueID": "120615001X0002024100",
  "date": "2024-10-01",
  "nameOfMeeting": "衆議院 本会議",
  "speeches": [
    {
      "speechID": "120615001X00020241001001",
      "issueID": "120615001X0002024100",
      "date": "2024-10-01",
      "nameOfMeeting": "衆議院 本会議",
      "speaker": "議長 鈴木一郎",
      "speech": "...発言本文...",
      "speechOrder": 1
    }
  ]
}
```

---

## ツール 3: `summarize_speeches`

### 説明

発言一覧を入力として要約を生成する。
`search_speeches` の出力を直接渡して利用することを想定。

### 入力スキーマ (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "speechID": { "type": "string" },
          "issueID": { "type": "string" },
          "date": { "type": "string" },
          "nameOfMeeting": { "type": "string" },
          "speaker": { "type": "string" },
          "speech": { "type": "string" },
          "speechOrder": { "type": "integer" }
        },
        "required": ["speechID", "issueID", "speaker", "speech"]
      },
      "minItems": 1,
      "maxItems": 200,
      "description": "要約対象の発言一覧"
    },
    "mode": {
      "type": "string",
      "enum": ["brief", "standard", "detailed"],
      "default": "standard",
      "description": "要約モード（brief: 短め・低コスト / standard: 標準 / detailed: 詳細）"
    },
    "focus": {
      "type": "string",
      "description": "要約の焦点（例: '生成AI規制', '財政政策'）。省略可"
    }
  },
  "required": ["items"],
  "additionalProperties": false
}
```

### 出力 (JSON テキスト)

```json
{
  "overview": "本会議では生成AI規制について議論が行われた。...",
  "main_points": [
    "論点1: ...",
    "論点2: ..."
  ],
  "speaker_points": {
    "田中大臣": "...",
    "山田委員": "..."
  },
  "conclusion": "審議は継続となった。...",
  "caution": "一部の発言は文脈が不明確なため、原文の確認を推奨する。"
}
```

`caution` は推測が含まれる場合のみ出力する。

---

## ツール 4: `summarize_meeting`

### 説明

会議録識別子を指定して会議録全体を取得・要約する。
`get_meeting` + `summarize_speeches` の連続呼び出しをまとめて行う。

### 入力スキーマ (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "issueID": {
      "type": "string",
      "description": "会議録識別子"
    },
    "mode": {
      "type": "string",
      "enum": ["brief", "standard", "detailed"],
      "default": "standard",
      "description": "要約モード"
    },
    "focus": {
      "type": "string",
      "description": "要約の焦点（省略可）"
    }
  },
  "required": ["issueID"],
  "additionalProperties": false
}
```

### 出力 (JSON テキスト)

```json
{
  "issueID": "120615001X0002024100",
  "overview": "...",
  "main_points": ["..."],
  "speaker_points": { "田中大臣": "..." },
  "conclusion": "..."
}
```

---

## エラーレスポンス仕様

エラー発生時は MCP の `isError: true` コンテンツでテキストを返す。

### エラー形式

```json
{
  "error_type": "KokkaiApiError",
  "message": "国会 API への接続がタイムアウトしました。",
  "retryable": true
}
```

### エラー種別一覧

| error_type | 発生条件 | retryable |
|------------|---------|-----------|
| `KokkaiApiError` | 国会 API が 5xx / タイムアウト | true |
| `LlmApiError` | Anthropic API が失敗 | true |
| `ValidationError` | 入力値が不正（必須項目なし・型不一致） | false |
| `TooManyItemsError` | 発言数が上限（200件）超過 | false |
| `NotFoundError` | 検索結果 0 件、または issueID が存在しない | false |
| `ConfigurationError` | 環境変数未設定（ANTHROPIC_API_KEY 等） | false |
