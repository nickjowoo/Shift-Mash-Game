let audioCtx = null
let musicNodes = []
let musicPlaying = false
let scheduleTimer = null
let currentBar = 0
let startTime = 0

let musicMuted = false
let sfxMuted = false

const STORAGE_KEYS = {
  musicMuted: 'shift-mash-music-muted',
  sfxMuted: 'shift-mash-sfx-muted',
}

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioCtx
}

function loadStoredPrefs() {
  try {
    musicMuted = localStorage.getItem(STORAGE_KEYS.musicMuted) === 'true'
    sfxMuted = localStorage.getItem(STORAGE_KEYS.sfxMuted) === 'true'
  } catch {}
}

function persistPref(key, value) {
  try {
    localStorage.setItem(key, String(value))
  } catch {}
}

loadStoredPrefs()

export function getAudioPrefs() {
  return { musicMuted, sfxMuted }
}

export async function initAudio() {
  try {
    const ctx = getCtx()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
    return ctx
  } catch {
    return null
  }
}

export function setMusicMuted(value) {
  musicMuted = Boolean(value)
  persistPref(STORAGE_KEYS.musicMuted, musicMuted)

  const master = musicNodes.find((node) => node && node.__type === 'master')
  if (master && audioCtx) {
    master.gain.cancelScheduledValues(audioCtx.currentTime)
    master.gain.setValueAtTime(musicMuted ? 0 : 0.32, audioCtx.currentTime)
  }
}

export function setSfxMuted(value) {
  sfxMuted = Boolean(value)
  persistPref(STORAGE_KEYS.sfxMuted, sfxMuted)
}

export function playTap() {
  if (sfxMuted) return

  try {
    const ctx = getCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.type = 'sine'
    osc.frequency.setValueAtTime(600, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.04)

    gain.gain.setValueAtTime(0.05, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.04)
  } catch {}
}

export function playRankUp() {
  if (sfxMuted) return

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
      gain.gain.setValueAtTime(0.12, start)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25)

      osc.start(start)
      osc.stop(start + 0.25)
    })
  } catch {}
}

const BPM = 86
const BEAT = 60 / BPM
const BAR = BEAT * 4
const LOOKAHEAD = 0.2
const SCHEDULE_INTERVAL = 100

function schedulePad(ctx, master, time, duration, chordIndex) {
  const chords = [
    [220.0, 261.63, 329.63],
    [196.0, 246.94, 293.66],
    [174.61, 220.0, 261.63],
    [196.0, 233.08, 293.66],
  ]

  const chord = chords[chordIndex % chords.length]

  chord.forEach((freq) => {
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()

    osc1.connect(filter)
    osc2.connect(filter)
    filter.connect(gain)
    gain.connect(master)

    osc1.type = 'triangle'
    osc2.type = 'sine'

    osc1.frequency.setValueAtTime(freq, time)
    osc2.frequency.setValueAtTime(freq * 1.004, time)

    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(600, time)
    filter.frequency.linearRampToValueAtTime(1200, time + duration * 0.45)
    filter.frequency.linearRampToValueAtTime(500, time + duration)
    filter.Q.value = 0.8

    gain.gain.setValueAtTime(0.0, time)
    gain.gain.linearRampToValueAtTime(0.03, time + 1.2)
    gain.gain.linearRampToValueAtTime(0.025, time + duration - 0.8)
    gain.gain.linearRampToValueAtTime(0.0, time + duration)

    osc1.start(time)
    osc2.start(time)
    osc1.stop(time + duration)
    osc2.stop(time + duration)
  })
}

function scheduler(ctx, master) {
  const now = ctx.currentTime

  while (startTime + currentBar * BAR < now + LOOKAHEAD) {
    const barTime = startTime + currentBar * BAR
    schedulePad(ctx, master, barTime, BAR * 2, currentBar)
    currentBar += 2
  }

  scheduleTimer = setTimeout(() => scheduler(ctx, master), SCHEDULE_INTERVAL)
}

export async function startMusic() {
  if (musicPlaying) return

  try {
    const ctx = await initAudio()
    if (!ctx) return

    const master = ctx.createGain()
    master.__type = 'master'

    const reverb = ctx.createConvolver()
    const reverbGain = ctx.createGain()
    const dryGain = ctx.createGain()

    const reverbLength = Math.floor(ctx.sampleRate * 3)
    const reverbBuffer = ctx.createBuffer(2, reverbLength, ctx.sampleRate)

    for (let channel = 0; channel < 2; channel += 1) {
      const data = reverbBuffer.getChannelData(channel)
      for (let i = 0; i < reverbLength; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / reverbLength, 2.8)
      }
    }

    reverb.buffer = reverbBuffer

    master.connect(dryGain)
    master.connect(reverb)
    reverb.connect(reverbGain)
    dryGain.connect(ctx.destination)
    reverbGain.connect(ctx.destination)

    master.gain.value = musicMuted ? 0 : 0.32
    dryGain.gain.value = 0.9
    reverbGain.gain.value = 0.32

    musicNodes = [master, reverb, reverbGain, dryGain]
    musicPlaying = true
    currentBar = 0
    startTime = ctx.currentTime + 0.05

    scheduler(ctx, master)
  } catch (e) {
    console.error('Music error:', e)
  }
}

export function stopMusic() {
  if (scheduleTimer) {
    clearTimeout(scheduleTimer)
    scheduleTimer = null
  }

  musicPlaying = false

  try {
    musicNodes.forEach((node) => {
      try {
        node.disconnect()
      } catch {}
    })
  } catch {}

  musicNodes = []
}
