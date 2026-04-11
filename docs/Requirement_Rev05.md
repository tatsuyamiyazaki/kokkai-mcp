# キャッシュ機能 仕様書（第一段階）

## 1. 文書情報

* 文書名: キャッシュ機能 仕様書（第一段階）
* 対象システム: 国会議事録検索・要約MCP
* 版数: 1.0
* 作成日: 2026年4月10日
* 目的: MCPにおける検索・要約・比較処理の再利用を可能にし、応答速度向上とAPIコスト削減を実現する

---

## 2. 背景

本MCPでは、国会会議録検索システムAPIを利用した検索・会議取得・要約・比較処理を行う。
これらの処理は、同一条件で繰り返し実行される可能性が高く、特に要約・比較処理はLLM利用コストを伴う。

そのため、同一条件・同一元データに対する処理結果をキャッシュし、再利用可能にする必要がある。

現時点では外部資料取得機能を持たないため、大容量ファイルの保存や複雑な文書索引は対象外とし、**軽量な二層キャッシュ構成**を採用する。

---

## 3. 目的

本キャッシュ機能の目的は以下の通り。

1. 同一条件の検索結果を再利用する
2. 同一会議取得結果を再利用する
3. 同一要約結果を再利用する
4. 同一比較結果を再利用する
5. MCP再起動後もキャッシュを保持する
6. 要約ロジック変更時に古いキャッシュを適切に無効化する

---

## 4. 対象範囲

### 4.1 対象

* 国会API検索結果のキャッシュ
* 会議録取得結果のキャッシュ
* 要約結果のキャッシュ
* 比較結果のキャッシュ
* メモリキャッシュ
* SQLite 永続キャッシュ
* TTL管理
* version管理
* source_hash管理

### 4.2 対象外

* 外部資料本文の保存
* PDFや大容量ファイルの保存
* ユーザー別キャッシュ管理
* 分散キャッシュ
* PostgreSQL対応
* 監査ログ
* 詳細アクセス分析

---

## 5. 全体構成

本機能は、以下の二層構成とする。

### 5.1 L1キャッシュ

インメモリキャッシュ

役割:

* 直近アクセス結果を高速返却する
* SQLite参照を減らす
* 同一プロセス内での短期再利用を担う

### 5.2 L2キャッシュ

SQLite 永続キャッシュ

役割:

* 再起動後もキャッシュを保持する
* 中期的な再利用を担う
* 要約・比較結果の再生成を抑制する

---

## 6. キャッシュ対象

本MCPでは、以下をキャッシュ対象とする。

### 6.1 検索結果

対象例:

* `search_speeches`
* 比較機能内の期間別検索結果

### 6.2 会議録取得結果

対象例:

* `get_meeting`

### 6.3 要約結果

対象例:

* `summarize_speeches`
* `summarize_meeting`
* 出典付き要約
* 論点別要約
* 発言者比較要約
* 質問・答弁ペア要約

### 6.4 比較結果

対象例:

* 政党別比較
* 時系列比較
* 論点の増減分析

---

## 7. キャッシュ対象外

以下は第一段階では対象外とする。

* 生のLLM APIレスポンス全文
* 内部推論中間データ
* 一時的なチャンク分割結果
* エラー応答
* 空振り検索結果の長期保存

※ ただし、検索結果0件を短TTLで保存することは許容する。

---

## 8. キャッシュキー設計

## 8.1 基本方針

キャッシュキーは、**入力条件を正規化して生成した一意キー**とする。

## 8.2 設計要件

* 同一意味の入力は同一キーになること
* 不要な空白・順不同差異を吸収すること
* モードや出力オプションの違いを区別すること
* 後でハッシュ化可能な構造にすること

## 8.3 キー例

### 検索結果

```text
search_result:query=生成AI|from=2025-01-01|until=2025-12-31|meeting=予算委員会|speaker=
```

### 会議取得

```text
meeting_detail:issueID=abc123
```

### 要約

```text
summary:issueID=abc123|mode=analysis|focus=生成AI|include_topics=true|include_speaker_comparison=true
```

### 質問・答弁ペア要約

```text
qa_pairs:issueID=abc123|focus=生成AI|mode=standard|max_pairs=10
```

### 政党別比較

```text
party_compare:query=生成AI|from=2025-01-01|until=2025-12-31|mode=standard
```

### 論点の増減分析

```text
topic_changes:query=生成AI|period1=2024-01-01_2024-12-31|period2=2025-01-01_2025-12-31|mode=standard
```

