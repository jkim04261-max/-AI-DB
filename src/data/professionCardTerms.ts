import type { ProfessionCategory, ProfessionId } from './characterProfessions'
import { PROFESSION_CATEGORY } from './characterProfessions'
import type { AgeTier } from './characterAge'

// 지시서(직업별 카드 맞추기 게임 개선): 커리큘럼(토들러/10대)의 "카드
// 맞추기" 단계를 캐릭터 자신의 등록 직업에 맞춘 도구·전문용어로
// 바꾼다. 무작위 동물·과일·사물(JOB_CARDS, 독립 /card-match 페이지
// 전용 — 건드리지 않는다) 대신, 쉬운 말→전문 용어 순으로 정렬된
// "용어-뜻" 쌍을 쓴다. 쉬운 순서로 정렬해 두면, 낮은 난이도(적은
// 쌍 수)일수록 자동으로 앞쪽(쉬운) 용어만 쓰이고, 난이도가 올라갈수록
// 뒤쪽(전문적인) 용어까지 포함된다 — 별도의 "난이도" 필드가 필요
// 없다.
export interface ProfessionCardTerm {
  id: string
  term: string
  meaning: string
}

// 사용자 지시서가 예시로 든 6개 직업은 직접 손으로 쓴 전용 용어를
// 쓴다. 나머지 등록 직업(50개 중 나머지)은 바로 아래 카테고리별
// 공통 뱅크로 대체한다 — "기존 등록 직업 전체에 적용할 수 있는 공통
// 카드 데이터 구조"(지시서 1번 마지막 줄) 요구를 그렇게 충족한다.
const SPECIFIC_TERMS: Partial<Record<ProfessionId, ProfessionCardTerm[]>> = {
  nurse: [
    { id: 'bandage', term: '붕대', meaning: '상처를 감싸 보호하는 천이에요.' },
    { id: 'thermometer', term: '체온계', meaning: '몸의 온도를 재는 도구예요.' },
    { id: 'syringe', term: '주사기', meaning: '약이나 주사액을 몸에 넣는 도구예요.' },
    { id: 'stethoscope', term: '청진기', meaning: '심장·폐 소리를 듣는 도구예요.' },
    { id: 'iv-drip', term: '수액', meaning: '혈관으로 직접 넣는 약물·영양액이에요.' },
    { id: 'blood-pressure', term: '혈압계', meaning: '혈압을 재는 도구예요.' },
    { id: 'vital-signs', term: '활력징후', meaning: '체온·맥박·호흡·혈압 등 생명 상태 지표예요.' },
    { id: 'triage', term: '중증도 분류', meaning: '환자 상태의 급한 정도를 나누는 일이에요.' },
    { id: 'medication-chart', term: '투약 기록지', meaning: '언제 무슨 약을 줬는지 적는 표예요.' },
    { id: 'sterilization', term: '멸균', meaning: '세균을 완전히 없애는 처리예요.' },
    { id: 'infusion-pump', term: '수액 펌프', meaning: '수액 양을 정확히 조절해 주는 기계예요.' },
    { id: 'catheter', term: '카테터', meaning: '몸 안에 넣어 약물·소변 등을 통하게 하는 가는 관이에요.' },
    { id: 'nursing-record', term: '간호 기록', meaning: '환자 상태와 돌본 내용을 적는 공식 기록이에요.' },
    { id: 'discharge-plan', term: '퇴원 계획', meaning: '환자가 집에 가서 지킬 관리 방법을 정리한 계획이에요.' },
    { id: 'infection-control', term: '감염 관리', meaning: '병균이 퍼지지 않도록 막는 활동이에요.' },
    { id: 'patient-advocacy', term: '환자 권익 옹호', meaning: '환자의 입장과 권리를 대신 챙겨 주는 역할이에요.' },
  ],
  'police-officer': [
    { id: 'handcuffs', term: '수갑', meaning: '손목에 채워 움직임을 막는 도구예요.' },
    { id: 'whistle', term: '호루라기', meaning: '신호를 보낼 때 부는 도구예요.' },
    { id: 'walkie-talkie', term: '무전기', meaning: '멀리서도 말을 주고받는 통신 기기예요.' },
    { id: 'patrol-car', term: '순찰차', meaning: '동네를 돌아보며 지키는 차예요.' },
    { id: 'incident-report', term: '사건보고서', meaning: '일어난 일을 자세히 적은 문서예요.' },
    { id: 'badge', term: '경찰 배지', meaning: '경찰임을 보여주는 표식이에요.' },
    { id: 'traffic-control', term: '교통 정리', meaning: '차와 사람이 안전하게 다니도록 돕는 일이에요.' },
    { id: 'evidence', term: '증거', meaning: '사실을 밝히는 데 쓰이는 물건이나 자료예요.' },
    { id: 'warrant', term: '영장', meaning: '법원이 허락한 수사·체포 문서예요.' },
    { id: 'suspect', term: '용의자', meaning: '사건을 저질렀다고 의심받는 사람이에요.' },
    { id: 'patrol-log', term: '순찰일지', meaning: '순찰하며 본 것을 기록한 일지예요.' },
    { id: 'interrogation', term: '신문(조사)', meaning: '사실을 알아내기 위해 질문하는 일이에요.' },
    { id: 'crime-scene', term: '현장 보존', meaning: '증거가 사라지지 않게 사건 현장을 지키는 일이에요.' },
    { id: 'statute', term: '법령', meaning: '지켜야 할 규칙을 정한 법이에요.' },
    { id: 'community-policing', term: '지역 치안 활동', meaning: '주민과 협력해 동네를 안전하게 지키는 활동이에요.' },
    { id: 'forensics', term: '과학수사', meaning: '과학적 방법으로 증거를 분석하는 수사예요.' },
  ],
  chef: [
    { id: 'ladle', term: '국자', meaning: '국물을 뜨는 도구예요.' },
    { id: 'frying-pan', term: '프라이팬', meaning: '음식을 볶거나 부칠 때 쓰는 납작한 팬이에요.' },
    { id: 'chef-knife', term: '조리용 칼', meaning: '재료를 자르고 다듬는 칼이에요.' },
    { id: 'seasoning', term: '조미료', meaning: '맛을 내기 위해 넣는 양념이에요.' },
    { id: 'cutting-board', term: '도마', meaning: '재료를 썰 때 받치는 판이에요.' },
    { id: 'simmering', term: '졸이기', meaning: '약한 불로 국물을 줄이며 끓이는 방법이에요.' },
    { id: 'blanching', term: '데치기', meaning: '끓는 물에 살짝 익혔다 바로 건지는 방법이에요.' },
    { id: 'plating', term: '플레이팅', meaning: '음식을 접시에 보기 좋게 담는 일이에요.' },
    { id: 'mise-en-place', term: '미장플라스', meaning: '요리 전 재료를 미리 손질해 두는 준비예요.' },
    { id: 'stock', term: '육수', meaning: '뼈나 채소를 우려낸 국물 기본 재료예요.' },
    { id: 'sous-vide', term: '수비드', meaning: '낮은 온도의 물에서 오래 익히는 조리법이에요.' },
    { id: 'emulsion', term: '유화', meaning: '기름과 물처럼 안 섞이는 재료를 곱게 섞는 일이에요.' },
    { id: 'menu-costing', term: '원가 관리', meaning: '요리 재료비를 계산해 가격을 정하는 일이에요.' },
    { id: 'food-safety', term: '위생 관리', meaning: '음식이 안전하도록 깨끗하게 관리하는 일이에요.' },
    { id: 'kitchen-brigade', term: '주방 조직 체계', meaning: '주방에서 역할을 나눠 일하는 체계예요.' },
    { id: 'michelin', term: '미쉐린 평가', meaning: '식당의 수준을 평가하는 유명한 기준이에요.' },
  ],
  pharmacist: [
    { id: 'prescription', term: '처방전', meaning: '의사가 어떤 약을 먹어야 하는지 적은 종이예요.' },
    { id: 'pill-bottle', term: '약병', meaning: '약을 담아 두는 병이에요.' },
    { id: 'tablet', term: '알약', meaning: '동글동글하게 만든 먹는 약이에요.' },
    { id: 'mortar-pestle', term: '유발과 유봉', meaning: '약재를 갈 때 쓰는 그릇과 막대예요.' },
    { id: 'dosage', term: '복용량', meaning: '한 번에 먹어야 하는 약의 양이에요.' },
    { id: 'side-effect', term: '부작용', meaning: '약을 먹고 생길 수 있는 원치 않는 반응이에요.' },
    { id: 'drug-interaction', term: '약물 상호작용', meaning: '약들이 서로 영향을 주고받는 현상이에요.' },
    { id: 'generic-drug', term: '제네릭 의약품', meaning: '원래 약과 성분이 같은 복제약이에요.' },
    { id: 'pharmacokinetics', term: '약동학', meaning: '약이 몸에서 흡수·이동·배출되는 과정을 연구해요.' },
    { id: 'contraindication', term: '금기사항', meaning: '그 약을 먹으면 안 되는 경우를 뜻해요.' },
    { id: 'compounding', term: '조제', meaning: '처방에 맞게 약을 직접 만드는 일이에요.' },
    { id: 'otc-drug', term: '일반의약품', meaning: '처방전 없이도 살 수 있는 약이에요.' },
    { id: 'half-life', term: '반감기', meaning: '약 성분이 몸에서 절반으로 줄어드는 시간이에요.' },
    { id: 'formulary', term: '의약품 목록', meaning: '약국·병원에서 다루는 약의 공식 목록이에요.' },
    { id: 'bioavailability', term: '생체이용률', meaning: '먹은 약이 실제로 몸에 흡수되는 비율이에요.' },
    { id: 'pharmacovigilance', term: '약물 감시', meaning: '약의 부작용을 계속 지켜보고 관리하는 활동이에요.' },
  ],
  lawyer: [
    { id: 'law-book', term: '법전', meaning: '법 조항들을 모아 놓은 책이에요.' },
    { id: 'complaint', term: '소장', meaning: '재판을 요청하며 법원에 내는 문서예요.' },
    { id: 'evidence-material', term: '증거자료', meaning: '사실을 증명하는 데 쓰는 자료예요.' },
    { id: 'contract', term: '계약서', meaning: '서로 약속한 내용을 적은 문서예요.' },
    { id: 'witness', term: '증인', meaning: '사건을 직접 보거나 아는 사람이에요.' },
    { id: 'verdict', term: '판결', meaning: '재판에서 법원이 내리는 최종 결론이에요.' },
    { id: 'litigation', term: '소송', meaning: '법원에서 옳고 그름을 다투는 절차예요.' },
    { id: 'precedent', term: '판례', meaning: '이전에 비슷한 사건에서 내려진 판결이에요.' },
    { id: 'clause', term: '조항', meaning: '계약서나 법 조문의 한 항목이에요.' },
    { id: 'jurisdiction', term: '관할권', meaning: '어느 법원이 그 사건을 다룰 권한이 있는지를 뜻해요.' },
    { id: 'due-process', term: '적법절차', meaning: '법이 정한 올바른 순서와 방법을 따르는 것이에요.' },
    { id: 'statute-of-limitations', term: '소멸시효', meaning: '권리를 주장할 수 있는 정해진 기간이에요.' },
    { id: 'liability', term: '책임(법적 책임)', meaning: '법적으로 그 일에 대해 져야 할 의무예요.' },
    { id: 'appeal', term: '항소', meaning: '판결에 불복해 다시 재판을 요청하는 일이에요.' },
    { id: 'arbitration', term: '중재', meaning: '법원 대신 제3자가 분쟁을 해결해 주는 절차예요.' },
    { id: 'tort', term: '불법행위', meaning: '다른 사람에게 피해를 준 잘못된 행동을 법적으로 부르는 말이에요.' },
  ],
}

