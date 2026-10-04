import LegalPageLayout, { LegalSection } from '../components/LegalPageLayout'

const EFFECTIVE_DATE = '2026-10-04'

export default function AiNoticePage() {
  return (
    <LegalPageLayout
      title="AI 서비스 이용 고지"
      effectiveDate={EFFECTIVE_DATE}
      intro="누리AI의 AI 대화 기능을 이용하기 전에 아래 내용을 꼭 확인해 주세요."
    >
      <LegalSection title="1. AI 답변은 오류가 있을 수 있어요">
        <p>
          누리AI의 답변은 인공지능 모델이 자동으로 생성한 결과입니다. 실제 사실과 다르거나, 오래된 정보이거나,
          부정확한 내용을 포함할 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="2. 중요한 정보는 반드시 별도로 확인해 주세요">
        <p>
          수치, 날짜, 법령, 고유명사 등 중요한 사실 정보는 AI 답변만 믿지 말고 신뢰할 수 있는 다른 자료나
          출처를 통해 다시 확인해 주세요.
        </p>
      </LegalSection>

      <LegalSection title="3. 전문적인 판단이 필요한 경우">
        <p>
          의료, 법률, 금융 등 전문적인 판단이 필요한 사항을 AI의 답변만으로 최종 결정하지 마세요. 반드시
          해당 분야의 자격을 갖춘 전문가와 상담한 뒤 결정해 주세요.
        </p>
      </LegalSection>

      <LegalSection title="4. 입력한 내용은 외부 AI 서비스로 전달될 수 있어요">
        <p>
          대화창에 입력한 텍스트와 첨부한 이미지는 답변을 생성하기 위해 외부 AI 서비스로 전송됩니다. 민감한
          개인정보나 공개되면 안 되는 정보는 입력하지 않는 것을 권장합니다.
        </p>
      </LegalSection>

      <LegalSection title="5. 현재 연결된 AI 모델">
        <p>
          현재 누리AI에서 실제로 응답을 생성하는 AI 모델은{' '}
          <span className="font-medium text-slate-700">Google Gemini</span>뿐입니다. 화면에 표시되는
          GPT·Claude·DeepSeek 등 다른 AI는 아직 연동되어 있지 않으며, 연동 전까지는 "준비 중"으로만
          표시됩니다.
        </p>
      </LegalSection>

      <LegalSection title="6. AI 생성 결과의 활용 책임">
        <p>
          AI가 생성한 답변을 활용하거나 외부에 공유·배포함으로써 발생하는 책임은 이를 활용한 이용자 본인에게
          있습니다.
        </p>
      </LegalSection>

      <LegalSection title="7. 시행일">
        <p>이 고지는 {EFFECTIVE_DATE}부터 적용됩니다.</p>
      </LegalSection>
    </LegalPageLayout>
  )
}
