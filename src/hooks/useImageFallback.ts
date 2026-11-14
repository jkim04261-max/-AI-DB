import { useEffect, useState } from 'react'

// 지시서(밥 먹는 캐릭터 에셋 깨짐 방지): 식사 포즈 전신 그림처럼, 로드에
// 실패했을 때 대신 보여줄 그림이 있는 <img>에서 공용으로 쓴다 — 실패하면
// fallbackSrc로 조용히 바꿔 보여줄 뿐, 브라우저 기본 "깨진 이미지" 아이콘을
// 그대로 노출하지 않는다. src가 바뀌면(포즈가 다시 바뀌는 등) 실패 상태를
// 초기화해, 다음 그림은 다시 정상적으로 시도한다.
export function useImageFallback(src: string, fallbackSrc: string): { src: string; onError: () => void } {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  return {
    src: failed ? fallbackSrc : src,
    onError: () => setFailed(true),
  }
}
