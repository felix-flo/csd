/**
 * 문서(룰 등) 캐시. 서버에서 'document.updated' 이벤트가 오면 다시 불러오고 갱신 배너를 띄운다.
 */
import { defineStore } from 'pinia'
import type { DocumentInfo } from '../../../shared/types'
import { api } from '../lib/api'

export const useDocumentsStore = defineStore('documents', {
  state: () => ({
    docs: {} as Record<string, DocumentInfo>,
    /** 갱신 알림을 띄울 slug 목록 (사용자가 닫으면 제거) */
    updated: [] as string[],
  }),
  actions: {
    async load(slug: string): Promise<DocumentInfo | null> {
      try {
        const res = await api.get<{ document: DocumentInfo }>(`/api/documents/${slug}`)
        this.docs[slug] = res.document
        return res.document
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
    set(doc: DocumentInfo) {
      this.docs[doc.slug] = doc
    },
    clear() {
      this.docs = {}
      this.updated = []
    },
  },
})
