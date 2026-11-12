const SYMBOLS: Record<string, string> = {
  doctor: '🧑‍⚕️', firefighter: '🧑‍🚒', chef: '🧑‍🍳', 'police-officer': '👮', farmer: '🧑‍🌾', painter: '🧑‍🎨', teacher: '🧑‍🏫', astronaut: '🧑‍🚀', veterinarian: '🐾', baker: '🥐', musician: '🧑‍🎤', 'mail-carrier': '📮',
  stethoscope: '🩺', syringe: '💉', thermometer: '🌡️', 'fire-hose': '🚒', helmet: '⛑️', ladder: '🪜', 'frying-pan': '🍳', spatula: '🥄', 'chef-hat': '👨‍🍳', whistle: '📯', 'walkie-talkie': '📻', handcuffs: '🔗', hoe: '⛏️', 'watering-can': '🚿', 'straw-hat': '👒', paintbrush: '🖌️', palette: '🎨', easel: '🖼️', chalk: '🖍️', book: '📖', 'board-eraser': '🧽', 'space-helmet': '🧑‍🚀', rocket: '🚀', spacesuit: '👨‍🚀', bandage: '🩹', 'medicine-bottle': '💊', 'pet-carrier': '🐈', 'rolling-pin': '🥖', 'oven-mitt': '🧤', bread: '🍞', piano: '🎹', guitar: '🎸', microphone: '🎤', letter: '✉️', 'mail-bag': '💼', bicycle: '🚲',
}
export function jobCardSymbol(src: string): string {
  const key = src.split('/').pop()?.replace(/\.png$/, '') ?? ''
  return SYMBOLS[key] ?? '🧰'
}

export const JOB_ACTIVITY_HINT: Record<string, string> = {
  doctor: '아픈 사람을 진찰하고 치료해요.', firefighter: '불을 끄고 위험한 곳에서 사람을 구조해요.', chef: '식재료로 맛있는 요리를 만들어요.', 'police-officer': '사람들의 안전을 지키고 범죄를 조사해요.', farmer: '밭에서 채소와 곡식을 길러요.', painter: '붓과 물감으로 그림을 그려요.', teacher: '학생들에게 새로운 지식을 가르쳐요.', astronaut: '우주로 나가 관측하고 연구해요.', veterinarian: '아픈 동물을 진찰하고 치료해요.', baker: '반죽을 만들어 빵을 구워요.', musician: '악기를 연주하거나 음악을 만들어요.', 'mail-carrier': '편지와 우편물을 주소에 맞게 배달해요.',
}