## 8.4 ハッシュ化

実装上は、長いキー文字列をそのまま使ってもよいが、必要に応じて SHA-256 等でハッシュ化可能とする。

---

## 9. キャッシュ項目

各キャッシュエントリは以下を持つ。

* `cache_key`
* `cache_type`
* `payload`
* `source_hash`
* `version`
* `created_at`
* `expires_at`
* `last_accessed_at`

---

## 10. 各項目の定義

### 10.1 cache_key

キャッシュを一意に識別するキー

### 10.2 cache_type

データ種別
候補:

* `search_result`
* `meeting_detail`
* `summary`
* `qa_pairs`
* `party_compare`
* `time_compare`
* `topic_changes`

### 10.3 payload

キャッシュする実データ本体
JSON文字列として保存する

### 10.4 source_hash

元データのハッシュ値
元データに差分がある場合にキャッシュ無効化判断へ利用する

### 10.5 version

要約ロジック、比較ロジック、出力形式のバージョン識別子

### 10.6 created_at

作成日時

### 10.7 expires_at

有効期限

### 10.8 last_accessed_at

最終参照日時
キャッシュ掃除や統計用途に使えるよう保持する

---

## 11. source_hash 仕様

## 11.1 目的

入力条件が同じでも、元発言群や会議本文が変わる可能性に対応するため、元データの内容ベースでハッシュを保持する。

## 11.2 生成対象

対象に応じて以下のように生成する。

### 検索結果

* speechID一覧
* issueID一覧
* 発言本文または抜粋
* 日付
* 発言者

### 会議取得

* issueID
* 発言順
* 発言者
* 発言本文

### 要約・比較

* 要約対象となった発言一覧
* 比較対象となった期間別発言一覧

## 11.3 生成方式

* 発言順を固定
* 必須項目を連結
* UTF-8文字列化
* SHA-256でハッシュ化

---

## 12. version 仕様

## 12.1 目的

ロジック変更時に古いキャッシュを区別するために持つ。

## 12.2 version が変わる条件

以下の変更時に version を更新する。

* 要約プロンプト変更
* 出力テンプレート変更
* 出典付与方式変更
* 論点分類ロジック変更
* 比較判定ロジック変更
* 質問・答弁ペアリング方式変更

## 12.3 運用例

* `summary-v1`
* `summary-v2`
* `party-compare-v1`
* `topic-changes-v1`

---

## 13. TTL仕様

## 13.1 基本方針

データ種別ごとにTTLを分ける。

## 13.2 推奨TTL

### 検索結果

* `search_result`: 1日

### 会議取得

* `meeting_detail`: 7日

### 要約結果

* `summary`: 7日
* `qa_pairs`: 7日

### 比較結果

* `party_compare`: 7日
* `time_compare`: 7日
* `topic_changes`: 7日

## 13.3 0件結果

検索結果0件は短めTTLとする。
推奨: 1時間〜6時間

---

## 14. キャッシュ参照フロー

### 14.1 読み取りフロー

1. メモリキャッシュを参照する
2. ヒットした場合、有効期限を確認する
3. 有効なら返却する
4. メモリにない場合、SQLiteを参照する
5. SQLiteにあり有効なら返却する
6. SQLiteヒット時はメモリにも再格納する
7. どちらにもない、または期限切れなら実処理を行う
8. 実処理結果をSQLiteとメモリに保存する

### 14.2 書き込みフロー

1. cache_key を生成する
2. source_hash を生成する
3. version を付与する
4. TTLから expires_at を算出する
5. SQLiteへ保存する
6. メモリキャッシュにも保存する

---

## 15. キャッシュ有効判定

キャッシュは以下の条件をすべて満たした場合のみ有効とする。

1. `cache_key` が一致する
2. `expires_at` が現在時刻以降である
3. `version` が一致する
4. 必要に応じて `source_hash` が一致する

---

## 16. キャッシュ無効化仕様

## 16.1 自動無効化

* 有効期限切れ
* version 不一致
* source_hash 不一致

## 16.2 手動無効化

将来拡張を見据え、以下の単位で削除可能とする。

* `cache_key` 単位削除
* `cache_type` 単位削除
* 全件削除

---

# 17. SQLite 保存仕様

## 17.1 目的

SQLite は、本MCPにおける **第一段階の永続キャッシュ保存先** として利用する。
再起動後も検索結果・会議取得結果・要約結果・比較結果を再利用できるようにすることを目的とする。

SQLite は以下の理由から採用する。

