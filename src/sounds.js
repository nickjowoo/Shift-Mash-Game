let audioCtx = null
let musicNodes = []
let musicPlaying = false
let scheduleTimer = null
let currentBeat = 0
let startTime = 0

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  return audioCtx
}

// ─── Sound Effects ───────────────────────────────────────────────────────────

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

// ─── Music Engine ─────────────────────────────────────────────────────────────

const BPM = 172
const BEAT = 60 / BPM
const BAR = BEAT * 4
const LOOKAHEAD = 0.1
const SCHEDULE_INTERVAL = 50

// Kick drum — deep sub thump
function scheduleKick(ctx, master, time) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const distortion = ctx.createWaveShaper()

  const curve = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 256 - 1
    curve[i] = (Math.PI + 400) * x / (Math.PI + 400 * Math.abs(x))
  }
  distortion.curve = curve

  osc.connect(distortion)
  distortion.connect(gain)
  gain.connect(master)

  osc.type = 'sine'
  osc.frequency.setValueAtTime(150, time)
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.08)
  osc.frequency.exponentialRampToValueAtTime(30, time + 0.15)

  gain.gain.setValueAtTime(1.2, time)
  gain.gain.exponentialRampToValueAtTime(0.3, time + 0.1)
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4)

  osc.start(time)
  osc.stop(time + 0.4)
}

// Snare — noisy crack
function scheduleSnare(ctx, master, time) {
  const bufferSize = ctx.sampleRate * 0.18
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1

  const noise = ctx.createBufferSource()
  noise.buffer = buffer

  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 2800
  filter.Q.value = 0.7

  const gain = ctx.createGain()
  noise.connect(filter)
  filter.connect(gain)
  gain.connect(master)

  gain.gain.setValueAtTime(0.55, time)
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18)

  // Tonal body
  const osc = ctx.createOscillator()
  const oscGain = ctx.createGain()
  osc.connect(oscGain)
  oscGain.connect(master)
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(220, time)
  osc.frequency.exponentialRampToValueAtTime(120, time + 0.06)
  oscGain.gain.setValueAtTime(0.25, time)
  oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1)
  osc.start(time)
  osc.stop(time + 0.1)

  noise.start(time)
  noise.stop(time + 0.18)
}

// Hi-hat — tight closed
function scheduleHat(ctx, master, time, open = false) {
  const bufferSize = ctx.sampleRate * (open ? 0.25 : 0.04)
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1

  const noise = ctx.createBufferSource()
  noise.buffer = buffer

  const filter = ctx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = open ? 7000 : 9000

  const gain = ctx.createGain()
  noise.connect(filter)
  filter.connect(gain)
  gain.connect(master)

  const vol = open ? 0.18 : 0.12
  gain.gain.setValueAtTime(vol, time)
  gain.gain.exponentialRampToValueAtTime(0.001, time + (open ? 0.25 : 0.04))

  noise.start(time)
  noise.stop(time + (open ? 0.25 : 0.04))
}

// Atmospheric pad — lush chord wash
function schedulePad(ctx, master, time, duration) {
  const chords = [
    [110, 138.6, 164.8],   // Am
    [98, 123.5, 146.8],    // Gm
    [116.5, 146.8, 174.6], // Bbm
    [103.8, 130.8, 155.6], // Abm
  ]
  const chord = chords[Math.floor(currentBeat / 16) % chords.length]

  chord.forEach((freq) => {
    const osc = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()

    osc.connect(filter)
    osc2.connect(filter)
    filter.connect(gain)
    gain.connect(master)

    osc.type = 'sawtooth'
    osc2.type = 'sawtooth'
    osc.frequency.value = freq
    osc2.frequency.value = freq * 2.005  // slight detune for width

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(400, time)
    filter.frequency.linearRampToValueAtTime(1200, time + duration * 0.4)
    filter.frequency.linearRampToValueAtTime(300, time + duration)
    filter.Q.value = 2

    gain.gain.setValueAtTime(0.0, time)
    gain.gain.linearRampToValueAtTime(0.045, time + 0.4)
    gain.gain.linearRampToValueAtTime(0.04, time + duration - 0.3)
    gain.gain.linearRampToValueAtTime(0.0, time + duration)

    osc.start(time)
    osc2.start(time)
    osc.stop(time + duration)
    osc2.stop(time + duration)
  })
}

