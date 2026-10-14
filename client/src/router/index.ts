import { createRouter, createWebHistory } from 'vue-router'
import type { Role } from '../../../shared/types'
import { useAuthStore } from '../stores/auth'

declare module 'vue-router' {
  interface RouteMeta { roles?: Role[]; public?: boolean }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: () => useAuthStore().homePath },
    { path: '/login', component: () => import('../views/LoginView.vue'), meta: { public: true } },
    { path: '/admin', component: () => import('../views/AdminView.vue'), meta: { roles: ['admin'] } },
    { path: '/present', component: () => import('../views/PresentView.vue'), meta: { roles: ['presenter', 'admin'] } },
    { path: '/group', component: () => import('../views/GroupView.vue'), meta: { roles: ['member'] } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.public) return auth.isLoggedIn ? auth.homePath : true
  if (!auth.isLoggedIn) return { path: '/login', query: { redirect: to.fullPath } }
  if (to.meta.roles && !to.meta.roles.includes(auth.user!.role)) return auth.homePath
  return true
})
