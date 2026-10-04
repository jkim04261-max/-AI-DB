import LegalPageLayout, { LegalSection } from '../components/LegalPageLayout'

const EFFECTIVE_DATE = '2026-10-04'

export default function TermsPage() {
  return (
    <LegalPageLayout
      title="이용약관"
      effectiveDate={EFFECTIVE_DATE}
      intro="누리AI는 현재 베타(개발) 단계로 서비스되고 있으며, 기능과 정책이 사전 고지 없이 변경되거나 일시 중단될 수 있습니다."
    >
      <LegalSection title="1. 서비스 목적">
        <p>
          이 약관은 누리AI(이하 "서비스")가 제공하는 AI 기반 대화 서비스의 이용 조건, 이용자와 서비스
          제공자의 권리·의무 및 책임 사항을 정하는 것을 목적으로 합니다.
        </p>
      </LegalSection>

      <LegalSection title="2. 이용자의 권리와 의무">
        <ul className="list-disc space-y-1 pl-5">
          <li>이용자는 서비스를 본래 목적에 맞게 이용할 권리를 가집니다.</li>
          <li>이용자는 가입 시 정확한 이메일 정보를 제공해야 하며, 타인의 계정을 도용해서는 안 됩니다.</li>
          <li>
            이용자는 서비스를 불법적인 목적, 타인의 권리 침해, 서비스 운영 방해 등의 목적으로 사용해서는
            안 됩니다.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. 계정 관리">
        <p>
          계정은 이메일과 비밀번호로 생성되며, 계정 정보(비밀번호 등)의 관리 책임은 이용자 본인에게
          있습니다. 비밀번호가 유출되었거나 계정이 부정하게 사용된 것으로 의심되는 경우 즉시 서비스에
          알려야 합니다.
        </p>
      </LegalSection>

      <LegalSection title="4. AI 서비스의 특성">
        <p>
          서비스가 제공하는 AI 답변은 인공지능 모델이 자동으로 생성한 결과이며, 사실과 다르거나 부정확한
          내용을 포함할 수 있습니다. AI 답변의 신뢰성과 활용에 대한 자세한 안내는{' '}
          <a href="/ai-notice" className="font-medium text-indigo-600 hover:underline">
            AI 서비스 이용 고지
          </a>
          를 따릅니다.
        </p>
      </LegalSection>

      <LegalSection title="5. 이용 제한">
        <p>
          이용자가 이 약관 또는 관련 법령을 위반한 경우, 서비스는 사전 통지 후(긴급한 경우 사후 통지)
          해당 이용자의 서비스 이용을 제한하거나 계정 이용을 정지할 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="6. 서비스 변경/중단">
        <p>
          서비스는 현재 베타(개발) 단계로, 기능 추가·변경·중단이 수시로 발생할 수 있습니다. 운영상·기술상
          필요한 경우 서비스의 전부 또는 일부를 사전 고지 후 변경하거나 중단할 수 있으며, 불가피한 경우
          사전 고지 없이 중단될 수도 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="7. 지식재산권 기본 원칙">
        <p>
          서비스 자체(디자인, UI, 소스코드 등)에 대한 지식재산권은 서비스 제공자에게 귀속됩니다. 이용자가
          서비스에 입력한 텍스트·이미지 등 콘텐츠에 대한 권리는 원칙적으로 이용자 본인에게 있으며,
          서비스는 답변 생성 등 서비스 제공에 필요한 범위 내에서만 이를 처리합니다.
        </p>
      </LegalSection>

      <LegalSection title="8. 책임 제한">
        <p>
          서비스는 베타 단계 특성상 무중단 운영이나 완전한 정확성을 보장하지 않습니다. AI 답변을 포함한
          서비스 이용 결과에 대한 판단과 활용은 이용자 본인의 책임이며, 법령상 허용되는 범위에서 서비스
          제공자는 이로 인해 발생한 손해에 대한 책임을 지지 않습니다.
        </p>
      </LegalSection>

      <LegalSection title="9. 약관 변경 및 고지">
        <p>
          약관이 변경되는 경우 변경 사항과 적용일자를 서비스 내 공지를 통해 안내합니다. 변경된 약관은
          공지된 시행일부터 효력이 발생합니다.
        </p>
      </LegalSection>

      <LegalSection title="10. 시행일">
        <p>이 약관은 {EFFECTIVE_DATE}부터 시행됩니다.</p>
      </LegalSection>
    </LegalPageLayout>
  )
}
