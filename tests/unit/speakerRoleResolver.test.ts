import { describe, it, expect } from 'vitest'
import { resolveSpeakerRole, classifySpeeches } from '../../src/services/speakerRoleResolver.js'
import type { SpeechItem } from '../../src/types/index.js'

function makeSpeech(overrides: Partial<SpeechItem> = {}): SpeechItem {
  return {
    speechID: 'test-001',
    issueID: 'I001',
    date: '2024-01-01',
    nameOfMeeting: 'テスト委員会',
    speaker: '田中委員',
    speech: '生成AIについて伺います。規制の方針をお聞かせください。',
    ...overrides,
  }
}

describe('resolveSpeakerRole', () => {
  it('大臣を含む発言者は answerer と判定される', () => {
    const item = makeSpeech({ speaker: '山田大臣' })
    const result = resolveSpeakerRole(item)
    expect(result.role).toBe('answerer')
    expect(result.roleLabel).toBe('大臣')
  })

  it('副大臣を含む発言者は answerer と判定される', () => {
    const item = makeSpeech({ speaker: '田中副大臣' })
    const result = resolveSpeakerRole(item)
    expect(result.role).toBe('answerer')
  })

  it('政府参考人を含む発言者は answerer と判定される', () => {
    const item = makeSpeech({ speaker: '佐藤政府参考人' })
    const result = resolveSpeakerRole(item)
    expect(result.role).toBe('answerer')
  })

  it('委員長を含む発言者は chair と判定される', () => {
    const item = makeSpeech({ speaker: '鈴木委員長' })
    const result = resolveSpeakerRole(item)
    expect(result.role).toBe('chair')
  })

  it('議長を含む発言者は chair と判定される', () => {
    const item = makeSpeech({ speaker: '衆議院議長' })
    const result = resolveSpeakerRole(item)
    expect(result.role).toBe('chair')
  })

  it('「伺います」を含む発言は questioner と判定される', () => {
    const item = makeSpeech({
      speaker: '山本太郎',
      speech: '政府の方針について伺います。',
    })
    const result = resolveSpeakerRole(item)
    expect(result.role).toBe('questioner')
  })

  it('委員を含む発言者は questioner と判定される', () => {
    const item = makeSpeech({ speaker: '田中委員', speech: '説明します。' })
    const result = resolveSpeakerRole(item)
    expect(result.role).toBe('questioner')
  })

  it('判定できない場合は unknown を返す', () => {
    const item = makeSpeech({
      speaker: '山田太郎',
      speech: 'はい、了解しました。',
    })
    const result = resolveSpeakerRole(item)
    // 「委員」「議員」「大臣」等が含まれない場合は unknown
    expect(['questioner', 'unknown']).toContain(result.role)
  })
})

describe('classifySpeeches', () => {
  it('発言リストを役割別に分類できる', () => {
    const items: SpeechItem[] = [
      makeSpeech({ speaker: '田中委員', speech: '伺います。', speechID: 'S1' }),
      makeSpeech({ speaker: '山田大臣', speech: 'お答えします。', speechID: 'S2' }),
      makeSpeech({ speaker: '鈴木委員長', speech: '次に進みます。', speechID: 'S3' }),
    ]
    const result = classifySpeeches(items)
    expect(result.questioners).toHaveLength(1)
    expect(result.answerers).toHaveLength(1)
    expect(result.chairs).toHaveLength(1)
    expect(result.questioners[0]?.speechID).toBe('S1')
    expect(result.answerers[0]?.speechID).toBe('S2')
    expect(result.chairs[0]?.speechID).toBe('S3')
  })

  it('空の配列を渡すと全て空配列を返す', () => {
    const result = classifySpeeches([])
    expect(result.questioners).toHaveLength(0)
    expect(result.answerers).toHaveLength(0)
    expect(result.chairs).toHaveLength(0)
    expect(result.unknown).toHaveLength(0)
  })
})
