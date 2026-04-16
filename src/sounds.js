let audioCtx = null

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  return audioCtx
}

export function playTap() {
  try {
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.type = 'sine'
    osc.frequency.setValueAtTime(600, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.04)

    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.04)
  } catch {}
}

export function playRankUp() {
  try {
    const ctx = getCtx()
    const notes = [523, 659, 784, 1047]

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.type = 'sine'
      const start = ctx.currentTime + i * 0.1

      osc.frequency.setValueAtTime(freq, start)
      gain.gain.setValueAtTime(0.18, start)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25)

      osc.start(start)
      osc.stop(start + 0.25)
    })
  } catch {}
}
