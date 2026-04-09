/**
 * partyResolver.ts
 *
 * 発言者→政党マッピングモジュール。
 * 発言者名から政党を推定する。国会議事録では発言者名に政党が含まれないことが多いため、
 * 発言内容・文脈から推定するか、既知辞書で補完する。
 */

import type { SpeechItem } from '../types/index.js'

/** 政党名の正規化マッピング（部分一致） */
const PARTY_ALIASES: Array<{ pattern: RegExp; normalized: string }> = [
  { pattern: /自由民主党|自民党|自民/,        normalized: '自由民主党' },
  { pattern: /公明党|公明/,                  normalized: '公明党' },
  { pattern: /立憲民主党|立憲/,              normalized: '立憲民主党' },
  { pattern: /日本維新の会|維新/,            normalized: '日本維新の会' },
  { pattern: /国民民主党|国民民主/,          normalized: '国民民主党' },
  { pattern: /日本共産党|共産党|共産/,       normalized: '日本共産党' },
  { pattern: /社会民主党|社民党|社民/,       normalized: '社会民主党' },
  { pattern: /れいわ新選組|れいわ/,          normalized: 'れいわ新選組' },
  { pattern: /NHK党|NHK/,                  normalized: 'NHK党' },
  { pattern: /参政党/,                       normalized: '参政党' },
]

/** 政府側・答弁者の役職キーワード（政党不明として扱う） */
const GOVERNMENT_KEYWORDS = [
  '大臣', '副大臣', '政務官', '長官', '政府参考人',
  '内閣', '局長', '次官', '審議官',
]

/** 不明政党のラベル */
export const UNKNOWN_PARTY = '無所属・不明'

/** 政府側のラベル */
export const GOVERNMENT_PARTY = '政府・行政'

/**
 * 発言者名から政党名を推定する。
 *
 * 国会議事録の発言者名は「○○委員（△△党）」のような形式の場合がある。
 * 括弧内に政党名が含まれる場合はそれを使用し、なければ辞書で補完する。
 */
export function resolveParty(speaker: string): string {
  // 政府側（答弁者）の判定
  for (const kw of GOVERNMENT_KEYWORDS) {
    if (speaker.includes(kw)) {
      return GOVERNMENT_PARTY
    }
  }

  // 括弧内の政党名を抽出（例: 「田中○○君（自民党）」）
  const bracketMatch = speaker.match(/[（(]([^）)]+)[）)]/)
  if (bracketMatch) {
    const inBracket = bracketMatch[1] ?? ''
    for (const alias of PARTY_ALIASES) {
      if (alias.pattern.test(inBracket)) {
        return alias.normalized
      }
    }
  }

  // 発言者名全体で部分一致チェック
  for (const alias of PARTY_ALIASES) {
    if (alias.pattern.test(speaker)) {
      return alias.normalized
    }
  }

  return UNKNOWN_PARTY
}

/** 発言アイテムに政党情報を付与した型 */
export interface SpeechWithParty extends SpeechItem {
  party: string
}

/**
 * 発言リストに政党情報を付与する。
 */
export function attachParty(items: SpeechItem[]): SpeechWithParty[] {
  return items.map((item) => ({
    ...item,
    party: resolveParty(item.speaker),
  }))
}

/**
 * 政党別に発言をグループ化する。
 */
export function groupByParty(items: SpeechWithParty[]): Map<string, SpeechWithParty[]> {
  const map = new Map<string, SpeechWithParty[]>()
  for (const item of items) {
    const party = item.party
    const existing = map.get(party)
    if (existing) {
      existing.push(item)
    } else {
      map.set(party, [item])
    }
  }
  return map
}

/**
 * 政府側・不明を除いた「主要政党」の一覧を返す。
 */
export function getMajorParties(partyGroups: Map<string, SpeechWithParty[]>): string[] {
  return Array.from(partyGroups.keys()).filter(
    (p) => p !== GOVERNMENT_PARTY,
  )
}
