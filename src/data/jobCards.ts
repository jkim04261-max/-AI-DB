// 지시서(직업 카드 맞추기 미니게임): 직업 12종 + 각 직업의 도구 3종.
// 기존 characterProfessions.ts(50개 직업 선택 카탈로그)와는 완전히
// 별개의, 이 미니게임 전용 데이터다 — 서로 참조하지 않는다.
//
// 이미지 파일은 아직 없다(지시서: "실제 이미지 파일은 생성하지 말
// 것") — 아래 경로는 실제로는 존재하지 않는 placeholder이고,
// CardMatchGame.tsx가 로드 실패 시 직업명/도구명 텍스트로 대체해
// 보여준다.
export interface JobCardTool {
  id: string
  name: string
  image: string
}

export interface JobCardEntry {
  id: string
  jobName: string
  jobImage: string
  tools: JobCardTool[]
}

export const JOB_CARDS: JobCardEntry[] = [
  {
    id: 'doctor',
    jobName: '의사',
    jobImage: '/characters/jobs/doctor.png',
    tools: [
      { id: 'stethoscope', name: '청진기', image: '/characters/tools/stethoscope.png' },
      { id: 'syringe', name: '주사기', image: '/characters/tools/syringe.png' },
      { id: 'thermometer', name: '체온계', image: '/characters/tools/thermometer.png' },
    ],
  },
  {
    id: 'firefighter',
    jobName: '소방관',
    jobImage: '/characters/jobs/firefighter.png',
    tools: [
      { id: 'fire-hose', name: '소방호스', image: '/characters/tools/fire-hose.png' },
      { id: 'helmet', name: '소방 헬멧', image: '/characters/tools/helmet.png' },
      { id: 'ladder', name: '사다리', image: '/characters/tools/ladder.png' },
    ],
  },
  {
    id: 'chef',
    jobName: '요리사',
    jobImage: '/characters/jobs/chef.png',
    tools: [
      { id: 'frying-pan', name: '프라이팬', image: '/characters/tools/frying-pan.png' },
      { id: 'spatula', name: '주걱', image: '/characters/tools/spatula.png' },
      { id: 'chef-hat', name: '요리사 모자', image: '/characters/tools/chef-hat.png' },
    ],
  },
  {
    id: 'police-officer',
    jobName: '경찰관',
    jobImage: '/characters/jobs/police-officer.png',
    tools: [
      { id: 'whistle', name: '호루라기', image: '/characters/tools/whistle.png' },
      { id: 'walkie-talkie', name: '무전기', image: '/characters/tools/walkie-talkie.png' },
      { id: 'handcuffs', name: '수갑', image: '/characters/tools/handcuffs.png' },
    ],
  },
  {
    id: 'farmer',
    jobName: '농부',
    jobImage: '/characters/jobs/farmer.png',
    tools: [
      { id: 'hoe', name: '호미', image: '/characters/tools/hoe.png' },
      { id: 'watering-can', name: '물뿌리개', image: '/characters/tools/watering-can.png' },
      { id: 'straw-hat', name: '밀짚모자', image: '/characters/tools/straw-hat.png' },
    ],
  },
  {
    id: 'painter',
    jobName: '화가',
    jobImage: '/characters/jobs/painter.png',
    tools: [
      { id: 'paintbrush', name: '붓', image: '/characters/tools/paintbrush.png' },
      { id: 'palette', name: '팔레트', image: '/characters/tools/palette.png' },
      { id: 'easel', name: '이젤', image: '/characters/tools/easel.png' },
    ],
  },
  {
    id: 'teacher',
    jobName: '선생님',
    jobImage: '/characters/jobs/teacher.png',
    tools: [
      { id: 'chalk', name: '분필', image: '/characters/tools/chalk.png' },
      { id: 'book', name: '책', image: '/characters/tools/book.png' },
      { id: 'board-eraser', name: '칠판지우개', image: '/characters/tools/board-eraser.png' },
    ],
  },
  {
    id: 'astronaut',
    jobName: '우주비행사',
    jobImage: '/characters/jobs/astronaut.png',
    tools: [
      { id: 'space-helmet', name: '우주헬멧', image: '/characters/tools/space-helmet.png' },
      { id: 'rocket', name: '로켓', image: '/characters/tools/rocket.png' },
      { id: 'spacesuit', name: '우주복', image: '/characters/tools/spacesuit.png' },
    ],
  },
  {
    id: 'veterinarian',
    jobName: '수의사',
    jobImage: '/characters/jobs/veterinarian.png',
    tools: [
      { id: 'bandage', name: '붕대', image: '/characters/tools/bandage.png' },
      { id: 'medicine-bottle', name: '약병', image: '/characters/tools/medicine-bottle.png' },
      { id: 'pet-carrier', name: '이동장', image: '/characters/tools/pet-carrier.png' },
    ],
  },
  {
    id: 'baker',
    jobName: '제빵사',
    jobImage: '/characters/jobs/baker.png',
    tools: [
      { id: 'rolling-pin', name: '밀대', image: '/characters/tools/rolling-pin.png' },
      { id: 'oven-mitt', name: '오븐장갑', image: '/characters/tools/oven-mitt.png' },
      { id: 'bread', name: '빵', image: '/characters/tools/bread.png' },
    ],
  },
  {
    id: 'musician',
    jobName: '음악가',
    jobImage: '/characters/jobs/musician.png',
    tools: [
      { id: 'piano', name: '피아노', image: '/characters/tools/piano.png' },
      { id: 'guitar', name: '기타', image: '/characters/tools/guitar.png' },
      { id: 'microphone', name: '마이크', image: '/characters/tools/microphone.png' },
    ],
  },
  {
    id: 'mail-carrier',
    jobName: '우체부',
    jobImage: '/characters/jobs/mail-carrier.png',
    tools: [
      { id: 'letter', name: '편지', image: '/characters/tools/letter.png' },
      { id: 'mail-bag', name: '우편가방', image: '/characters/tools/mail-bag.png' },
      { id: 'bicycle', name: '자전거', image: '/characters/tools/bicycle.png' },
    ],
  },
]
