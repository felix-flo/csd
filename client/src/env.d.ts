/// <reference types="vite/client" />
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
/** 빌드 식별자 (vite.config.ts 의 define). 개발 서버에서는 'dev' */
declare const __BUILD_ID__: string
