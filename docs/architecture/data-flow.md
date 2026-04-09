# データフロー

## search_speeches フロー

```
MCP Client
  │ search_speeches({ query, speaker, from, until, limit })
  ▼
tools/searchSpeeches.ts
  │ バリデーション
  ▼
services/kokkaiApi.ts
  │ キャッシュキー生成
  ├─ [HIT] cache.ts → 返却
  └─ [MISS] HTTPS GET https://kokkai.ndl.go.jp/api/speech
              ?any=<query>&speaker=<speaker>&from=<from>
              &until=<until>&maximumRecords=<limit>&recordPacking=json
              ↓
            レスポンス JSON → SpeechItem[] へ変換
            → cache.ts に保存 (TTL: 1日)
  ▼
SearchResult { total, items[] }
  ▼
MCP Client
```

## get_meeting フロー

```
MCP Client
  │ get_meeting({ issueID })
  ▼
tools/getMeeting.ts
  │ issueID 必須チェック
  ▼
services/kokkaiApi.ts
  │ キャッシュキー = "meeting:{issueID}"
  ├─ [HIT] cache.ts → 返却
  └─ [MISS] HTTPS GET https://kokkai.ndl.go.jp/api/meeting
              ?issueID=<issueID>&recordPacking=json
              ↓
            レスポンス JSON → MeetingRecord へ変換
            → cache.ts に保存 (TTL: 7日)
  ▼
MeetingRecord { issueID, date, nameOfMeeting, speeches[] }
  ▼
MCP Client
```

## summarize_speeches フロー

```
MCP Client
  │ summarize_speeches({ items[], mode, focus })
  ▼
tools/summarizeSpeeches.ts
  │ 件数上限チェック（> 200 件 → TooManyItemsError）
  │ キャッシュキー生成（items ハッシュ + mode + focus）
  ├─ [HIT] cache.ts → 返却
  └─ [MISS]
       ▼
     services/preprocess.ts
       │ 1. 形式的発言除外
       │ 2. 短発言除外（< 20文字）
       │ 3. 同一話者連続発言結合
       │ 4. 重要度スコアリング
       │ 5. チャンク分割（8000文字 or 20発言）
       ▼
     services/summarizer.ts
       │ チャンクごとに Anthropic API 呼び出し（部分要約）
       │ 全部分要約を統合 → 最終統合要約（Anthropic API）
       │ JSON レスポンス → SummaryResult へ変換
       ▼
     cache.ts に保存 (TTL: 7日)
  ▼
SummaryResult { overview, main_points[], speaker_points{}, conclusion, caution? }
  ▼
MCP Client
```

## summarize_meeting フロー

```
MCP Client
  │ summarize_meeting({ issueID, mode, focus })
  ▼
tools/summarizeMeeting.ts
  │ キャッシュキー = "summary:{issueID}:{mode}:{focus}"
  ├─ [HIT] cache.ts → 返却
  └─ [MISS]
       ▼
     （内部で get_meeting を呼び出し）
     services/kokkaiApi.ts → MeetingRecord
       ▼
     services/preprocess.ts → チャンク配列
       ▼
     services/summarizer.ts → SummaryResult
       ▼
     cache.ts に保存 (TTL: 7日)
  ▼
SummaryResult + issueID
  ▼
MCP Client
```

## エラーフロー

```
エラー発生箇所          エラークラス           MCP レスポンス
─────────────────────────────────────────────────────────────
kokkaiApi.ts (5xx/TO)  KokkaiApiError         retryable: true
summarizer.ts (LLM失敗) LlmApiError            retryable: true
tools/* (入力不正)      ValidationError        retryable: false
tools/* (件数過多)      TooManyItemsError      retryable: false
kokkaiApi.ts (0件)      NotFoundError          retryable: false
```
