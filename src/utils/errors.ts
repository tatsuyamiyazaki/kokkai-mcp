/** 国会 API 呼び出しエラー */
export class KokkaiApiError extends Error {
  readonly retryable: boolean
  readonly statusCode: number | undefined

  constructor(message: string, statusCode?: number, retryable = true) {
    super(message)
    this.name = 'KokkaiApiError'
    this.retryable = retryable
    this.statusCode = statusCode
  }
}

/** LLM API 呼び出しエラー */
export class LlmApiError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable = true) {
    super(message)
    this.name = 'LlmApiError'
    this.retryable = retryable
  }
}

/** 入力バリデーションエラー */
export class ValidationError extends Error {
  readonly retryable = false

  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/** 件数過多エラー */
export class TooManyItemsError extends Error {
  readonly retryable = false

  constructor(message: string) {
    super(message)
    this.name = 'TooManyItemsError'
  }
}

/** 結果 0 件・存在しないリソースエラー */
export class NotFoundError extends Error {
  readonly retryable = false

  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

/** 環境変数未設定エラー */
export class ConfigurationError extends Error {
  readonly retryable = false

  constructor(message: string) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

/** エラーからメッセージ文字列を安全に取得するユーティリティ */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message
  }
  return String(err)
}

/** エラーオブジェクトを MCP エラーレスポンス用 JSON に変換 */
export function formatErrorForMcp(err: unknown): string {
  if (err instanceof KokkaiApiError) {
    return JSON.stringify({
      error_type: 'KokkaiApiError',
      message: err.message,
      retryable: err.retryable,
    })
  }
  if (err instanceof LlmApiError) {
    return JSON.stringify({
      error_type: 'LlmApiError',
      message: err.message,
      retryable: err.retryable,
    })
  }
  if (err instanceof ValidationError) {
    return JSON.stringify({
      error_type: 'ValidationError',
      message: err.message,
      retryable: false,
    })
  }
  if (err instanceof TooManyItemsError) {
    return JSON.stringify({
      error_type: 'TooManyItemsError',
      message: err.message,
      retryable: false,
    })
  }
  if (err instanceof NotFoundError) {
    return JSON.stringify({
      error_type: 'NotFoundError',
      message: err.message,
      retryable: false,
    })
  }
  if (err instanceof ConfigurationError) {
    return JSON.stringify({
      error_type: 'ConfigurationError',
      message: err.message,
      retryable: false,
    })
  }
  return JSON.stringify({
    error_type: 'UnknownError',
    message: getErrorMessage(err),
    retryable: false,
  })
}
