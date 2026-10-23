/**
 * 문서(룰북) 캐시. 서버에서 'document.updated' 이벤트가 오면 다시 불러오고 갱신 배너를 띄운다.
 * 룰북은 GET /api/rules 한 번으로 역할에 맞게 받는다 (docs/98.룰북_팀별룰.md):
 * 참가자 = 전체 룰 + 자기 팀 룰(게임 시작 후), 프레젠테이션 = 전체 룰, 관리자 = 전체 룰 + 모든 팀 룰.
 * 받은 문서는 slug 별로 docs 에도 넣어 배너 제목·편집기에서 같이 쓴다.
 */
import { defineStore } from 'pinia'
import type { DocumentInfo, RulesResponse } from '../../../shared/types'
import { api } from '../lib/api'

export const GLOBAL_RULES_SLUG = 'rules'
const isRuleSlug = (slug: string) => slug === GLOBAL_RULES_SLUG || slug.startsWith('team-')

export const useDocumentsStore = defineStore('documents', {
  state: () => ({
    docs: {} as Record<string, DocumentInfo>,
    rules: null as RulesResponse | null,
    /** 갱신 알림을 띄울 slug 목록 (사용자가 닫으면 제거) */
    updated: [] as string[],
  }),
  actions: {
    async load(slug: string): Promise<DocumentInfo | null> {
      if (isRuleSlug(slug)) return (await this.loadRules())?.global ?? null
      try {
        const res = await api.get<{ document: DocumentInfo }>(`/api/documents/${slug}`)
        this.docs[slug] = res.document
        return res.document
      } catch {
        return null
      }
    },
    async loadRules(): Promise<RulesResponse | null> {
      try {
        const res = await api.get<RulesResponse>('/api/rules')
        this.rules = res
        for (const d of [res.global, res.team, ...(res.teams ?? [])]) if (d) this.docs[d.slug] = d
        return res
      } catch {
        return null
      }
    },
    /** 실시간 이벤트 수신 시 */
    async onUpdated(slug: string) {
      await this.load(slug)
      if (!this.updated.includes(slug)) this.updated.push(slug)
    },
    dismiss(slug: string) {
      this.updated = this.updated.filter((s) => s !== slug)
    },
    /** 관리자가 저장한 응답을 바로 반영 (rules 안의 같은 문서도 바꾼다) */
    set(doc: DocumentInfo) {
      this.docs[doc.slug] = doc
      const r = this.rules
      if (!r) return
      if (r.global.slug === doc.slug) r.global = doc
      if (r.team?.slug === doc.slug) r.team = doc
      if (r.teams) r.teams = r.teams.map((t) => (t.slug === doc.slug ? doc : t))
    },
    /** 갱신 배너 닫기용: 룰북 전체(전체 룰 + 팀 룰) */
    dismissRules() {
      this.updated = this.updated.filter((s) => !isRuleSlug(s))
    },
    clear() {
      this.docs = {}
      this.rules = null
      this.updated = []
    },
  },
})
