import { describe, expect, it } from 'vitest'
import { edgesFromMessage, enrichMessage } from '../parse'
import { egoGraph, mergeEdges } from '../graph'

describe('egoGraph', () => {
  it('keeps unknown ring-2 nodes so they can be discovered', () => {
    const raw = [
      ...edgesFromMessage('alice', enrichMessage({
        id: '1', time: '1', author: 'alice', text: '[quote="bob"]hi[/quote]'
      })),
      ...edgesFromMessage('bob', enrichMessage({
        id: '2', time: '1', author: 'bob', text: 'hey @GhostFrom2018'
      }))
    ].map(e => ({ ...e, weight: 1 }))

    const { nodes, edges } = egoGraph(
      'alice',
      mergeEdges(raw),
      new Set(['alice', 'bob'])
    )

    const ghost = nodes.find(n => n.username === 'GhostFrom2018')
    expect(ghost).toMatchObject({ hop: 2, inArchive: false })
    expect(nodes.find(n => n.username === 'bob')?.hop).toBe(1)
    expect(edges.some(e => e.to === 'GhostFrom2018')).toBe(true)
  })

  it('merges quote and mention into both', () => {
    const merged = mergeEdges([
      { from: 'A', to: 'B', kind: 'quote', weight: 1 },
      { from: 'A', to: 'B', kind: 'mention', weight: 2 }
    ])
    expect(merged).toEqual([{ from: 'A', to: 'B', kind: 'both', weight: 3 }])
  })
})