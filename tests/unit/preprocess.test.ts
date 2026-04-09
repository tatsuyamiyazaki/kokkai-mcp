import { describe, it, expect } from 'vitest'
import { preprocessSpeeches, splitIntoChunks } from '../../src/services/preprocess.js'
import type { SpeechItem } from '../../src/types/index.js'

function makeSpeech(overrides: Partial<SpeechItem> = {}): SpeechItem {
  return {
    speechID: 'S001',
    issueID: 'I001',
    date: '2024-01-01',
    nameOfMeeting: '衆議院本会議',
    speaker: '田中太郎',
    speech: '生成AIに関する規制について詳細な検討が必要です。政府の対応方針を明確にするよう求めます。',
    ...overrides,
  }
}

describe('preprocessSpeeches', () => {
  it('極端に短い発言（20文字未満）を除外する', () => {
    const items = [
      makeSpeech({ speech: '短い発言' }),  // 4文字
      makeSpeech({ speechID: 'S002', speech: 'これは20文字以上の十分な長さの発言内容です。' }),
    ]
    const result = preprocessSpeeches(items)
    expect(result).toHaveLength(1)
    expect(result[0]?.speechID).toBe('S002')
  })

  it('20文字ちょうどの発言は除外しない', () => {
    const speech20 = 'あいうえおかきくけこさしすせそたちつてと'  // 20文字
    const items = [makeSpeech({ speech: speech20 })]
    const result = preprocessSpeeches(items)
    expect(result).toHaveLength(1)
  })

  it('形式的議事進行発言を除外する', () => {
    const items = [
      makeSpeech({ speechID: 'P1', speech: 'これより質疑に入ります。発言を求めます。' }),
      makeSpeech({ speechID: 'P2', speech: '以上で質疑を終了します。次に進みます。' }),
      makeSpeech({ speechID: 'P3', speech: '起立多数により、可決されました。' }),
      makeSpeech({ speechID: 'N1', speech: '生成AIに関する規制について詳細な検討が必要です。政府の方針を明確にするよう求めます。' }),
    ]
    const result = preprocessSpeeches(items)
    // 形式的発言が除外され、実質的な発言のみ残る
    expect(result.some((i) => i.speechID === 'N1')).toBe(true)
    expect(result.some((i) => i.speechID === 'P3')).toBe(false)
  })

  it('同一話者の連続発言を結合する', () => {
    const items = [
      makeSpeech({ speechID: 'S1', speaker: '田中太郎', speech: '最初の発言です。これは最初の部分で十分な長さがあります。' }),
      makeSpeech({ speechID: 'S2', speaker: '田中太郎', speech: '続きの発言です。これは続きの部分で十分な長さがあります。' }),
    ]
    const result = preprocessSpeeches(items)
    expect(result).toHaveLength(1)
    expect(result[0]?.speech).toContain('最初の発言')
    expect(result[0]?.speech).toContain('続きの発言')
  })

  it('異なる話者の発言は結合しない', () => {
    const items = [
      makeSpeech({ speechID: 'S1', speaker: '田中太郎', speech: '田中の発言です。これは十分な長さがあります。' }),
      makeSpeech({ speechID: 'S2', speaker: '山田花子', speech: '山田の発言です。これは十分な長さがあります。' }),
    ]
    const result = preprocessSpeeches(items)
    expect(result).toHaveLength(2)
  })

  it('空配列を渡すと空配列が返る', () => {
    expect(preprocessSpeeches([])).toEqual([])
  })

  it('キーワード一致で重要度スコアが反映される', () => {
    const items = [
      makeSpeech({ speechID: 'LOW', speaker: 'SpeakerA', speech: '農業振興に関する一般的な議論を行います。これは十分な長さです。' }),
      makeSpeech({ speechID: 'HIGH', speaker: 'SpeakerB', speech: '生成AI規制について詳しく議論します。生成AIのリスク管理は重要で、生成AI活用のガイドラインが必要です。' }),
    ]
    const result = preprocessSpeeches(items, { keywords: ['生成AI'] })
    // HIGH には生成AI が 3 回含まれるのでスコアが高く先頭に来るはず
    // speechID の順序で確認
    const ids = result.map((r) => r.speechID)
    expect(ids.indexOf('HIGH')).toBeLessThan(ids.indexOf('LOW'))
  })
})

describe('splitIntoChunks', () => {
  it('文字数制限でチャンク分割する', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeSpeech({ speechID: `S${i}`, speech: 'a'.repeat(3000) }),
    )
    const chunks = splitIntoChunks(items, 8000, 20)
    // 3000 * 3 = 9000 > 8000 なので 2件目で分割される
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('発言数制限でチャンク分割する', () => {
    const items = Array.from({ length: 25 }, (_, i) =>
      makeSpeech({ speechID: `S${i}`, speech: '短い発言テストです。内容を確認してください。' }),
    )
    const chunks = splitIntoChunks(items, 800000, 20)
    // 20件を超えるので分割
    expect(chunks.length).toBeGreaterThanOrEqual(2)
  })

  it('空配列を渡すと空のチャンク配列が返る', () => {
    expect(splitIntoChunks([], 8000, 20)).toEqual([])
  })

  it('全 items の合計が 1 チャンク以内ならチャンク数は 1', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeSpeech({ speechID: `S${i}`, speech: '十分な長さの発言内容です。' }),
    )
    const chunks = splitIntoChunks(items, 800000, 100)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.items).toHaveLength(5)
  })
})