* 導入が容易である
* 単体構成のMCPと相性がよい
* JSON文字列の保存が容易である
* 将来的な PostgreSQL 移行の前段として扱いやすい

## 17.2 テーブル設計方針

第一段階では、キャッシュ用途に必要な最小構成として **単一テーブル方式** を採用する。
検索結果、会議取得結果、要約結果、比較結果は、いずれも `payload` に JSON文字列として保存する。

管理上必要な属性として、以下を保持する。

* キャッシュキー
* キャッシュ種別
* キャッシュ本体
* 元データハッシュ
* ロジックバージョン
* 作成日時
* 有効期限
* 最終参照日時

## 17.3 DDL

```sql
CREATE TABLE IF NOT EXISTS cache_entries (
  cache_key TEXT PRIMARY KEY,
  cache_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  source_hash TEXT,
  version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_accessed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cache_entries_type
  ON cache_entries(cache_type);

CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_at
  ON cache_entries(expires_at);

CREATE INDEX IF NOT EXISTS idx_cache_entries_last_accessed_at
  ON cache_entries(last_accessed_at);
```

## 17.4 カラム定義

### `cache_key`

* 型: `TEXT`
* 主キー
* キャッシュを一意に識別するキー
* 例:

  * `meeting_detail:issueID=abc123`
  * `summary:issueID=abc123|mode=analysis|focus=生成AI`

### `cache_type`

* 型: `TEXT`
* 必須
* キャッシュ種別
* 想定値:

  * `search_result`
  * `meeting_detail`
  * `summary`
  * `qa_pairs`
  * `party_compare`
  * `time_compare`
  * `topic_changes`

### `payload`

* 型: `TEXT`
* 必須
* レスポンスJSONを文字列化して保存する

### `source_hash`

* 型: `TEXT`
* 任意
* 元データの差分検知用ハッシュ値

### `version`

* 型: `TEXT`
* 必須
* ロジックや出力形式のバージョン識別子
* 例:

  * `summary-v1`
  * `topic-changes-v1`

### `created_at`

* 型: `TEXT`
* 必須
* キャッシュ生成日時
* ISO 8601 形式で保存する

### `expires_at`

* 型: `TEXT`
* 必須
* キャッシュ有効期限
* ISO 8601 形式で保存する

### `last_accessed_at`

* 型: `TEXT`
* 任意
* 最終参照日時
* キャッシュ掃除や将来の統計用途に利用する

## 17.5 保存値の形式

### 日時形式

日時はすべて **ISO 8601 文字列** で保存する。

例:

```text
2026-04-10T10:30:00Z
```

### payload形式

`payload` は MCP が最終返却する JSON を、そのまま文字列化して保存する。

例:

```json
{
  "overview": "生成AIに関する議論では安全性と活用促進が主な論点となった。",
  "topics": [
    {
      "topic": "安全性",
      "summary": "誤情報や権利侵害への懸念が示された。"
    }
  ]
}
```

## 17.6 推奨制約・運用ルール

### 1. `cache_key` は正規化後の値を使用する

同一意味の入力条件が別キーにならないよう、キー生成前に以下を正規化する。

* 前後空白除去
* 未指定項目の統一
* 真偽値の表記統一
* 日付形式の統一
* 配列順序の安定化

### 2. `payload` はUTF-8文字列として保存する

SQLite 側では `TEXT` として扱う。

### 3. `source_hash` がない場合でも保存可能とする

検索結果などで元データ差分判定が不要な場合は `NULL` を許容する。

### 4. `last_accessed_at` は参照時に更新する

L1/L2キャッシュの利用傾向把握や将来の掃除ポリシー拡張に備える。

## 17.7 推奨アップサートSQL

キャッシュ保存時は、既存キーがある場合に更新できるよう、以下のSQLを利用する。

```sql
INSERT INTO cache_entries (
  cache_key,
  cache_type,
  payload,
  source_hash,
  version,
  created_at,
  expires_at,
  last_accessed_at
)
VALUES (
  :cache_key,
  :cache_type,
  :payload,
  :source_hash,
  :version,
  :created_at,
  :expires_at,
  :last_accessed_at
)
ON CONFLICT(cache_key) DO UPDATE SET
  cache_type = excluded.cache_type,
  payload = excluded.payload,
  source_hash = excluded.source_hash,
  version = excluded.version,
  created_at = excluded.created_at,
  expires_at = excluded.expires_at,
  last_accessed_at = excluded.last_accessed_at;
```

