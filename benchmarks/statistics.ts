export interface Statistics {
  mean: number
  median: number
  p95: number
  min: number
  max: number
  standardDeviation: number
}

const round = (value: number): number => Number(value.toFixed(4))

export function calculateStatistics(samples: number[]): Statistics {
  if (samples.length === 0) throw new Error('统计样本不能为空')

  const sorted = [...samples].sort((left, right) => left - right)
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length
  const middle = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length

  return {
    mean: round(mean),
    median: round(median),
    p95: round(sorted[p95Index]),
    min: round(sorted[0]),
    max: round(sorted.at(-1) ?? sorted[0]),
    standardDeviation: round(Math.sqrt(variance)),
  }
}

export function percentageReduction(baseline: number, current: number): number {
  if (baseline === 0) return 0
  return round(((baseline - current) / baseline) * 100)
}
