import { useEffect, useState } from 'react'

const COMING_SOON_MESSAGE = '현재 준비 중인 기능입니다.'

// Shared by every "준비 중" entry point (home feature cards, sidebar,
// mobile menu) so clicking any of them shows the exact same notice instead
// of each place inventing its own wording/behavior.
export function useComingSoonNotice() {
  const [notice, setNotice] = useState<string | null>(null)

  // Auto-dismiss instead of requiring a close tap.
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 2500)
    return () => clearTimeout(timer)
  }, [notice])

  return { notice, showComingSoon: () => setNotice(COMING_SOON_MESSAGE) }
}
