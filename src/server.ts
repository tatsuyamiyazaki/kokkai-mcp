import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { logger } from './utils/logger.js'
import { getCacheCleaner } from './services/cacheCleaner.js'
import { handleSearchSpeeches } from './tools/searchSpeeches.js'
import { handleGetMeeting } from './tools/getMeeting.js'
import { handleSummarizeSpeeches } from './tools/summarizeSpeeches.js'
import { handleSummarizeMeeting } from './tools/summarizeMeeting.js'
import { handleCompareOverTime } from './tools/compareOverTime.js'
import { handleSummarizeQaPairs } from './tools/summarizeQaPairs.js'
import { handleCompareByParty } from './tools/compareByParty.js'
import { handleAnalyzeTopicChanges } from './tools/analyzeTopicChanges.js'


const server = new McpServer({
  name: 'kokkai-mcp',
  version: '0.1.0',
})

// --- search_speeches ---
server.tool(
  'search_speeches',
  '国会議事録から発言を検索します。キーワード・発言者・会議名・期間を組み合わせて条件指定できます。',
  {
    query: z.string().optional().describe('本文検索キーワード（AND 検索）'),
    speaker: z.string().optional().describe('発言者名（部分一致）'),
    nameOfMeeting: z.string().optional().describe('会議名（部分一致）'),
    from: z.string().optional().describe('検索開始日 (YYYY-MM-DD)'),
    until: z.string().optional().describe('検索終了日 (YYYY-MM-DD)'),
    limit: z.number().int().min(1).max(100).default(10).describe('最大取得件数（既定: 10）'),
  },
  (args) => handleSearchSpeeches(args),
)

// --- get_meeting ---
server.tool(
  'get_meeting',
  '会議録識別子 (issueID) を指定して会議録全体を取得します。search_speeches の items[].issueID を使用してください。',
  {
    issueID: z.string().min(1).describe('会議録識別子（search_speeches の items[].issueID から取得）'),
  },
  (args) => handleGetMeeting(args),
)

// --- summarize_speeches ---
const SpeechItemShape = z.object({
  speechID: z.string(),
  issueID: z.string(),
  date: z.string().optional(),
  nameOfMeeting: z.string().optional(),
  speaker: z.string(),
  speech: z.string(),
  speechOrder: z.number().int().optional(),
})

server.tool(
  'summarize_speeches',
  '発言一覧を入力として要約を生成します。search_speeches の出力をそのまま渡せます。mode で詳細度を指定し、focus で焦点を絞ることができます。',
  {
    items: z
      .array(SpeechItemShape)
      .min(1)
      .max(200)
      .describe('要約対象の発言一覧（search_speeches の items フィールドをそのまま渡せます）'),
    mode: z
      .enum(['brief', 'standard', 'detailed'])
      .default('standard')
      .describe('要約モード: brief（短く低コスト）/ standard（標準）/ detailed（詳細、コスト高）'),
    focus: z
      .string()
      .optional()
      .describe('要約の焦点（例: "生成AI規制", "財政政策"）。省略可'),
  },
  (args) => handleSummarizeSpeeches(args),
)

// --- summarize_meeting ---
server.tool(
  'summarize_meeting',
  '会議録識別子 (issueID) を指定して会議録全体を取得・要約します。get_meeting + summarize_speeches を内部でまとめて実行します。',
  {
    issueID: z
      .string()
      .min(1)
      .describe('会議録識別子（search_speeches の items[].issueID から取得）'),
    mode: z
      .enum(['brief', 'standard', 'detailed'])
      .default('standard')
      .describe('要約モード: brief（短く低コスト）/ standard（標準）/ detailed（詳細、コスト高）'),
    focus: z
      .string()
      .optional()
      .describe('要約の焦点（例: "生成AI規制"）。省略可'),
  },
  (args) => handleSummarizeMeeting(args),
)

// --- compare_over_time ---
server.tool(
  'compare_over_time',
  '同一テーマについて複数期間（2〜3期間）の国会議事録を比較し、議論の変化（論点の増減・新規・継続）を返します。',
  {
    query: z.string().min(1).describe('比較対象テーマ（例: "生成AI", "財政政策"）'),
    periods: z
      .array(
        z.object({
          label: z.string().min(1).describe('期間ラベル（例: "2024年"）'),
          from:  z.string().min(1).describe('開始日 (YYYY-MM-DD)'),
          until: z.string().min(1).describe('終了日 (YYYY-MM-DD)'),
        }),
      )
      .min(2)
      .max(3)
      .describe('比較する期間一覧（2〜3期間）'),
    nameOfMeeting: z.string().optional().describe('特定会議に絞る場合に指定（例: "予算委員会"）'),
    speaker: z.string().optional().describe('特定発言者に絞る場合に指定'),
    mode: z
      .enum(['brief', 'standard', 'detailed'])
      .default('standard')
      .describe('出力粒度: brief（主要変化2〜3件）/ standard（標準）/ detailed（詳細・コスト高）'),
    include_topics: z
      .boolean()
      .default(true)
      .describe('論点比較を含めるか'),
    include_speaker_changes: z
      .boolean()
      .default(true)
      .describe('発言者傾向の比較を含めるか'),
    max_items_per_period: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe('各期間で取得する最大発言件数（既定: 20）'),
  },
  (args) => handleCompareOverTime(args),
)

