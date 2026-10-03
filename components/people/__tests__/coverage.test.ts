import { describe, expect, it } from 'vitest'
import { fillOrder } from '../CoveragePanel'

describe('fillOrder', () => {
  it('fills the least-covered years first, newest days first', () => {
    const order = fillOrder({
      years: [
        { year: 2026, days: 10, checked: 8, withMessages: 5 },
        { year: 2021, days: 10, checked: 1, withMessages: 1 },
        { year: 2020, days: 10, checked: 1, withMessages: 0 }
      ],
      missing: ['2026-01-02', '2021-03-01', '2021-05-01', '2020-07-01', '2026-01-01']
    })
    expect(order).toEqual(['2021-05-01', '2021-03-01', '2020-07-01', '2026-01-02', '2026-01-01'])
  })
})
