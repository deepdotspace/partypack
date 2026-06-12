import { describe, it, expect } from 'vitest'
import { validateInvention, MAX_NAME_LENGTH, MAX_PITCH_LENGTH } from './validation'

describe('validateInvention', () => {
  it('accepts a name + pitch and trims both', () => {
    const inv = validateInvention('  SockLink  ', '  finds the other sock  ')
    expect(inv).toEqual({ name: 'SockLink', pitch: 'finds the other sock' })
  })

  it('rejects an empty / whitespace name', () => {
    expect(validateInvention('', 'a pitch')).toBeNull()
    expect(validateInvention('   ', 'a pitch')).toBeNull()
  })

  it('rejects an empty / whitespace pitch', () => {
    expect(validateInvention('A Name', '')).toBeNull()
    expect(validateInvention('A Name', '   ')).toBeNull()
  })

  it('clamps an over-long name and pitch rather than rejecting', () => {
    const inv = validateInvention('x'.repeat(MAX_NAME_LENGTH + 10), 'y'.repeat(MAX_PITCH_LENGTH + 10))
    expect(inv?.name).toHaveLength(MAX_NAME_LENGTH)
    expect(inv?.pitch).toHaveLength(MAX_PITCH_LENGTH)
  })
})