// 전용 용어가 없는 나머지 직업은 카테고리(6개) 공통 뱅크를 쓴다 —
// "회사원"처럼 특정 직업으로 등록돼 있지 않은 경우를 포함해 모든
// ProfessionId가 항상 최소 16개의 용어를 받도록 보장한다.
const CATEGORY_TERMS: Record<ProfessionCategory, ProfessionCardTerm[]> = {
  it: [
    { id: 'computer', term: '컴퓨터', meaning: '일을 처리하는 데 쓰는 기계예요.' },
    { id: 'keyboard', term: '키보드', meaning: '글자를 입력하는 도구예요.' },
    { id: 'code', term: '코드', meaning: '컴퓨터에게 시키는 명령어 모음이에요.' },
    { id: 'bug', term: '버그', meaning: '프로그램이 잘못 작동하는 오류예요.' },
    { id: 'server', term: '서버', meaning: '데이터를 저장하고 주고받는 컴퓨터예요.' },
    { id: 'database', term: '데이터베이스', meaning: '정보를 체계적으로 모아 둔 저장소예요.' },
    { id: 'algorithm', term: '알고리즘', meaning: '문제를 푸는 순서가 정해진 방법이에요.' },
    { id: 'deployment', term: '배포', meaning: '만든 프로그램을 실제로 쓸 수 있게 올리는 일이에요.' },
    { id: 'api', term: 'API', meaning: '프로그램끼리 서로 데이터를 주고받는 약속이에요.' },
    { id: 'version-control', term: '버전 관리', meaning: '코드가 바뀐 기록을 관리하는 방법이에요.' },
    { id: 'encryption', term: '암호화', meaning: '남이 못 알아보게 정보를 바꾸는 기술이에요.' },
    { id: 'scalability', term: '확장성', meaning: '사용자가 늘어도 잘 버티는 능력이에요.' },
    { id: 'architecture', term: '시스템 아키텍처', meaning: '프로그램 전체 구조를 설계하는 방식이에요.' },
    { id: 'code-review', term: '코드 리뷰', meaning: '동료가 쓴 코드를 함께 검토하는 일이에요.' },
    { id: 'agile', term: '애자일', meaning: '짧은 주기로 빠르게 개선해 나가는 개발 방식이에요.' },
    { id: 'refactoring', term: '리팩터링', meaning: '동작은 그대로 두고 코드를 더 깔끔하게 고치는 일이에요.' },
  ],
  professional: [
    { id: 'office-log', term: '업무일지', meaning: '그날 한 일을 적어 두는 기록이에요.' },
    { id: 'report', term: '보고서', meaning: '조사하거나 일한 내용을 정리한 문서예요.' },
    { id: 'schedule', term: '일정표', meaning: '할 일과 시간을 적어 놓은 표예요.' },
    { id: 'ledger', term: '장부', meaning: '돈이 들어오고 나간 것을 적는 기록이에요.' },
    { id: 'contract-doc', term: '계약서', meaning: '서로 약속한 내용을 글로 남긴 문서예요.' },
    { id: 'budget', term: '예산', meaning: '쓸 수 있는 돈을 미리 정해 둔 계획이에요.' },
    { id: 'audit', term: '감사', meaning: '일이 제대로 됐는지 꼼꼼히 확인하는 활동이에요.' },
    { id: 'negotiation', term: '협상', meaning: '서로 의견을 맞춰 가는 대화예요.' },
    { id: 'compliance', term: '규정 준수', meaning: '정해진 규칙과 법을 지키는 일이에요.' },
    { id: 'due-diligence', term: '실사', meaning: '거래 전에 꼼꼼히 사실을 확인하는 절차예요.' },
    { id: 'stakeholder', term: '이해관계자', meaning: '그 일의 결과에 영향을 받는 사람·조직이에요.' },
    { id: 'kpi', term: '핵심성과지표', meaning: '목표를 얼마나 잘 이뤘는지 재는 기준이에요.' },
    { id: 'risk-assessment', term: '위험 평가', meaning: '일어날 수 있는 문제를 미리 따져 보는 일이에요.' },
    { id: 'portfolio', term: '포트폴리오', meaning: '맡고 있는 여러 업무나 자산을 모아 둔 것이에요.' },
    { id: 'valuation', term: '가치 평가', meaning: '어떤 것의 가치를 숫자로 계산하는 일이에요.' },
    { id: 'arbitration-term', term: '중재', meaning: '분쟁을 제3자가 대신 판단해 해결하는 절차예요.' },
  ],
  healthcare: [
    { id: 'stethoscope-h', term: '청진기', meaning: '심장·폐 소리를 듣는 도구예요.' },
    { id: 'thermometer-h', term: '체온계', meaning: '몸의 온도를 재는 도구예요.' },
    { id: 'bandage-h', term: '붕대', meaning: '상처를 감싸는 천이에요.' },
    { id: 'prescription-h', term: '처방전', meaning: '어떤 약을 먹어야 하는지 적은 문서예요.' },
    { id: 'checkup', term: '건강검진', meaning: '몸 상태를 미리 확인하는 검사예요.' },
    { id: 'diagnosis', term: '진단', meaning: '어떤 병인지 알아내는 일이에요.' },
    { id: 'symptom', term: '증상', meaning: '몸이 아플 때 나타나는 신호예요.' },
    { id: 'vaccination', term: '예방접종', meaning: '병에 걸리지 않도록 미리 맞는 주사예요.' },
    { id: 'rehabilitation', term: '재활', meaning: '다친 몸을 다시 잘 움직이게 훈련하는 과정이에요.' },
    { id: 'clinical-trial', term: '임상시험', meaning: '새로운 치료법이 안전한지 확인하는 연구예요.' },
    { id: 'pathology', term: '병리학', meaning: '병이 왜, 어떻게 생기는지 연구하는 학문이에요.' },
    { id: 'anesthesia', term: '마취', meaning: '수술 중 아픔을 느끼지 않게 하는 처치예요.' },
    { id: 'chronic-disease', term: '만성질환', meaning: '오래 지속되는 병이에요.' },
    { id: 'informed-consent', term: '사전 동의', meaning: '치료 전에 환자가 충분히 설명을 듣고 동의하는 절차예요.' },
    { id: 'epidemiology', term: '역학', meaning: '병이 얼마나, 왜 퍼지는지 연구하는 학문이에요.' },
    { id: 'palliative-care', term: '완화치료', meaning: '통증과 불편을 줄여 삶의 질을 높이는 치료예요.' },
  ],
  education: [
    { id: 'textbook', term: '교과서', meaning: '배울 내용을 담은 책이에요.' },
    { id: 'lesson-plan', term: '수업계획안', meaning: '어떻게 가르칠지 미리 짜 둔 계획이에요.' },
    { id: 'quiz', term: '쪽지시험', meaning: '짧게 보는 작은 시험이에요.' },
    { id: 'curriculum', term: '교육과정', meaning: '무엇을 순서대로 가르칠지 정한 전체 계획이에요.' },
    { id: 'assessment', term: '평가', meaning: '얼마나 잘 배웠는지 확인하는 일이에요.' },
    { id: 'pedagogy', term: '교수법', meaning: '효과적으로 가르치는 방법에 대한 학문이에요.' },
    { id: 'literature-review', term: '문헌 연구', meaning: '기존 자료들을 찾아 정리하며 연구하는 과정이에요.' },
    { id: 'thesis', term: '논문', meaning: '연구 결과를 정리해 발표하는 글이에요.' },
    { id: 'citation', term: '인용', meaning: '다른 사람의 글이나 자료를 밝히고 가져다 쓰는 일이에요.' },
    { id: 'peer-review', term: '동료 평가', meaning: '같은 분야 전문가가 연구를 검토하는 절차예요.' },
    { id: 'translation-term', term: '번역', meaning: '한 언어를 다른 언어로 옮기는 일이에요.' },
    { id: 'linguistics', term: '언어학', meaning: '언어의 구조와 쓰임을 연구하는 학문이에요.' },
    { id: 'classroom-management', term: '학급 운영', meaning: '수업과 학생들을 잘 이끌어 가는 일이에요.' },
    { id: 'formative-assessment', term: '형성평가', meaning: '배우는 중간에 이해도를 확인하는 평가예요.' },
    { id: 'syllabus', term: '강의계획서', meaning: '한 학기 수업 내용을 정리한 안내문이에요.' },
    { id: 'research-grant', term: '연구비', meaning: '연구를 위해 지원받는 돈이에요.' },
  ],
  culture: [
    { id: 'script', term: '대본', meaning: '연기할 내용을 적어 둔 글이에요.' },
    { id: 'canvas', term: '캔버스', meaning: '그림을 그리는 천이에요.' },
    { id: 'camera', term: '카메라', meaning: '사진이나 영상을 찍는 기계예요.' },
    { id: 'melody', term: '멜로디', meaning: '음의 높낮이가 이어지는 선율이에요.' },
    { id: 'manuscript', term: '원고', meaning: '출판하기 전에 쓴 글이에요.' },
    { id: 'composition', term: '구도', meaning: '그림·사진에서 요소를 배치하는 방법이에요.' },
    { id: 'rehearsal', term: '리허설', meaning: '실제처럼 미리 연습하는 일이에요.' },
    { id: 'storyboard', term: '스토리보드', meaning: '장면을 그림으로 미리 짜 둔 설계도예요.' },
    { id: 'copyright', term: '저작권', meaning: '만든 사람이 자기 작품을 보호받는 권리예요.' },
    { id: 'genre', term: '장르', meaning: '작품을 성격별로 나눈 갈래예요.' },
    { id: 'portfolio-c', term: '포트폴리오', meaning: '자신의 작품을 모아 보여주는 자료예요.' },
    { id: 'blueprint', term: '설계도', meaning: '건물이나 구조물을 짓기 전에 그리는 도면이에요.' },
    { id: 'exposure', term: '노출', meaning: '사진에 빛이 들어오는 정도예요.' },
    { id: 'collection', term: '컬렉션', meaning: '같은 주제로 모은 작품들이에요.' },
    { id: 'editing-c', term: '편집', meaning: '찍거나 쓴 것을 다듬어 완성하는 과정이에요.' },
    { id: 'premiere', term: '시사회', meaning: '작품을 처음 공개하는 자리예요.' },
  ],
  service: [
    { id: 'apron', term: '앞치마', meaning: '옷이 더러워지지 않게 입는 작업복이에요.' },
    { id: 'tray', term: '쟁반', meaning: '물건을 올려 나르는 도구예요.' },
    { id: 'uniform', term: '유니폼', meaning: '같은 곳에서 일하는 사람들이 입는 옷이에요.' },
    { id: 'customer-service', term: '고객 응대', meaning: '손님을 맞이하고 돕는 일이에요.' },
    { id: 'inventory', term: '재고 관리', meaning: '물건이 얼마나 있는지 확인하고 관리하는 일이에요.' },
    { id: 'order-taking', term: '주문 받기', meaning: '손님이 원하는 것을 듣고 적는 일이에요.' },
    { id: 'safety-gear', term: '안전장비', meaning: '다치지 않도록 착용하는 장비예요.' },
    { id: 'shift', term: '교대 근무', meaning: '시간을 나눠서 돌아가며 일하는 방식이에요.' },
    { id: 'first-aid', term: '응급처치', meaning: '다쳤을 때 먼저 하는 간단한 처치예요.' },
    { id: 'community-service', term: '지역사회 봉사', meaning: '동네 사람들을 돕는 활동이에요.' },
    { id: 'case-management', term: '사례 관리', meaning: '도움이 필요한 사람을 꾸준히 살피고 돕는 일이에요.' },
    { id: 'event-logistics', term: '행사 운영', meaning: '행사가 순조롭게 진행되도록 준비하는 일이에요.' },
    { id: 'public-service', term: '공공 서비스', meaning: '모두를 위해 나라나 지자체가 제공하는 서비스예요.' },
    { id: 'standard-operating-procedure', term: '표준 운영 절차', meaning: '정해진 순서대로 일을 처리하는 방법이에요.' },
    { id: 'quality-control', term: '품질 관리', meaning: '물건이나 서비스가 기준에 맞는지 확인하는 일이에요.' },
    { id: 'emergency-response', term: '비상 대응', meaning: '갑작스러운 사고에 빠르게 대처하는 일이에요.' },
  ],
}

