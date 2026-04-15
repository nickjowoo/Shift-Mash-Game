import React, { useEffect, useMemo, useRef, useState } from 'react'

const GAME_DURATION = 20
const PRE_COUNTDOWN = 3
const RESET_HOURS = 48
const RESET_MS = RESET_HOURS * 60 * 60 * 1000

const SUPABASE_URL = 'https://sncstykvostyqtgrwhpn.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_SbcuqjkKm40oS6iA5bWBog_8xkxhFrP'
const SUPABASE_TABLE = 'scores'

const CALLOUTS = [
  'Go, go, go!',
  'You got this!',
  'Keep going!',
  'Mash faster!',
  'Left! Right! Left! Right!',
  'Shift into overdrive!',
  'Do not let the keyboard win!',
  'You are cooking!',
]

const RANKS = [
  { min: 700, label: 'Hacker', textClass: 'rank-hacker', borderClass: 'border-hacker' },
  { min: 600, label: 'Radiant', textClass: 'rank-radiant', borderClass: 'border-radiant' },
  { min: 500, label: 'Legendary', textClass: 'rank-legendary', borderClass: 'border-legendary' },
  { min: 400, label: 'Grandmaster', textClass: 'rank-grandmaster', borderClass: 'border-grandmaster' },
  { min: 300, label: 'Master', textClass: 'rank-master', borderClass: 'border-master' },
  { min: 200, label: 'Pro', textClass: 'rank-pro', borderClass: 'border-pro' },
  { min: 100, label: 'Rookie', textClass: 'rank-rookie', borderClass: 'border-rookie' },
  { min: 0, label: 'Noob', textClass: 'rank-noob', borderClass: 'border-noob' },
]

function getRank(score) {
  return RANKS.find((rank) => score >= rank.min) || RANKS[RANKS.length - 1]
}

function formatTime(value) {
  return value.toFixed(1)
}

function isSupabaseConfigured() {
  return (
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
    SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY'
  )
}

function getCurrentCycleStart() {
  const now = Date.now()
  return Math.floor(now / RESET_MS) * RESET_MS
}

function getNextResetTime() {
  return getCurrentCycleStart() + RESET_MS
}

function formatCountdown(ms) {
  const totalHours = Math.max(0, Math.floor(ms / (1000 * 60 * 60)))
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24

  if (days > 0) return `${days}d ${hours}h`
  return `${hours}h`
}

function detectMobileDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) || navigator.maxTouchPoints > 1
}

function getDeviceIcon(deviceType) {
  return deviceType === 'mobile' ? '📱' : '💻'
}

function isInappropriateName(name) {
  const normalized = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[@]/g, 'a')
    .replace(/[4]/g, 'a')
    .replace(/[3]/g, 'e')
    .replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[^a-z0-9]/g, '')

  const blockedTerms = [
    'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'dick', 'cock', 'pussy',
    'cunt', 'nigger', 'nigga', 'fag', 'faggot', 'slut', 'whore', 'porn',
    'sex', 'rape', 'rapist', 'hitler', 'nazi', 'kkk',
  ]

  return blockedTerms.some((term) => normalized.includes(term))
}

function isBadDisplayName(name) {
  const trimmed = name.trim()
  if (trimmed.length < 2) return true
  const visibleChars = trimmed.replace(/[^a-zA-Z0-9]/g, '')
  return visibleChars.length < 2
}

function getPlayerPosition(leaderboard, submittedId) {
  if (!submittedId) return null
  const sorted = [...leaderboard].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return new Date(a.created_at || 0) - new Date(b.created_at || 0)
  })
  const index = sorted.findIndex((entry) => entry.id === submittedId)
  if (index === -1) return null
  return { position: index + 1, entry: sorted[index] }
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || 'Supabase request failed.')
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }
  return null
}

