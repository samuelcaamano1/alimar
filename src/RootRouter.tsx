import { Suspense, lazy } from 'react'

const AppRoute = lazy(() => import('./App.tsx'))
const AdminRoute = lazy(() => import('./AdminApp.tsx'))
const CustomerAccountRoute = lazy(() => import('./CustomerAccount.tsx'))

function RouteFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      Cargando Alimar…
    </div>
  )
}

export default function RootRouter() {
  const isAdminRoute =
    window.location.pathname === '/admin' ||
    window.location.pathname.startsWith('/admin/')

  const isCustomerAccountRoute =
    window.location.pathname === '/cuenta' ||
    window.location.pathname.startsWith('/cuenta/')

  return (
    <Suspense fallback={<RouteFallback />}>
      {isAdminRoute ? (
        <AdminRoute />
      ) : isCustomerAccountRoute ? (
        <CustomerAccountRoute />
      ) : (
        <AppRoute />
      )}
    </Suspense>
  )
}
