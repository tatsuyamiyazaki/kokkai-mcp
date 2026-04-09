import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { logger } from './utils/logger.js'
import { handleSearchSpeeches } from './tools/searchSpeeches.js'
import { handleGetMeeting } from './tools/getMeeting.js'
import { handleSummarizeSpeeches } from './tools/summarizeSpeeches.js'
import { handleSummarizeMeeting } from './tools/summarizeMeeting.js'

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

// 起動
async function main() {
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
