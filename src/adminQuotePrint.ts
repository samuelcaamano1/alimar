export type QuoteStatus =
  | 'draft'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'expired'

export type QuoteSnapshotCost = {
  key: string
  label: string
  detail: string
  total: number
}

export type QuoteSnapshot = {
  version: 1
  jobType: 'paper-print' | '3d-print' | 'manual'
  jobLabel: string
  quantity: number
  quantityLabel: string
  workerName: string
  projectHours: number
  printSides: 'single' | 'double' | null
  lightPercent: number
  wearPercent: number
  costs: QuoteSnapshotCost[]
  directCost: number
  lightCost: number
  wearCost: number
  realCost: number
  profitPercent: number
  roundingStep: number
  costPerUnit: number
  suggestedUnitPrice: number
  totalPrice: number
}

export type AdminQuote = {
  id: string
  public_code: string
  public_token: string
  status: QuoteStatus
  title: string
  customer_name: string | null
  customer_phone: string | null
  job_type: QuoteSnapshot['jobType']
  quantity: number
  valid_until: string | null
  notes: string | null
  snapshot: QuoteSnapshot
  direct_cost: string
  light_cost: string
  wear_cost: string
  real_cost: string
  profit_percent: string
  suggested_unit_price: string
  total_price: string
  order_code: string | null
  sent_at: string | null
  last_reminded_at: string | null
  created_at: string
  updated_at: string
}

