import { useMemo } from 'react'

export default function ParticlesBg({ count = 28, color = 'var(--primary)' }) {
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const type = i % 4 === 0 ? 'ring' : i % 4 === 1 ? 'diamond' : i % 4 === 2 ? 'dot' : 'cross'
      const size = type === 'dot'
        ? 3 + (i % 4) * 2
        : type === 'ring'
        ? 14 + (i % 3) * 10
        : type === 'diamond'
        ? 8 + (i % 3) * 6
        : 12 + (i % 3) * 4
      return {
        id: i,
        type,
        size,
        left: `${5 + ((i * 4.3 + Math.sin(i * 0.9) * 22) % 90)}%`,
        top: `${8 + ((i * 7.7 + Math.cos(i * 1.1) * 28) % 82)}%`,
        dur: `${14 + (i * 2.1) % 16}s`,
        delay: `${(i * 1.9) % 11}s`,
        opacity: type === 'dot'
          ? 0.18 + (i % 5) * 0.05
          : type === 'ring'
          ? 0.05 + (i % 4) * 0.015
          : 0.08 + (i % 5) * 0.02,
        drift: i % 4 === 0 ? 'twinkle' : i % 3 === 0 ? 'drift-a' : i % 3 === 1 ? 'drift-b' : 'drift-c',
      }
    })
  }, [count])

  return (
    <div className="particles-wrap" aria-hidden="true">
      {particles.map(p => (
        <span
          key={p.id}
          className={`particle particle-${p.type} ${p.drift}`}
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            '--p-color': color,
            animationDuration: p.dur,
            animationDelay: p.delay,
            opacity: p.opacity,
          }}
        />
      ))}
    </div>
  )
}