async function fetchGlobalLeaderboard() {
  const cycleStart = new Date(getCurrentCycleStart()).toISOString()
  const query =
    `${SUPABASE_TABLE}?select=id,name,score,created_at,device_type` +
    `&created_at=gte.${encodeURIComponent(cycleStart)}` +
    `&order=score.desc,created_at.asc`

  return supabaseRequest(query, { method: 'GET' })
}

async function insertGlobalScore(name, score, deviceType) {
  return supabaseRequest(SUPABASE_TABLE, {
    method: 'POST',
    body: JSON.stringify([{ name, score, device_type: deviceType }]),
  })
}

async function fetchTotalPresses() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_total_presses`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Failed to fetch total presses.')
  }

  return response.json()
}

const SiteFooter = React.memo(function SiteFooter({ totalPresses }) {
  return (
    <footer className="site-footer">
      <div className="community-total">
        All-time total: <span className="community-total-value">{totalPresses.toLocaleString()}</span> presses
      </div>
      <div className="footer-credit">Made by Nick W., Kyle S., Felipe L.P.</div>
      <div className="footer-year">2026</div>
    </footer>
  )
})

export default function App() {
  const [phase, setPhase] = useState('idle')
  const [countdown, setCountdown] = useState(PRE_COUNTDOWN)
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION)
  const [score, setScore] = useState(0)
  const [callout, setCallout] = useState('Ready to test your Shift speed?')
  const [leaderboard, setLeaderboard] = useState([])
  const [lastKey, setLastKey] = useState('-')
  const [playerName, setPlayerName] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [savedThisRound, setSavedThisRound] = useState(false)
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [leaderboardError, setLeaderboardError] = useState('')
  const [nameError, setNameError] = useState('')
  const [resetCountdown, setResetCountdown] = useState('')
  const [isMobileDevice, setIsMobileDevice] = useState(false)
  const [lastSubmittedId, setLastSubmittedId] = useState(null)
  const [totalPresses, setTotalPresses] = useState(0)

  const gameTimerRef = useRef(null)
  const countdownRef = useRef(null)
  const startStampRef = useRef(null)
  const calloutTimerRef = useRef(null)
  const pendingPressesRef = useRef(0)
  const scoreFrameRef = useRef(null)

  const rank = useMemo(() => getRank(score), [score])
  const finishedRank = useMemo(() => getRank(score), [score])
  const cloudReady = isSupabaseConfigured()

  const playerPosition = useMemo(() => {
    return getPlayerPosition(leaderboard, lastSubmittedId)
  }, [leaderboard, lastSubmittedId])

  const flushScore = () => {
    if (pendingPressesRef.current > 0) {
      const amount = pendingPressesRef.current
      pendingPressesRef.current = 0
      setScore((prev) => prev + amount)
    }
    scoreFrameRef.current = null
  }

  const loadLeaderboard = async () => {
    if (!cloudReady) {
      setLeaderboard([])
      setLeaderboardError('Global leaderboard not connected yet.')
      return
    }

    try {
      setLeaderboardLoading(true)
      setLeaderboardError('')
      const rows = await fetchGlobalLeaderboard()
      setLeaderboard(Array.isArray(rows) ? rows : [])
    } catch {
      setLeaderboardError('Could not load the online leaderboard.')
    } finally {
      setLeaderboardLoading(false)
    }
  }

  const loadTotalPresses = async () => {
    if (!cloudReady) return
    try {
      const total = await fetchTotalPresses()
      setTotalPresses(Number(total) || 0)
    } catch (error) {
      console.error('Could not load total presses', error)
    }
  }

  useEffect(() => {
    setIsMobileDevice(detectMobileDevice())
  }, [])

  useEffect(() => {
    loadLeaderboard()
    loadTotalPresses()
  }, [])
  useEffect(() => {
  if (!cloudReady) return

  let isLoading = false

  const interval = setInterval(async () => {
    if (isLoading) return
    isLoading = true

    try {
      await loadTotalPresses()
    } finally {
      isLoading = false
    }
  }, 10000)

  return () => clearInterval(interval)
}, [cloudReady])

  useEffect(() => {
    const updateCountdown = () => {
      const remaining = getNextResetTime() - Date.now()
      setResetCountdown(formatCountdown(remaining))
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    return () => {
      if (gameTimerRef.current) cancelAnimationFrame(gameTimerRef.current)
      if (scoreFrameRef.current) cancelAnimationFrame(scoreFrameRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (calloutTimerRef.current) clearInterval(calloutTimerRef.current)
    }
  }, [])

  const registerPress = (keyLabel) => {
    if (phase !== 'playing') return

    pendingPressesRef.current += 1
    setLastKey(keyLabel)

    if (!scoreFrameRef.current) {
      scoreFrameRef.current = requestAnimationFrame(flushScore)
    }
  }

  useEffect(() => {
    if (phase !== 'playing') return

    const handleKeyDown = (e) => {
      const isShift = e.code === 'ShiftLeft' || e.code === 'ShiftRight'
      if (!isShift) return
      registerPress(e.code === 'ShiftLeft' ? 'LShift' : 'RShift')
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase])

  useEffect(() => {
    if (phase !== 'playing') return

    const setRandomCallout = () => {
      const randomCallout = CALLOUTS[Math.floor(Math.random() * CALLOUTS.length)]
      setCallout(randomCallout)
    }

    setRandomCallout()
    calloutTimerRef.current = setInterval(setRandomCallout, 5000)

    return () => {
      if (calloutTimerRef.current) clearInterval(calloutTimerRef.current)
    }
  }, [phase])

  const beginGame = () => {
    setScore(0)
    setTimeLeft(GAME_DURATION)
    setCountdown(PRE_COUNTDOWN)
    setPhase('countdown')
    setCallout('Get ready...')
    setLastKey('-')
    setSavedThisRound(false)
    setNameError('')
    pendingPressesRef.current = 0

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current)
          launchRound()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const launchRound = () => {
    setPhase('playing')
    setCallout('Go, go, go!')
    startStampRef.current = performance.now()

    const tick = (now) => {
      const elapsed = (now - startStampRef.current) / 1000
      const remaining = Math.max(0, GAME_DURATION - elapsed)
      setTimeLeft(remaining)

      if (remaining <= 0) {
        finishGame()
        return
      }

      gameTimerRef.current = requestAnimationFrame(tick)
    }

    gameTimerRef.current = requestAnimationFrame(tick)
  }

  const finishGame = () => {
    if (gameTimerRef.current) cancelAnimationFrame(gameTimerRef.current)
    if (scoreFrameRef.current) cancelAnimationFrame(scoreFrameRef.current)
    flushScore()
    pendingPressesRef.current = 0
    setTimeLeft(0)
    setPhase('finished')
    setCallout(score >= 300 ? 'That was wild.' : 'Nice run.')
  }

  const resetGame = () => {
    if (gameTimerRef.current) cancelAnimationFrame(gameTimerRef.current)
    if (scoreFrameRef.current) cancelAnimationFrame(scoreFrameRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (calloutTimerRef.current) clearInterval(calloutTimerRef.current)
    scoreFrameRef.current = null
    pendingPressesRef.current = 0
    setPhase('idle')
    setCountdown(PRE_COUNTDOWN)
    setTimeLeft(GAME_DURATION)
    setScore(0)
    setCallout('Ready to test your Shift speed?')
    setLastKey('-')
    setSavedThisRound(false)
    setNameError('')
  }

  const submitScore = async () => {
    const finalName = (nameDraft.trim() || playerName.trim() || 'Player').slice(0, 20)
    setPlayerName(finalName)

    if (isBadDisplayName(finalName) || isInappropriateName(finalName)) {
      setNameError('Please refrain from using inappropriate names!')
      return
    }

    setNameError('')

    if (!cloudReady) {
      setLeaderboardError('Add your Supabase URL and anon key to enable the global leaderboard.')
      return
    }

    try {
      setLeaderboardError('')
      const inserted = await insertGlobalScore(finalName, score, isMobileDevice ? 'mobile' : 'desktop')

      if (Array.isArray(inserted) && inserted.length > 0) {
        setLastSubmittedId(inserted[0].id)
      }

      setSavedThisRound(true)
      await loadLeaderboard()
      await loadTotalPresses()
    } catch {
      setLeaderboardError('Could not save your score online.')
    }
  }

  const mainDisplay = phase === 'countdown' ? (countdown > 0 ? countdown : 'GO!') : score

  return (
    <div className="app-shell">
      <div className="container">
        <div className="grid">
          <section className="card">
            <div className="card-inner">
              <div className="header-row">
                <div>
                  <h1 className="title">Shift Mash Arena</h1>
                  <p className="subtitle">
                    Smash <strong>LShift</strong> and <strong>RShift</strong> as fast as you can in 20 seconds.
                  </p>
                </div>

                <div className="rank-badge-wrap">
                  <div className="rank-badge">
                    <div className="label-small">Current Rank</div>
                    <div className={`rank-text ${rank.textClass}`}>{rank.label}</div>
                  </div>

                  <div className="rank-info">
                    <button className="rank-info-button" type="button" aria-label="Rank info">
                      i
                    </button>

                    <div className="rank-info-popover">
                      <div className="rank-info-title">Rank Values</div>

                      <div className="rank-info-row rank-info-row-note">
                        <div>
                          <span className="rank-info-name rank-hacker">Hacker</span>
                          <div className="rank-info-subnote">you probably used a bot huh</div>
                        </div>
                        <span className="rank-info-range">700+</span>
                      </div>

                      <div className="rank-info-row">
                        <span className="rank-info-name rank-radiant">Radiant</span>
                        <span className="rank-info-range">600–699</span>
                      </div>
                      <div className="rank-info-row">
                        <span className="rank-info-name rank-legendary">Legendary</span>
                        <span className="rank-info-range">500–599</span>
                      </div>
                      <div className="rank-info-row">
                        <span className="rank-info-name rank-grandmaster">Grandmaster</span>
                        <span className="rank-info-range">400–499</span>
                      </div>
                      <div className="rank-info-row">
                        <span className="rank-info-name rank-master">Master</span>
                        <span className="rank-info-range">300–399</span>
                      </div>
                      <div className="rank-info-row">
                        <span className="rank-info-name rank-pro">Pro</span>
                        <span className="rank-info-range">200–299</span>
                      </div>
                      <div className="rank-info-row">
                        <span className="rank-info-name rank-rookie">Rookie</span>
                        <span className="rank-info-range">100–199</span>
                      </div>
                      <div className="rank-info-row">
                        <span className="rank-info-name rank-noob">Noob</span>
                        <span className="rank-info-range">0–99</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-box">
                  <div className="stat-label">Time Left</div>
                  <div className="stat-value">{formatTime(timeLeft)}s</div>
                </div>

                <div className="stat-box">
                  <div className="stat-label">Last Key</div>
                  <div className="stat-value">{lastKey}</div>
                </div>
              </div>

              <div className={`callout-box ${rank.borderClass}`}>
  <div className="callout-label">Presses</div>
  <div className={`callout-score ${phase === 'countdown' ? 'countdown-score' : rank.textClass}`}>
    {mainDisplay}
  </div>
</div>

              <div className="motivation-wrap">
                <div className="callout-bubble">
                  <div className="callout-text">{callout}</div>
                </div>
              </div>

              {isMobileDevice && (
                <div className="mobile-controls">
                  <button
                    className="mobile-mash-button"
                    onPointerDown={() => registerPress('LTap')}
                    disabled={phase !== 'playing'}
                  >
                    L
                  </button>
                  <button
                    className="mobile-mash-button"
                    onPointerDown={() => registerPress('RTap')}
                    disabled={phase !== 'playing'}
                  >
                    R
                  </button>
                </div>
              )}

              <div className="controls">
                <button
                  className="button button-primary"
                  onClick={beginGame}
                  disabled={phase === 'countdown' || phase === 'playing'}
                >
                  START
                </button>

                <button className="button button-secondary" onClick={resetGame}>
                  Reset
                </button>

                <div className="info-box">
                  Warm-up. Key mashing is encouraged. Try to earn a top spot on the global leaderboard. Are you fast enough?
                </div>
              </div>

              {phase === 'finished' && (
                <div className={`final-box ${finishedRank.borderClass}`}>
                  <div className="final-row">
                    <div>
                      <div className="final-title">Final Result</div>
                      <div className={`final-score ${finishedRank.textClass}`}>{score}</div>
                      <div className="final-rank">
                        Rank: <strong className={finishedRank.textClass}>{finishedRank.label}</strong>
                      </div>
                    </div>

                    <div className="name-area">
                      <input
                        className="text-input"
                        value={nameDraft}
                        onChange={(e) => {
                          setNameDraft(e.target.value)
                          if (nameError) setNameError('')
                        }}
                        placeholder="Enter a name for the leaderboard"
                        maxLength={20}
                      />
                      {nameError && (
                        <div className="name-error-text">Please refrain from using inappropriate names!</div>
                      )}
                      <button
                        className="button button-success"
                        onClick={submitScore}
                        disabled={savedThisRound}
                      >
                        {savedThisRound ? 'Saved to Global Leaderboard' : 'Save Score'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="card">
            <div className="card-inner">
              <div className="leaderboard-head">
                <div>
                  <h2 className="side-title">Global Leaderboard</h2>
                  <div className="side-subtitle reset-row">
  <span className="reset-icon" aria-hidden="true">🕒</span>
  <span className="reset-text">Refreshes every 48h</span>
  <span className="reset-text">•</span>
  <span className="reset-text">Resets in {resetCountdown}</span>
</div>
                </div>

                <button className="button button-secondary" onClick={loadLeaderboard}>
                  Refresh
                </button>
              </div>

              {leaderboardError && <div className="error-box">{leaderboardError}</div>}

              <div className="leaderboard-scroll">
                <div className="leaderboard-list">
                  {leaderboardLoading ? (
                    <div className="empty-box">Loading leaderboard...</div>
                  ) : leaderboard.length === 0 ? (
                    <div className="empty-box">No global scores yet. Be the first.</div>
                  ) : (
                    leaderboard.map((entry, index) => {
                      const entryRank = getRank(entry.score)
                      const deviceIcon = getDeviceIcon(entry.device_type)
                      const keysPerMinute = Math.round(entry.score * 3)

                      return (
                        <div
                          key={entry.id ?? `${entry.name}-${entry.score}-${index}`}
                          className={`leaderboard-item ${entryRank.borderClass}`}
                        >
                          <div className="space-between">
                            <div>
                              <div className="place">
                                #{index + 1} <span className="device-icon">{deviceIcon}</span>
                              </div>
                              <div className="player-name">{entry.name}</div>
                              <div className={`player-rank ${entryRank.textClass}`}>{entryRank.label}</div>
                              <div className="player-kpm">{keysPerMinute} keys/min</div>
                            </div>

                            <div className={`player-score score-animated ${entryRank.textClass}`}>
                              {entry.score}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              <div className="player-position-card">
                <div className="player-position-title">Your Position</div>
                {playerPosition ? (
                  <div className="player-position-row">
                    <div>
                      <div className="player-position-place">#{playerPosition.position}</div>
                      <div className="player-position-name">{playerPosition.entry.name}</div>
                      <div className="player-position-kpm">
                        {Math.round(playerPosition.entry.score * 3)} keys/min
                      </div>
                    </div>
                    <div className={`player-position-score score-animated ${getRank(playerPosition.entry.score).textClass}`}>
                      {playerPosition.entry.score}
                    </div>
                  </div>
                ) : (
                  <div className="player-position-empty">Save a score to see your position here.</div>
                )}
              </div>
            </div>
          </aside>
        </div>

        <SiteFooter totalPresses={totalPresses} />
      </div>
    </div>
  )
}