const statusLabels: Record<QuoteStatus, string> = {
  draft: 'Borrador',
  sent: 'Enviado',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  expired: 'Vencido',
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function money(value: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

function dateLabel(value: string | null) {
  if (!value) return 'Sin vencimiento'

  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function dateTimeLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function quotePublicUrl(quote: AdminQuote) {
  const url = new URL('/', window.location.origin)
  url.searchParams.set('presupuesto', quote.public_token)
  return url.toString()
}

export function quoteCustomerWhatsappMessage(quote: AdminQuote) {
  const customer = quote.customer_name?.trim() || 'Hola'
  const validity = quote.valid_until ? dateLabel(quote.valid_until) : 'sin vencimiento'
  const publicUrl = quotePublicUrl(quote)

  return [
    `Hola ${customer}, te envío el presupuesto ${quote.public_code} de Alimar.`,
    '',
    `Trabajo: ${quote.title}`,
    `Cantidad: ${quote.quantity}`,
    `Total: ${money(Number(quote.total_price))}`,
    `Válido hasta: ${validity}`,
    '',
    `Podés verlo y aceptarlo acá: ${publicUrl}`,
    '',
    'Si preferís, también podés responderme por WhatsApp.',
  ].join('\n')
}

function customerWhatsappDigits(phone: string) {
  let digits = phone.replace(/\D/g, '')

  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('549')) return digits

  if (digits.startsWith('54')) {
    const local = digits.slice(2).replace(/^0/, '')
    return `549${local}`
  }

  if (digits.length === 10) {
    return `549${digits}`
  }

  return digits
}

export function quoteReminderWhatsappMessage(quote: AdminQuote) {
  const customer = quote.customer_name?.trim() || 'Hola'
  const validity = quote.valid_until ? dateLabel(quote.valid_until) : 'sin vencimiento'
  const publicUrl = quotePublicUrl(quote)

  return [
    `Hola ${customer}, te recuerdo que el presupuesto ${quote.public_code} de Alimar sigue disponible.`,
    '',
    `Trabajo: ${quote.title}`,
    `Total: ${money(Number(quote.total_price))}`,
    `Válido hasta: ${validity}`,
    '',
    `Podés revisarlo y aceptarlo acá: ${publicUrl}`,
    '',
    'Si querés cambiar algo, respondeme por este WhatsApp.',
  ].join('\n')
}

export function quoteReminderWhatsappUrl(quote: AdminQuote) {
  const phone = quote.customer_phone?.trim()
  if (!phone) return null

  const digits = customerWhatsappDigits(phone)
  if (digits.length < 8) return null

  return `https://wa.me/${digits}?text=${encodeURIComponent(
    quoteReminderWhatsappMessage(quote),
  )}`
}

export function quoteCustomerWhatsappUrl(quote: AdminQuote) {
  const phone = quote.customer_phone?.trim()
  if (!phone) return null

  const digits = customerWhatsappDigits(phone)
  if (digits.length < 8) return null

  return `https://wa.me/${digits}?text=${encodeURIComponent(
    quoteCustomerWhatsappMessage(quote),
  )}`
}

function rowsHtml(quote: AdminQuote) {
  return quote.snapshot.costs
    .map(
      (cost) => `
        <tr>
          <td>
            <strong>${escapeHtml(cost.label)}</strong>
            <span>${escapeHtml(cost.detail)}</span>
          </td>
          <td>${escapeHtml(money(cost.total))}</td>
        </tr>
      `,
    )
    .join('')
}

export function openQuotePrintView(
  quote: AdminQuote,
  existingWindow?: Window | null,
) {
  const target =
    existingWindow ??
    window.open('', '_blank', 'width=980,height=1200')

  if (!target) {
    return false
  }

  try {
    target.opener = null
  } catch {
    // Some browsers do not allow changing opener; the preview still works.
  }

  const customer = quote.customer_name?.trim() || 'Sin cliente asignado'
  const phone = quote.customer_phone?.trim() || 'Sin teléfono'
  const notes = quote.notes?.trim() || 'Sin notas'
  const worker = quote.snapshot.workerName || 'Sin persona asignada'
  const printMode =
    quote.snapshot.printSides === 'double'
      ? 'Doble faz'
      : quote.snapshot.printSides === 'single'
        ? 'Simple faz'
        : 'No aplica'

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(quote.public_code)} · Alimar</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --ink: #0c1014;
      --muted: #69747b;
      --blue: #64afc6;
      --blue-dark: #3f788a;
      --cream: #f3e8cf;
      --paper: #fffdf7;
      --line: rgba(12, 16, 20, .12);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      color: var(--ink);
      background: #e9edf0;
    }

    .toolbar {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      justify-content: center;
      gap: 10px;
      padding: 14px;
      background: rgba(12, 16, 20, .9);
      backdrop-filter: blur(8px);
    }

    .toolbar button {
      min-height: 42px;
      padding: 0 16px;
      border: 0;
      border-radius: 10px;
      color: #fff;
      background: var(--blue-dark);
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }

    .toolbar button.secondary {
      color: var(--ink);
      background: #fff;
    }

    .page {
      width: min(210mm, calc(100% - 28px));
      min-height: 297mm;
      margin: 20px auto 40px;
      padding: 18mm 17mm 16mm;
      background:
        radial-gradient(circle at 100% 0%, rgba(100, 175, 198, .12), transparent 27%),
        var(--paper);
      box-shadow: 0 18px 60px rgba(0,0,0,.14);
    }

    .brand {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 24px;
      padding-bottom: 14px;
      border-bottom: 2px solid var(--ink);
    }

    .brand-name {
      display: grid;
      gap: 2px;
    }

    .brand-name strong {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 32px;
      letter-spacing: -.04em;
    }

    .brand-name span {
      color: var(--blue-dark);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .14em;
      text-transform: uppercase;
    }

    .doc-meta {
      display: grid;
      justify-items: end;
      gap: 4px;
      text-align: right;
    }

    .doc-meta strong {
      font-size: 15px;
    }

    .doc-meta span {
      color: var(--muted);
      font-size: 10px;
    }

    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 24px;
      align-items: end;
      padding: 22px 0 18px;
    }

    .hero h1 {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 27px;
      line-height: 1.05;
      letter-spacing: -.04em;
    }

    .hero p {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.5;
    }

    .status {
      padding: 7px 10px;
      border: 1px solid rgba(63, 120, 138, .24);
      border-radius: 999px;
      color: var(--blue-dark);
      background: rgba(100, 175, 198, .1);
      font-size: 10px;
      font-weight: 850;
      white-space: nowrap;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }

    .card {
      min-height: 72px;
      padding: 11px 12px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: rgba(255,255,255,.45);
    }

    .card span {
      display: block;
      margin-bottom: 4px;
      color: var(--muted);
      font-size: 9px;
      font-weight: 800;
      letter-spacing: .07em;
      text-transform: uppercase;
    }

    .card strong {
      font-size: 12px;
    }

    .card small {
      display: block;
      margin-top: 4px;
      color: var(--muted);
      font-size: 10px;
      line-height: 1.35;
    }

    .section-title {
      margin: 19px 0 8px;
      color: var(--blue-dark);
      font-size: 10px;
      font-weight: 900;
      letter-spacing: .1em;
      text-transform: uppercase;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 12px;
    }

    th, td {
      padding: 9px 10px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      font-size: 10px;
    }

    th:last-child,
    td:last-child {
      width: 28%;
      text-align: right;
      white-space: nowrap;
    }

    th {
      color: var(--muted);
      background: rgba(100,175,198,.07);
      font-size: 9px;
      letter-spacing: .07em;
      text-transform: uppercase;
    }

    td strong,
    td span {
      display: block;
    }

    td span {
      margin-top: 2px;
      color: var(--muted);
      font-size: 9px;
      line-height: 1.35;
    }

    tr:last-child td { border-bottom: 0; }

    .totals {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(240px, .65fr);
      gap: 16px;
      align-items: start;
      margin-top: 14px;
    }

    .notes {
      min-height: 110px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: rgba(255,255,255,.35);
    }

    .notes strong {
      display: block;
      margin-bottom: 6px;
      font-size: 10px;
    }

    .notes p {
      margin: 0;
      color: var(--muted);
      font-size: 10px;
      line-height: 1.5;
      white-space: pre-wrap;
    }

    .total-box {
      display: grid;
      gap: 6px;
    }

    .total-line {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 7px 9px;
      border-bottom: 1px solid var(--line);
      font-size: 10px;
    }

    .total-line span { color: var(--muted); }

    .total-line.real {
      margin-top: 4px;
      border: 1px solid rgba(63,120,138,.25);
      border-radius: 10px;
      background: rgba(100,175,198,.1);
    }

    .final {
      margin-top: 6px;
      padding: 13px;
      border-radius: 12px;
      color: var(--cream);
      background: var(--ink);
    }

    .final span {
      display: block;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .final strong {
      display: block;
      margin-top: 4px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 23px;
    }

    .final small {
      display: block;
      margin-top: 3px;
      opacity: .76;
      font-size: 9px;
    }

    footer {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      margin-top: 26px;
      padding-top: 10px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 9px;
      line-height: 1.45;
    }

    @page {
      size: A4;
      margin: 0;
    }

    @media print {
      body { background: #fff; }
      .toolbar { display: none !important; }
      .page {
        width: 210mm;
        min-height: 297mm;
        margin: 0;
        box-shadow: none;
      }
    }

    @media (max-width: 720px) {
      .grid,
      .hero,
      .totals {
        grid-template-columns: 1fr;
      }

      .doc-meta {
        justify-items: start;
        text-align: left;
      }

      .page {
        padding: 22px;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Imprimir / Guardar PDF</button>
    <button class="secondary" type="button" onclick="window.close()">Cerrar</button>
  </div>

  <main class="page">
    <header class="brand">
      <div class="brand-name">
        <strong>Alimar</strong>
        <span>Ideas que se vuelven recuerdos</span>
      </div>

      <div class="doc-meta">
        <strong>${escapeHtml(quote.public_code)}</strong>
        <span>Presupuesto interno</span>
        <span>Creado ${escapeHtml(dateTimeLabel(quote.created_at))}</span>
      </div>
    </header>

    <section class="hero">
      <div>
        <h1>${escapeHtml(quote.title)}</h1>
        <p>
          ${escapeHtml(quote.snapshot.jobLabel)} · ${quote.quantity} unidad(es) ·
          válido hasta ${escapeHtml(dateLabel(quote.valid_until))}
        </p>
      </div>
      <div class="status">${escapeHtml(statusLabels[quote.status])}</div>
    </section>

    <section class="grid">
      <div class="card">
        <span>Cliente</span>
        <strong>${escapeHtml(customer)}</strong>
        <small>${escapeHtml(phone)}</small>
      </div>

      <div class="card">
        <span>Trabajo</span>
        <strong>${escapeHtml(quote.snapshot.jobLabel)}</strong>
        <small>${quote.quantity} unidad(es) · ${escapeHtml(printMode)}</small>
      </div>

      <div class="card">
        <span>Responsable</span>
        <strong>${escapeHtml(worker)}</strong>
        <small>${quote.snapshot.projectHours} hora(s) del proyecto completo</small>
      </div>

      <div class="card">
        <span>Reglas automáticas</span>
        <strong>Luz +${quote.snapshot.lightPercent}% · Desgaste +${quote.snapshot.wearPercent}%</strong>
        <small>Aplicadas sobre el costo directo.</small>
      </div>
    </section>

    <div class="section-title">Desglose interno</div>
    <table>
      <thead>
        <tr>
          <th>Concepto</th>
          <th>Costo</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml(quote)}
      </tbody>
    </table>

    <section class="totals">
      <div class="notes">
        <strong>Notas</strong>
        <p>${escapeHtml(notes)}</p>
      </div>

      <div class="total-box">
        <div class="total-line">
          <span>Costo directo</span>
          <strong>${escapeHtml(money(Number(quote.direct_cost)))}</strong>
        </div>
        <div class="total-line">
          <span>Luz</span>
          <strong>${escapeHtml(money(Number(quote.light_cost)))}</strong>
        </div>
        <div class="total-line">
          <span>Desgaste</span>
          <strong>${escapeHtml(money(Number(quote.wear_cost)))}</strong>
        </div>
        <div class="total-line real">
          <span>Costo real</span>
          <strong>${escapeHtml(money(Number(quote.real_cost)))}</strong>
        </div>
        <div class="total-line">
          <span>Recargo / ganancia</span>
          <strong>${escapeHtml(`${quote.profit_percent}%`)}</strong>
        </div>

        <div class="final">
          <span>Precio presupuestado</span>
          <strong>${escapeHtml(money(Number(quote.total_price)))}</strong>
          <small>
            ${escapeHtml(money(Number(quote.suggested_unit_price)))} por unidad
          </small>
        </div>
      </div>
    </section>

    <footer>
      <span>
        Documento interno de Alimar. Los costos quedan congelados al momento de guardar
        el presupuesto aunque cambie la base de costos después.
      </span>
      <span>
        Instagram: @alimar.imp<br />
        WhatsApp: +54 9 11 3568 2635
      </span>
    </footer>
  </main>
</body>
</html>`

  target.document.open()
  target.document.write(html)
  target.document.close()
  target.focus()

  return true
}