// Sub bass line — rolling dnb bassline
function scheduleBass(ctx, master, time, beat) {
  const patterns = [
    [110, 0, 110, 0, 82.4, 0, 98, 110],
    [110, 0, 98, 0, 110, 0, 82.4, 0],
    [82.4, 0, 110, 0, 98, 110, 0, 82.4],
    [98, 110, 0, 82.4, 0, 98, 110, 0],
  ]
  const patternIndex = Math.floor(beat / 8) % patterns.length
  const noteIndex = beat % 8
  const freq = patterns[patternIndex][noteIndex]

  if (!freq) return

  const osc = ctx.createOscillator()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()

  osc.connect(filter)
  filter.connect(gain)
  gain.connect(master)

  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(freq, time)

  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(280, time)
  filter.frequency.exponentialRampToValueAtTime(120, time + BEAT * 0.45)
  filter.Q.value = 3

  gain.gain.setValueAtTime(0.55, time)
  gain.gain.exponentialRampToValueAtTime(0.001, time + BEAT * 0.45)

  osc.start(time)
  osc.stop(time + BEAT * 0.5)
}

// Reese-style mid bass stab
function scheduleMidBass(ctx, master, time) {
  const osc1 = ctx.createOscillator()
  const osc2 = ctx.createOscillator()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()

  osc1.connect(filter)
  osc2.connect(filter)
  filter.connect(gain)
  gain.connect(master)

  osc1.type = 'sawtooth'
  osc2.type = 'sawtooth'
  osc1.frequency.value = 220
  osc2.frequency.value = 219.2

  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(600, time)
  filter.frequency.exponentialRampToValueAtTime(300, time + 0.12)
  filter.Q.value = 4

  gain.gain.setValueAtTime(0.3, time)
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14)

  osc1.start(time)
  osc2.start(time)
  osc1.stop(time + 0.14)
  osc2.stop(time + 0.14)
}

// DnB kick pattern: 1 . . . 1 . 1 . (with ghost kick)
const KICK_PATTERN  = [1,0,0,0, 1,0,1,0, 1,0,0,0, 1,0,1,0]
const SNARE_PATTERN = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1]
const HAT_PATTERN   = [1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1]
const OPEN_HAT      = [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0]
const MID_BASS_PAT  = [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,0]

function scheduleStep(ctx, master, time, step) {
  const bar = Math.floor(step / 16)
  if (KICK_PATTERN[step % 16])  scheduleKick(ctx, master, time)
  if (SNARE_PATTERN[step % 16]) scheduleSnare(ctx, master, time)
  if (HAT_PATTERN[step % 16])   scheduleHat(ctx, master, time, false)
  if (OPEN_HAT[step % 16])      scheduleHat(ctx, master, time, true)
  if (MID_BASS_PAT[step % 16])  scheduleMidBass(ctx, master, time)

  scheduleBass(ctx, master, time, step)

  // Pad every 16 steps (one bar)
  if (step % 16 === 0) {
    schedulePad(ctx, master, time, BAR * 4)
  }
}

function scheduler(ctx, master) {
  const now = ctx.currentTime
  while (startTime + currentBeat * (BEAT / 2) < now + LOOKAHEAD) {
    const stepTime = startTime + currentBeat * (BEAT / 2)
    scheduleStep(ctx, master, stepTime, currentBeat % 16)
    currentBeat++
  }
  scheduleTimer = setTimeout(() => scheduler(ctx, master), SCHEDULE_INTERVAL)
}

export function startMusic() {
  if (musicPlaying) return
  try {
    const ctx = getCtx()
    if (ctx.state === 'suspended') ctx.resume()

    const master = ctx.createGain()
    const reverb = ctx.createConvolver()
    const reverbGain = ctx.createGain()
    const dryGain = ctx.createGain()

    // Simple reverb impulse
    const reverbTime = ctx.sampleRate * 2.5
    const reverbBuffer = ctx.createBuffer(2, reverbTime, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const data = reverbBuffer.getChannelData(c)
      for (let i = 0; i < reverbTime; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / reverbTime, 2.5)
      }
    }
    reverb.buffer = reverbBuffer

    master.connect(dryGain)
    master.connect(reverb)
    reverb.connect(reverbGain)
    dryGain.connect(ctx.destination)
    reverbGain.connect(ctx.destination)

    master.gain.value = 0.85
    dryGain.gain.value = 0.75
    reverbGain.gain.value = 0.18

    musicNodes = [master, reverb, reverbGain, dryGain]
    musicPlaying = true
    currentBeat = 0
    startTime = ctx.currentTime + 0.05

    scheduler(ctx, master)
  } catch (e) {
    console.error('Music error:', e)
  }
}

export function stopMusic() {
  if (!musicPlaying) return
  musicPlaying = false
  if (scheduleTimer) {
    clearTimeout(scheduleTimer)
    scheduleTimer = null
  }
  try {
    musicNodes.forEach((node) => {
      try { node.disconnect() } catch {}
    })
  } catch {}
  musicNodes = []
}
