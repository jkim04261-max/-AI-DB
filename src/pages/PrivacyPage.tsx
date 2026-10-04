import LegalPageLayout, { LegalSection } from '../components/LegalPageLayout'

const EFFECTIVE_DATE = '2026-10-04'

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      title="개인정보처리방침"
      effectiveDate={EFFECTIVE_DATE}
      intro="이 방침은 누리AI가 실제로 수집·처리하는 정보만을 기준으로 작성되었습니다. 누리AI는 현재 베타(개발) 단계이며, 서비스 확장에 따라 이 방침도 함께 변경될 수 있습니다."
    >
      <LegalSection title="1. 처리하는 개인정보 항목">
        <p>누리AI는 회원가입 및 서비스 이용 과정에서 아래 정보를 수집·생성합니다.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="font-medium text-slate-700">계정 정보</span> — 가입 시 입력한 이메일, 비밀번호
            (암호화하여 저장되며 평문으로는 저장되지 않습니다)
          </li>
          <li>
            <span className="font-medium text-slate-700">대화 내용</span> — 이용자가 입력한 메시지와 AI가
            생성한 응답, 대화 제목, 대화/메시지 생성·수정 시각
          </li>
          <li>
            <span className="font-medium text-slate-700">첨부 이미지 정보</span> — 대화에 첨부한 이미지
            파일(최대 5장, 장당 8MB 이하) 자체와, 해당 파일의 저장 위치(URL)·형식·파일명 등 메타데이터
          </li>
        </ul>
        <p className="text-xs text-slate-400">
          현재 누리AI는 실명, 전화번호, 주소, 결제 정보 등은 수집하지 않습니다. (이용 플랜은 결제 기능 없이
          무료 플랜으로만 제공됩니다.)
        </p>
      </LegalSection>

      <LegalSection title="2. 개인정보 처리 목적">
        <ul className="list-disc space-y-1 pl-5">
          <li>회원 식별 및 로그인 인증</li>
          <li>AI 대화 서비스 제공, 대화 기록 저장 및 재접속 시 복원</li>
          <li>서비스 운영, 오류 대응 및 품질 개선</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. 보유 및 이용기간">
        <p>
          개인정보는 원칙적으로 회원 탈퇴 시까지 보유합니다. 다만 현재 버전에서는 이용자가 직접 계정 전체를
          삭제(회원탈퇴)하는 기능은 아직 제공되지 않으며(준비 중), 개별 대화는 이용자가 언제든지 직접 삭제할
          수 있습니다.
        </p>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          TODO (운영 전 확인 필요): 회원탈퇴·계정 데이터 삭제 기능이 구현되기 전까지의 보유기간 및 삭제 요청
          처리 절차를 별도로 정해야 합니다.
        </p>
      </LegalSection>

      <LegalSection title="4. 개인정보 삭제">
        <p>
          이용자가 대화를 삭제하면 해당 대화와 메시지, 첨부파일 메타데이터는 데이터베이스에서 즉시
          삭제됩니다. 계정(회원) 자체를 삭제하면 그 계정에 연결된 모든 대화·메시지·첨부파일 메타데이터도
          함께 삭제되도록 데이터베이스가 설계되어 있습니다. 다만 위 3항과 같이 계정 삭제 기능 자체는 아직
          화면에 제공되지 않습니다.
        </p>
      </LegalSection>

      <LegalSection title="5. 제3자 제공 여부">
        <p>
          누리AI는 법령에 근거가 있거나 이용자가 별도로 동의한 경우를 제외하고 개인정보를 제3자에게
          제공하지 않습니다. 서비스 제공을 위해 아래 6항의 외부 서비스에 처리를 위탁할 수 있습니다.
        </p>
      </LegalSection>

      <LegalSection title="6. 외부 서비스 및 처리위탁 안내">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="font-medium text-slate-700">Google Gemini API</span> — AI 응답을 생성하기 위해
            이용자가 입력한 메시지 내용과 첨부 이미지가 Google의 Gemini API로 전달됩니다.
          </li>
          <li>
            <span className="font-medium text-slate-700">Vercel</span> — 서비스 호스팅, 서버 실행(서버리스
            함수), 회원·대화 데이터가 저장되는 데이터베이스(Vercel Postgres), 첨부 이미지 파일이 저장되는
            스토리지(Vercel Blob)를 제공하는 인프라 사업자입니다.
          </li>
        </ul>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          TODO (운영 전 확인 필요): Google·Vercel(및 Vercel Postgres의 하부 데이터베이스 인프라)이 실제로
          데이터를 보관하는 기간, 저장 위치(국가), 자체 처리방침 등 업체별 세부 조건은 각 업체의 공식 정책을
          확인해 반영해야 합니다.
        </p>
      </LegalSection>

      <LegalSection title="7. 이용자의 권리">
        <ul className="list-disc space-y-1 pl-5">
          <li>자신의 대화 기록을 언제든지 조회하고, 개별 대화를 삭제할 수 있습니다.</li>
          <li>개인정보 처리에 관해 문의하거나 처리 정지를 요청할 수 있습니다.</li>
          <li>계정 전체 삭제(회원탈퇴) 기능은 준비 중이며, 제공 전까지는 아래 8항의 방법으로 문의할 수 있습니다.</li>
        </ul>
      </LegalSection>

      <LegalSection title="8. 개인정보 보호 문의 방법">
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          TODO (운영 전 확인 필요): 개인정보 관련 문의를 받을 담당자 또는 연락처(이메일 등)가 아직
          지정되지 않았습니다. 서비스 정식 운영 전 반드시 지정해 이 항목에 반영해야 합니다.
        </p>
      </LegalSection>

      <LegalSection title="9. 향후 예정 기능에 관한 안내 (AI 키우기 등)">
        <p>
          누리AI는 향후 "AI 키우기(누리·두리)"와 같이 이용자가 제공하는 데이터를 활용하는 참여형 학습
          기능을 추가할 수 있습니다. 다만 해당 기능은 현재 구현되어 있지 않으며, 현재 이 방침이 적용되는
          시점 기준으로 누리AI는 이용자의 대화 내용을 AI 모델 학습에 사용하지 않습니다.
        </p>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          TODO: 위 기능을 실제로 구현할 경우, 개인용 데이터와 공유 학습용 데이터의 구분, 명시적 opt-in 동의,
          동의 철회, 데이터 삭제, 비식별화·정제 절차를 포함한 별도의 정책을 수립하고 사용자 동의를 받아야
          합니다.
        </p>
      </LegalSection>

      <LegalSection title="10. 정책 변경 및 시행일">
        <p>
          이 방침이 변경되는 경우 변경 사항을 서비스 내 공지를 통해 안내합니다. 이 방침은{' '}
          {EFFECTIVE_DATE}부터 시행됩니다.
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}
