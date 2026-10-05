import { useCallback, useEffect, useRef, useState } from 'react'

// The Web Speech API's SpeechRecognition interface isn't part of
// TypeScript's bundled DOM lib (it's a non-standardized, vendor-prefixed
// API), so the handful of shapes actually used here are declared locally
// instead of pulling in a @types package just for this.
interface SpeechRecognitionAlternative {
  transcript: string
}
interface SpeechRecognitionResultLike {
  readonly length: number
  [index: number]: SpeechRecognitionAlternative
}
interface SpeechRecognitionResultList {
  readonly length: number
  [index: number]: SpeechRecognitionResultLike
}
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onstart: (() => void) | null
  onend: (() => void) | null
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
}
interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function describeError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'permission-denied':
      return '마이크 권한이 거부되었어요. 브라우저 설정에서 마이크 권한을 허용해주세요.'
    case 'no-speech':
      return '음성이 감지되지 않았어요. 다시 시도해주세요.'
    case 'audio-capture':
      return '마이크를 찾을 수 없어요. 마이크 연결 상태를 확인해주세요.'
    case 'network':
      return '네트워크 오류로 음성 인식에 실패했어요.'
    default:
      return '음성 인식 중 오류가 발생했어요. 다시 시도해주세요.'
  }
}

// Wraps the browser's built-in SpeechRecognition — no server round trip, no
// API key, no new dependency. `onResult` is called with the full transcript
// accumulated so far *within the current listening session* each time the
// browser refines it (interim results included), so the caller should treat
// it as "replace", not "append".
export function useSpeechRecognition(onResult: (transcript: string) => void) {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onResultRef = useRef(onResult)
  useEffect(() => {
    onResultRef.current = onResult
  })

  const isSupported = getSpeechRecognitionConstructor() !== null

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionConstructor()
    if (!Ctor) {
      setError('이 브라우저는 음성 입력을 지원하지 않아요. 최신 Chrome, Edge, Safari에서 이용해주세요.')
      return
    }

    setError(null)
    const recognition = new Ctor()
    recognition.lang = 'ko-KR'
    recognition.continuous = false
    recognition.interimResults = true

    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)
    recognition.onerror = (event) => {
      setError(describeError(event.error))
      setIsListening(false)
    }
    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      onResultRef.current(transcript)
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  // Stop a still-running recognizer if the component unmounts mid-listen
  // (e.g. navigating away from the chat), rather than leaving the mic open.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
    }
  }, [])

  return { isSupported, isListening, error, start, stop }
}
