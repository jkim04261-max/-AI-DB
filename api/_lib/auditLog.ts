import { ensureAuditLogTable, sql } from './db'

// 지시서(개인 마스터 DB 소유자 통제 및 보안 시스템) 3번: "본인이라도
// 데이터에 접근할 때마다 '누가, 언제, 어떤 데이터를 조회했는지' 감사
// 로그를 기록하세요" — 유저 본인의 "개인 마스터 DB"에 해당하는 데이터
// (AI 캐릭터가 학습한 지식, 지식 기록장)에 접근할 때마다 이 함수를
// 호출한다. 채팅(conversations/messages)이나 캐릭터의 레벨/미션
// 진행도처럼 "콘텐츠"가 아닌 조회는 대상이 아니다 — 로그 자체가
// 소음이 되지 않도록, 실제 개인 기록 콘텐츠에 대한 접근만 남긴다.
export type AuditAction = 'view' | 'create' | 'update' | 'delete'
// 'market_item': 지시서(만능마켓·공유·거래 후속 개발을 위한 데이터
// 구조 및 정책 설계) — 지식/마스터 패키지를 마켓에 등록하는 것도 개인
// 콘텐츠(personal_knowledge_log/character_knowledge)를 바탕으로 새
// 레코드를 만드는 행위라 같은 감사 로그 대상으로 묶는다.
export type AuditResourceType = 'character_knowledge' | 'character_messages' | 'personal_knowledge_log' | 'market_item'

// 감사 로그 기록 실패가 실제 기능을 막으면 안 된다 — 로그는 보안
// 점검을 위한 보조 수단이지, 서비스 이용을 차단하는 조건이 아니다.
// 그래서 호출부는 이 함수가 던지는 에러를 신경 쓸 필요가 없다(항상
// 성공하는 Promise를 반환하고, 실패는 콘솔에만 남긴다).
export async function recordDataAccess(
  userId: number,
  action: AuditAction,
  resourceType: AuditResourceType,
  resourceId: number | null,
): Promise<void> {
  try {
    await ensureAuditLogTable()
    await sql`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id)
      VALUES (${userId}, ${action}, ${resourceType}, ${resourceId})
    `
  } catch (err) {
    console.error('[auditLog] failed to record data access', err)
  }
}
