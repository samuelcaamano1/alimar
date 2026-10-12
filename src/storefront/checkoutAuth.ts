export type CheckoutAuthMode = 'login' | 'register'

export type CheckoutAuthInput = {
  name: string
  phone: string
  email: string
  password: string
}

export function checkoutAuthEndpoint(mode: CheckoutAuthMode) {
  return `/api/orders?action=${
    mode === 'register' ? 'account-register' : 'account-login'
  }`
}

export function checkoutAuthPayload(
  mode: CheckoutAuthMode,
  input: CheckoutAuthInput,
) {
  const email = input.email.trim()
  const password = input.password

  if (mode === 'login') {
    return { email, password }
  }

  return {
    name: input.name.trim(),
    phone: input.phone.trim(),
    email,
    password,
  }
}
