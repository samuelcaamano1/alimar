import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AdminApp from './AdminApp.tsx'
import CustomerAccount from './CustomerAccount.tsx'

const isAdminRoute = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')
const isCustomerAccountRoute =
  window.location.pathname === '/cuenta' || window.location.pathname.startsWith('/cuenta/')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdminRoute ? <AdminApp /> : isCustomerAccountRoute ? <CustomerAccount /> : <App />}
  </StrictMode>,
)