## 17.8 推奨参照SQL

### 有効なキャッシュ取得

```sql
SELECT
  cache_key,
  cache_type,
  payload,
  source_hash,
  version,
  created_at,
  expires_at,
  last_accessed_at
FROM cache_entries
WHERE cache_key = :cache_key
  AND expires_at > :now;
```

### 最終参照日時更新

```sql
UPDATE cache_entries
SET last_accessed_at = :last_accessed_at
WHERE cache_key = :cache_key;
```

## 17.9 推奨削除SQL

### 期限切れキャッシュ削除

```sql
DELETE FROM cache_entries
WHERE expires_at <= :now;
```

### 種別単位削除

```sql
DELETE FROM cache_entries
WHERE cache_type = :cache_type;
```

### 個別削除

```sql
DELETE FROM cache_entries
WHERE cache_key = :cache_key;
```

### 全件削除

```sql
DELETE FROM cache_entries;
```

## 17.10 将来拡張時の互換方針

第一段階では単一テーブルで十分だが、将来的に以下のような分割が可能な設計とする。

* `cache_entries`
  共通キャッシュ
* `cache_metadata`
  統計・監査用途
* `document_store`
  大容量本文格納
* `cache_access_logs`
  利用頻度分析

そのため、現時点でも `cache_type`、`version`、`source_hash` を明示的に保持する。

---

## 18. メモリキャッシュ仕様

## 18.1 役割

* 直近アクセスの高速化
* SQLite参照回数の削減

## 18.2 実装方針

* `Map<string, CacheEntry>` 形式を想定
* 一定件数超過時に古いものから削除可能
* 第一段階では単純なTTL管理で十分

## 18.3 件数制限

推奨:

* 100〜500件程度

---

## 19. payload の内容方針

payload には、MCPが最終的に返すレスポンスJSONを基本そのまま保存する。

### 例

* 検索結果JSON
* 会議詳細JSON
* 要約結果JSON
* 政党別比較結果JSON
* 論点増減分析結果JSON

中間計算用の一時データは原則保存しない。

---

## 20. エラー処理

以下のケースに対応すること。

### 20.1 SQLite読み取り失敗

* キャッシュなしとして実処理へフォールバックする

### 20.2 SQLite書き込み失敗

* 処理本体の結果返却は継続する
* ログ出力のみ行う

### 20.3 payload JSON破損

* 当該キャッシュを破棄する
* 再生成する

### 20.4 version 不一致

* キャッシュミス扱いにする

---

## 21. クリーンアップ仕様

第一段階では、期限切れキャッシュの削除は以下のいずれかで対応する。

* 起動時に削除
* 一定回数アクセスごとに削除
* 書き込み時に期限切れを掃除

本格的なバッチ掃除は第二段階以降とする。

---

## 22. 非機能要件

### 22.1 性能

* キャッシュヒット時は実処理より明確に高速であること
* 同一要約の再生成を避けられること

### 22.2 保守性

* キャッシュキー生成
* SQLite操作
* メモリキャッシュ
* TTL/無効化ポリシー

をモジュール分離すること

### 22.3 拡張性

将来的に以下へ拡張可能な構造とする。

* ファイルキャッシュ
* PostgreSQL
* 外部資料キャッシュ
* ユーザー別キャッシュ
* 監査ログ

---

## 23. 推奨モジュール構成

* `cacheKeyBuilder.ts`

  * キャッシュキー生成

* `cacheStore.ts`

  * SQLite保存・取得

* `memoryCache.ts`

  * L1キャッシュ管理

* `cachePolicy.ts`

  * TTL、version、source_hash判定

* `cacheCleaner.ts`

  * 期限切れ削除

---

## 24. 受入条件

以下を満たした場合、本機能は受入可能とする。

1. 同一検索条件で検索結果が再利用されること
2. 同一会議取得で会議詳細が再利用されること
3. 同一要約条件で要約結果が再利用されること
4. 同一比較条件で比較結果が再利用されること
5. version 不一致時に再生成されること
6. TTL切れ時に再生成されること
7. MCP再起動後もSQLiteから再利用できること

---

## 25. 補足方針

現段階では、キャッシュは**「コスト削減」と「応答高速化」のための実用品**として位置づける。
過度に大がかりな仕組みにはせず、今のMCPに必要な範囲に絞って実装する。
まずは軽く、しかしキー・version・source_hash だけは手を抜かない。
家は平屋でもよいが、基礎だけは真っすぐに、という方針で進める。
