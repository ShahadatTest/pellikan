export type ThemeChoice = 'dark' | 'light' | 'system'

const KEY = 'pellikan.theme'

/** Inline script run before first paint so there is no flash of the wrong theme. Keep in sync with apply(). */
export const THEME_BOOT = `try{var t=localStorage.getItem('${KEY}')||'dark';if(t==='system')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='dark'}`

export function useTheme() {
  const choice = useState<ThemeChoice>('theme-choice', () => 'dark')

  function resolved(): 'dark' | 'light' {
    if (choice.value !== 'system') return choice.value
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  function apply() {
    document.documentElement.dataset.theme = resolved()
  }

  function set(next: ThemeChoice) {
    choice.value = next
    try { localStorage.setItem(KEY, next) } catch { /* private mode: the choice just won't persist */ }
    apply()
  }

  /** Call once on the client. */
  function init() {
    try {
      const saved = localStorage.getItem(KEY)
      if (saved === 'dark' || saved === 'light' || saved === 'system') choice.value = saved
    } catch { /* ignore */ }
    apply()
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (choice.value === 'system') apply() })
  }

  /** Light <-> dark toggle for the header button. */
  function toggle() { set(resolved() === 'dark' ? 'light' : 'dark') }

  return { choice, set, init, toggle, isDark: () => (import.meta.client ? resolved() === 'dark' : true) }
}