// --- summarize_qa_pairs ---
server.tool(
  'summarize_qa_pairs',
  '会議録識別子 (issueID) を指定して、質問と答弁のペアを抽出・要約します。各ペアに論点タイトル・質問要旨・答弁要旨・回答関係評価（response_type）が付与されます。',
  {
    issueID: z.string().min(1).describe('会議録識別子（search_speeches の items[].issueID から取得）'),
    focus: z.string().optional().describe('要約の焦点となるテーマ（例: "生成AI"）。省略可'),
    mode: z
      .enum(['brief', 'standard', 'detailed'])
      .default('standard')
      .describe('出力粒度: brief（3〜5件・短縮）/ standard（5〜10件）/ detailed（詳細・コスト高）'),
    max_pairs: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(10)
      .describe('返却する最大ペア数（既定: 10）'),
    include_unanswered: z
      .boolean()
      .default(true)
      .describe('明確な答弁が取れない質問も含めるか'),
  },
  (args) => handleSummarizeQaPairs(args),
)

// --- compare_by_party ---
server.tool(
  'compare_by_party',
  '指定テーマについて政党別の発言を集約・比較します。各政党のスタンス・主要論点の違い、共通点・相違点を出典付きで返します。',
  {
    query: z.string().min(1).describe('比較対象テーマ（例: "生成AI", "財政政策"）'),
    from: z.string().optional().describe('検索開始日 (YYYY-MM-DD)。省略可'),
    until: z.string().optional().describe('検索終了日 (YYYY-MM-DD)。省略可'),
    nameOfMeeting: z.string().optional().describe('特定会議に絞る場合に指定（例: "予算委員会"）'),
    mode: z
      .enum(['brief', 'standard', 'detailed'])
      .default('standard')
      .describe('出力粒度: brief（主要政党のみ・簡潔）/ standard（標準）/ detailed（詳細・コスト高）'),
    include_common_points: z.boolean().default(true).describe('共通点を出力に含めるか'),
    include_differences: z.boolean().default(true).describe('相違点を出力に含めるか'),
    max_items: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(30)
      .describe('最大対象発言件数（既定: 30）'),
  },
  (args) => handleCompareByParty(args),
)

// --- analyze_topic_changes ---
server.tool(
  'analyze_topic_changes',
  '同一テーマについて複数期間（2〜5期間）の国会議事録を分析し、論点の増加・減少・継続・新規（change_type）を出典付きで返します。',
  {
    query: z.string().min(1).describe('比較対象テーマ（例: "生成AI", "財政政策"）'),
    periods: z
      .array(
        z.object({
          label: z.string().min(1).describe('期間ラベル（例: "2024年"）'),
          from:  z.string().min(1).describe('開始日 (YYYY-MM-DD)'),
          until: z.string().min(1).describe('終了日 (YYYY-MM-DD)'),
        }),
      )
      .min(2)
      .max(5)
      .describe('比較する期間一覧（2〜5期間）'),
    mode: z
      .enum(['brief', 'standard', 'detailed'])
      .default('standard')
      .describe('出力粒度: brief（主要変化のみ）/ standard（標準）/ detailed（詳細・コスト高）'),
    max_items_per_period: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe('各期間で取得する最大発言件数（既定: 20）'),
    include_emerging_topics: z
      .boolean()
      .default(true)
      .describe('新規論点（new）を含めるか'),
    nameOfMeeting: z.string().optional().describe('特定会議に絞る場合に指定'),
  },
  (args) => handleAnalyzeTopicChanges(args),
)

// 起動
async function main() {
  // 起動時キャッシュクリーンアップ（期限切れエントリを削除）
  getCacheCleaner().runOnStartup()

  const transport = new StdioServerTransport()
  await server.connect(transport)
  logger.info('kokkai-mcp サーバー起動完了', { transport: 'stdio' })
}

// プロセス終了ハンドリング
process.on('SIGINT', () => {
  logger.info('SIGINT 受信 - シャットダウン')
  process.exit(0)
})

process.on('SIGTERM', () => {
  logger.info('SIGTERM 受信 - シャットダウン')
  process.exit(0)
})

main().catch((err) => {
  logger.error('サーバー起動失敗', { error: err instanceof Error ? err.message : String(err) })
  process.exit(1)
})