// 'custom'(자유 입력 직업)은 카테고리가 없으므로 전문직 뱅크로 대체한다
// — 직업명 자체는 그대로 보여주되(화면 쪽 라벨), 카드 용어는 일반
// 업무 어휘를 쓴다.
export function professionCardTerms(profession: ProfessionId): ProfessionCardTerm[] {
  const specific = SPECIFIC_TERMS[profession]
  if (specific) return specific
  const category = PROFESSION_CATEGORY[profession]
  return CATEGORY_TERMS[category ?? 'professional']
}

// 지시서 2번: 연령대별 쌍 수. toddler/teen은 10대 안에서도 10~12세와
// 13~19세로 한 번 더 나뉜다(ageNumberForTier로 이미 쓰고 있는 것과
// 같은 패턴) — 쉬운 용어부터 정렬돼 있으므로 쌍 수만 다르면 자동으로
// 난이도도 함께 올라간다. 60세(master_50s 안에서 ageNumber>=60)는
// 기존 최종 종합평가 체계를 그대로 두고 이 함수를 쓰지 않는다.
export function cardMatchPairCount(tier: AgeTier, ageNumber: number): number {
  if (tier === 'toddler') return 4
  if (tier === 'teen') return ageNumber <= 12 ? 6 : 8
  if (tier === 'junior_20s') return 10
  if (tier === 'career_30s') return 12
  if (tier === 'veteran_40s') return 14
  return 16 // master_50s
}
