/**
 * speakerRoleResolver.ts
 *
 * 発言者属性判定モジュール。
 * 発言者名と発言内容から「質問者」「答弁者」「議員」「大臣」「参考人」等の属性を推定する。
 */

import type { SpeechItem } from '../types/index.js'

/** 発言者の役割 */
export type SpeakerRole = 'questioner' | 'answerer' | 'chair' | 'unknown'

/** 役割判定結果 */
export interface SpeakerRoleResult {
  role: SpeakerRole
  /** 答弁者と判定した場合の役職ラベル（大臣 / 副大臣 / 政府参考人 等） */
  roleLabel?: string
}

// ─── 判定用キーワード ──────────────────────────────────────────────────────────

/** 答弁者（政府側）の役職キーワード */
const ANSWERER_KEYWORDS = [
  '大臣', '副大臣', '政務官', '長官', '総裁', '知事',
  '政府参考人', '政府委員', '内閣官房', '参事官', '局長',
  '部長', '課長', '次官', '審議官', '調査員',
]

/** 議長・委員長等の議事進行者キーワード */
const CHAIR_KEYWORDS = [
  '議長', '委員長', '副議長', '会長', '副会長',
]

/** 質問発言に現れやすい表現 */
const QUESTION_PATTERNS = [
  /伺[いいたい]/,
  /お尋ね/,
  /質問/,
  /聞かせ/,
  /教えて/,
  /いかがお考え/,
  /どのようにお考え/,
  /見解を/,
  /答弁を/,
  /ご説明/,
  /説明して/,
  /確認したい/,
  /確認させ/,
  /明らかにして/,
]

/**
 * 発言者名から役割を判定する。
 *
 * 国会議事録では「○○大臣」「○○委員」などの肩書きが発言者名に含まれることが多い。
 */
export function resolveSpeakerRole(item: SpeechItem): SpeakerRoleResult {
  const speaker = item.speaker

  // 議長・委員長
  for (const kw of CHAIR_KEYWORDS) {
    if (speaker.includes(kw)) {
      return { role: 'chair', roleLabel: kw }
    }
  }

  // 答弁者（大臣・政府参考人等）
  for (const kw of ANSWERER_KEYWORDS) {
    if (speaker.includes(kw)) {
      return { role: 'answerer', roleLabel: kw }
    }
  }

  // 発言内容に質問パターンが含まれる場合は質問者と推定
  const speech = item.speech
  for (const pattern of QUESTION_PATTERNS) {
    if (pattern.test(speech)) {
      return { role: 'questioner' }
    }
  }

  // 「委員」は質問者寄り（特定できない場合のデフォルト）
  if (speaker.includes('委員') || speaker.includes('議員')) {
    return { role: 'questioner' }
  }

  return { role: 'unknown' }
}

/**
 * 発言リストを質問者と答弁者に分類する。
 */
export function classifySpeeches(items: SpeechItem[]): {
  questioners: SpeechItem[]
  answerers: SpeechItem[]
  chairs: SpeechItem[]
  unknown: SpeechItem[]
} {
  const questioners: SpeechItem[] = []
  const answerers: SpeechItem[] = []
  const chairs: SpeechItem[] = []
  const unknownItems: SpeechItem[] = []

  for (const item of items) {
    const result = resolveSpeakerRole(item)
    switch (result.role) {
      case 'questioner':
        questioners.push(item)
        break
      case 'answerer':
        answerers.push(item)
        break
      case 'chair':
        chairs.push(item)
        break
      default:
        unknownItems.push(item)
    }
  }

  return { questioners, answerers, chairs, unknown: unknownItems }
}
