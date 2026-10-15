/**
 * 공지 알림음. 파일 없이 Web Audio API 로 그 자리에서 합성한다.
 * - 후보(CHIMES) 중 하나를 골라 기기별(localStorage)로 저장. 소리 켜기/끄기도 기기별.
 * - 브라우저 자동재생 정책: 사용자가 페이지를 한 번이라도 클릭/키 입력하기 전에는 소리가 나지 않는다.
 *   App.vue 가 첫 입력 때 unlockAudio() 를 불러 AudioContext 를 깨운다.
 * - 재생 여부(역할 제한)는 toasts 스토어가 결정한다. 여기는 "어떤 소리를 어떻게 내는가"만 다룬다.
 */

export interface ChimePreset {
  id: string
  label: string
  hint: string
  /** 소리를 그래프에 심고 총 길이(초)를 돌려준다 */
  render: (ctx: AudioContext, dest: AudioNode, t0: number) => number
}

const CHIME_KEY = 'csd:chime'
const MUTED_KEY = 'csd:chimeMuted'
export const DEFAULT_CHIME = 'fourtone'

interface ToneOpts {
  f: number
  at: number
  dur: number
  type?: OscillatorType
  gain?: number
  attack?: number
}

/** 단음 하나: 빠른 어택 후 지수 감쇠 */
function tone(ctx: AudioContext, dest: AudioNode, o: ToneOpts) {
  const osc = ctx.createOscillator()
  osc.type = o.type ?? 'sine'
  osc.frequency.value = o.f
  const g = ctx.createGain()
  const attack = o.attack ?? 0.01
  const peak = o.gain ?? 0.5
  g.gain.setValueAtTime(0, o.at)
  g.gain.linearRampToValueAtTime(peak, o.at + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, o.at + o.dur)
  osc.connect(g).connect(dest)
  osc.start(o.at)
  osc.stop(o.at + o.dur + 0.05)
}

/** 기본음 + 배음 몇 개를 겹쳐 종·차임 느낌을 낸다 */
function bell(ctx: AudioContext, dest: AudioNode, f: number, at: number, dur: number, gain = 0.5) {
  tone(ctx, dest, { f, at, dur, gain })
  tone(ctx, dest, { f: f * 2, at, dur: dur * 0.6, gain: gain * 0.35 })
  tone(ctx, dest, { f: f * 3, at, dur: dur * 0.35, gain: gain * 0.12 })
}

export const CHIMES: ChimePreset[] = [
  {
    id: 'dingdong',
    label: '띵-동 (안내 방송 차임)',
    hint: '역·공공장소 안내 방송 앞에 나오는 2음.',
    render(ctx, dest, t0) {
      bell(ctx, dest, 659.25, t0, 1.2) // E5
      bell(ctx, dest, 523.25, t0 + 0.45, 1.7) // C5
      return 2.2
    },
  },
  {
    id: 'fourtone',
    label: '띵띠리링 (4음 상승)',
    hint: '백화점·공항 안내 차임. 밝고 눈에 띄는 편. (기본값)',
    render(ctx, dest, t0) {
      const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
      notes.forEach((f, i) => bell(ctx, dest, f, t0 + i * 0.19, i === 3 ? 1.6 : 0.7, 0.42))
      return 2.3
    },
  },
  {
    id: 'bell',
    label: '종 한 번 (긴 여운)',
    hint: '한 번 치고 길게 울린다. 차분하고 묵직한 느낌.',
    render(ctx, dest, t0) {
      const f = 880 // A5
      tone(ctx, dest, { f, at: t0, dur: 2.6, gain: 0.5, attack: 0.005 })
      tone(ctx, dest, { f: f * 2, at: t0, dur: 1.6, gain: 0.2, attack: 0.005 })
      tone(ctx, dest, { f: f * 2.76, at: t0, dur: 1.0, gain: 0.12, attack: 0.005 }) // 종 특유의 비정수 배음
      tone(ctx, dest, { f: f * 5.4, at: t0, dur: 0.4, gain: 0.05, attack: 0.005 })
      return 2.7
    },
  },
  {
    id: 'glass',
    label: '또로롱 (3음 하강)',
    hint: '유리를 가볍게 두드리는 느낌의 짧은 3음. 요즘 앱 알림에 가깝다.',
    render(ctx, dest, t0) {
      const notes = [1318.5, 1108.7, 880] // E6 C#6 A5
      notes.forEach((f, i) => tone(ctx, dest, { f, at: t0 + i * 0.12, dur: i === 2 ? 1.0 : 0.5, gain: 0.4, attack: 0.004 }))
      return 1.4
    },
  },
  {
    id: 'attention',
    label: '삑삑-띵 (주목 신호)',
    hint: '짧은 경고음 두 번 뒤에 차임. 긴급한 공지에 어울린다.',
    render(ctx, dest, t0) {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 2200
      lp.connect(dest)
      tone(ctx, lp, { f: 880, at: t0, dur: 0.14, type: 'square', gain: 0.18, attack: 0.004 })
      tone(ctx, lp, { f: 880, at: t0 + 0.22, dur: 0.14, type: 'square', gain: 0.18, attack: 0.004 })
      bell(ctx, dest, 1046.5, t0 + 0.55, 1.3, 0.45) // C6
      return 1.9
    },
  },
]

export const CHIME_BY_ID = Object.fromEntries(CHIMES.map((c) => [c.id, c])) as Record<string, ChimePreset>

// ---- 기기별 설정 ----

export function getChimeId(): string {
  try {
    const v = localStorage.getItem(CHIME_KEY)
    return v && CHIME_BY_ID[v] ? v : DEFAULT_CHIME
  } catch { return DEFAULT_CHIME }
}
export function setChimeId(id: string) {
  try { localStorage.setItem(CHIME_KEY, id) } catch { /* ignore */ }
}
export function isMuted(): boolean {
  try { return localStorage.getItem(MUTED_KEY) === '1' } catch { return false }
}
export function setMuted(v: boolean) {
  try { localStorage.setItem(MUTED_KEY, v ? '1' : '0') } catch { /* ignore */ }
}

// ---- AudioContext ----

let ctx: AudioContext | null = null
let master: GainNode | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.6
    master.connect(ctx.destination)
  }
  return ctx
}

/** 사용자 입력(클릭·키) 안에서 불러야 효과가 있다. 이후로는 입력 밖에서도 소리를 낼 수 있다 */
export function unlockAudio() {
  const c = getContext()
  if (c && c.state === 'suspended') c.resume().catch(() => {})
}

export function audioReady(): boolean {
  return ctx?.state === 'running'
}

/** 선택된(또는 지정한) 알림음을 한 번 재생. 아직 잠겨 있으면 조용히 건너뛴다 */
export async function playChime(id?: string): Promise<boolean> {
  const c = getContext()
  if (!c || !master) return false
  if (c.state === 'suspended') {
    try { await c.resume() } catch { return false }
  }
  if (c.state !== 'running') return false
  const preset = CHIME_BY_ID[id ?? getChimeId()] ?? CHIME_BY_ID[DEFAULT_CHIME]!
  preset.render(c, master, c.currentTime + 0.02)
  return true
}
