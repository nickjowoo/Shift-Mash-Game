import React, { useEffect, useMemo, useRef, useState } from 'react'

const GAME_DURATION = 20
const PRE_COUNTDOWN = 3
const MAX_LEADERBOARD = 10

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
  'You are cooking!'
]

const RANKS = [
  { min: 600, label: 'Radiant', textClass: 'rank-radiant', borderClass: 'border-radiant' },
  { min: 500, label: 'Legendary', textClass: 'rank-legendary', borderClass: 'border-legendary' },
  { min: 400, label: 'Grandmaster', textClass: 'rank-grandmaster', borderClass: 'border-grandmaster' },
  { min: 300, label: 'Master', textClass: 'rank-master', borderClass: 'border-master' },
  { min: 200, label: 'Pro', textClass: 'rank-pro', borderClass: 'border-pro' },
  { min: 100, label: 'Rookie', textClass: 'rank-rookie', borderClass: 'border-rookie' },
  { min: 0, label: 'Unranked', textClass: 'rank-unranked', borderClass: 'border-unranked' }
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

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
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
  const query = `${SUPABASE_TABLE}?select=id,name,score,created_at&order=score.desc,created_at.asc&limit=${MAX_LEADERBOARD}`
  return supabaseRequest(query, { method: 'GET' })
}

async function insertGlobalScore(name, score) {
  return supabaseRequest(SUPABASE_TABLE, {
    method: 'POST',
    body: JSON.stringify([{ name, score }])
  })
}

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

  const gameTimerRef = useRef(null)
  const countdownRef = useRef(null)
  const startStampRef = useRef(null)
  const calloutTimerRef = useRef(null)

  const rank = useMemo(() => getRank(score), [score])
  const finishedRank = useMemo(() => getRank(score), [score])
  const cloudReady = isSupabaseConfigured()

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
    } catch (error) {
      setLeaderboardError('Could not load the online leaderboard.')
    } finally {
      setLeaderboardLoading(false)
    }
  }

  useEffect(() => {
    loadLeaderboard()
  }, [])

  useEffect(() => {
    return () => {
      if (gameTimerRef.current) cancelAnimationFrame(gameTimerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (calloutTimerRef.current) clearInterval(calloutTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      const isShift = e.code === 'ShiftLeft' || e.code === 'ShiftRight'
      if (!isShift || phase !== 'playing') return

      setScore((prev) => prev + 1)
      setLastKey(e.code === 'ShiftLeft' ? 'LShift' : 'RShift')

      if (Math.random() < 0.18) {
        const randomCallout = CALLOUTS[Math.floor(Math.random() * CALLOUTS.length)]
        setCallout(randomCallout)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [phase])

  useEffect(() => {
    if (phase !== 'playing') return

    if (calloutTimerRef.current) clearInterval(calloutTimerRef.current)
    calloutTimerRef.current = setInterval(() => {
      const randomCallout = CALLOUTS[Math.floor(Math.random() * CALLOUTS.length)]
      setCallout(randomCallout)
    }, 1800)

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
    setCallout('START!')
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
    setTimeLeft(0)
    setPhase('finished')
    setCallout(score >= 300 ? 'That was wild.' : 'Nice run.')
  }

  const resetGame = () => {
    if (gameTimerRef.current) cancelAnimationFrame(gameTimerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    setPhase('idle')
    setCountdown(PRE_COUNTDOWN)
    setTimeLeft(GAME_DURATION)
    setScore(0)
    setCallout('Ready to test your Shift speed?')
    setLastKey('-')
    setSavedThisRound(false)
  }

  const submitScore = async () => {
    const finalName = nameDraft.trim() || playerName.trim() || 'Player'
    setPlayerName(finalName)

    if (!cloudReady) {
      setLeaderboardError('Add your Supabase URL and anon key to enable the global leaderboard.')
      return
    }

    try {
      setLeaderboardError('')
      await insertGlobalScore(finalName, score)
      setSavedThisRound(true)
      await loadLeaderboard()
    } catch (error) {
      setLeaderboardError('Could not save your score online.')
    }
  }

  return (
    <div className="app-shell">
      <div className="container">
        <div className="banner">
          <strong>{cloudReady ? 'Global leaderboard mode is enabled.' : 'Global leaderboard mode is ready to connect.'}</strong>
          <div>{cloudReady ? 'Anyone using your deployed link will share the same leaderboard.' : 'Paste your Supabase URL and anon key into App.jsx.'}</div>
        </div>

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
                <div className="rank-badge">
                  <div className="label-small">Current Rank</div>
                  <div className={`rank-text ${rank.textClass}`}>{rank.label}</div>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat-box">
                  <div className="stat-label">Time Left</div>
                  <div className="stat-value">{formatTime(timeLeft)}s</div>
                </div>

                <div className={`stat-box ${rank.borderClass}`}>
                  <div className="stat-label">Live Count</div>
                  <div className={`stat-value ${rank.textClass}`}>{score}</div>
                </div>

                <div className="stat-box">
                  <div className="stat-label">Last Key</div>
                  <div className="stat-value">{lastKey}</div>
                </div>
              </div>

              <div className="callout-box">
                <div className="callout-text">
                  {phase === 'countdown' ? (countdown > 0 ? countdown : 'GO!') : callout}
                </div>
              </div>

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
                  Press both Shift keys as fast as you want. Key mashing is fully allowed.
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
                        onChange={(e) => setNameDraft(e.target.value)}
                        placeholder="Enter a name for the leaderboard"
                      />
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
                  <div className="side-subtitle">Shared by everyone using your deployed game link.</div>
                </div>
                <button className="button button-secondary" onClick={loadLeaderboard}>
                  Refresh
                </button>
              </div>

              {leaderboardError && <div className="error-box">{leaderboardError}</div>}

              <div className="leaderboard-list">
                {leaderboardLoading ? (
                  <div className="empty-box">Loading leaderboard...</div>
                ) : leaderboard.length === 0 ? (
                  <div className="empty-box">No global scores yet. Be the first.</div>
                ) : (
                  leaderboard.map((entry, index) => {
                    const entryRank = getRank(entry.score)
                    return (
                      <div key={entry.id ?? `${entry.name}-${entry.score}-${index}`} className={`leaderboard-item ${entryRank.borderClass}`}>
                        <div className="space-between">
                          <div>
                            <div className="place">#{index + 1}</div>
                            <div className="player-name">{entry.name}</div>
                            <div className={`player-rank ${entryRank.textClass}`}>{entryRank.label}</div>
                          </div>
                          <div className={`player-score ${entryRank.textClass}`}>{entry.score}</div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <div className="setup-box" style={{ marginTop: '14px' }}>
                Rank thresholds: 100 Rookie, 200 Pro, 300 Master, 400 Grandmaster, 500 Legendary, 600 Radiant.
              </div>
            </div>
          </aside>
        </div>

        <section className="card setup-card">
          <div className="card-inner">
            <h3 className="setup-title">One-time Supabase setup</h3>
            <div className="setup-box">Open the SQL Editor in Supabase, paste this, and run it.</div>
            <pre className="setup-code">{`create table public.scores (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) <= 20),
  score integer not null check (score >= 0),
  created_at timestamptz not null default now()
);

alter table public.scores enable row level security;

create policy "Anyone can read scores"
on public.scores
for select
using (true);

create policy "Anyone can insert scores"
on public.scores
for insert
with check (true);`}</pre>
          </div>
        </section>
      </div>
    </div>
  )
}
