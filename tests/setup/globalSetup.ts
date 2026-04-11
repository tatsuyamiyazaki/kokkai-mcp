/**
 * globalSetup.ts
 *
 * vitest グローバルセットアップ。
 * テスト実行開始時に SQLite キャッシュ DB をクリアして、
 * テスト間のキャッシュ汚染を防ぐ。
 */

import { existsSync, unlinkSync } from 'fs'
import { join } from 'path'

export function setup() {
  const dbPath =
    process.env['KOKKAI_CACHE_DB_PATH'] ??
    join(process.cwd(), '.cashe', 'sqlite', 'kokkai-cache.db')

  if (existsSync(dbPath)) {
    unlinkSync(dbPath)
  }
}
