import LegalPageLayout, { LegalSection } from '../components/LegalPageLayout'

const EFFECTIVE_DATE = '2026-10-22'

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
          <li>
            <span className="font-medium text-slate-700">AI 키우기(누리·두리) 정보</span> — 생성한 캐릭터(누리/두리)와
            선택한 직업, 이용자가 직접 가르친 지식, 캐릭터가 스스로 학습한 지식(둘은 "출처"로 구분되어
            저장됩니다), 각 지식에 대한 Gemini 검증 결과(적합/수정 필요/검증 불가 및 그 설명)
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
          <li>AI 키우기(누리·두리) 캐릭터의 생성·성장 및 학습 기록 저장, 재접속 시 복원</li>
          <li>서비스 운영, 오류 대응 및 품질 개선</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. 보유 및 이용기간">
        <p>
          개인정보는 원칙적으로 회원 탈퇴 시까지 보유합니다. 이용자는 마이페이지에서 언제든지 계정 전체를
          삭제(회원탈퇴)할 수 있으며, 개별 대화도 언제든지 직접 삭제할 수 있습니다.
        </p>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          TODO (운영 전 확인 필요): 가르친/학습한 지식을 건(개별 항목) 단위로 삭제하는 기능은 아직 제공되지
          않습니다 — 현재는 개별 대화 삭제 또는 계정 전체 삭제로만 지식 데이터를 지울 수 있습니다. 개별 지식
          삭제 기능 제공 시점까지의 안내와, 실제 운영 전 최종 보유기간을 별도로 정해야 합니다.
        </p>
      </LegalSection>

      <LegalSection title="4. 개인정보 삭제">
        <p>
          이용자가 대화를 삭제하면 해당 대화와 메시지, 첨부파일 메타데이터는 데이터베이스에서 즉시
          삭제됩니다. 이용자가 마이페이지에서 계정(회원) 삭제를 요청하면, 그 계정에 연결된 모든
          대화·메시지·첨부파일 메타데이터·캐릭터·학습 기록이 데이터베이스에서 함께 즉시 삭제됩니다(삭제
          즉시 되돌릴 수 없습니다).
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
          <li>자신의 대화 기록과 AI 키우기 학습 기록을 언제든지 조회하고, 개별 대화를 삭제할 수 있습니다.</li>
          <li>마이페이지에서 계정 전체를 삭제(회원탈퇴)할 수 있습니다.</li>
          <li>개인정보 처리에 관해 문의하거나 처리 정지를 요청할 수 있습니다.</li>
        </ul>
      </LegalSection>

      <LegalSection title="8. 개인정보 보호 문의 방법">
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          TODO (운영 전 확인 필요): 개인정보 관련 문의를 받을 담당자 또는 연락처(이메일 등)가 아직
          지정되지 않았습니다. 서비스 정식 운영 전 반드시 지정해 이 항목에 반영해야 합니다.
        </p>
      </LegalSection>

      <LegalSection title="9. AI 키우기(누리·두리) 데이터 처리 안내">
        <p>
          "AI 키우기(누리·두리)"는 이용자가 캐릭터에게 직접 가르친 지식과, 캐릭터가 스스로 생성·학습한
          지식을 각각 "출처"를 구분하여 저장합니다. 두 경우 모두 Gemini가 내용을 검토해 적합/수정
          필요/검증 불가로 평가하며, 적합 판정을 받고 이용자가 저장을 확정한 지식만 학습 기록으로
          남습니다.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            이용자의 캐릭터·학습 데이터는 그 이용자의 계정에만 귀속되며, 다른 이용자에게 공유되거나 다른
            이용자의 캐릭터·대화에 노출되지 않습니다.
          </li>
          <li>
            이 데이터를 다른 이용자와 공유하거나, 누리AI 운영을 위한 공용 학습 데이터(여러 이용자의 데이터를
            모아 만드는 학습 자료 등)로 활용하는 기능은 없으며, 향후 그런 기능을 추가할 경우 별도의 명시적
            동의(opt-in) 없이는 적용하지 않습니다.
          </li>
          <li>
            여기서 "학습"은 저장된 지식·대화 맥락을 DB에서 불러와 다음 대화나 평가에 참고 자료로 활용하는
            것을 의미하며, Google Gemini 모델 자체의 가중치를 재학습시키는 것이 아닙니다. 입력 내용이
            Gemini API로 전달되는 방식은 위 6항과 동일합니다.
          </li>
        </ul>
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
