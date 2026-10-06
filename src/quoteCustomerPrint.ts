import { alimarLogoDataUrl } from './brand'
import type { AdminQuote } from './adminQuotePrint'

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
  }).format(date)
}

export function buildQuoteCustomerPrintHtml(quote: AdminQuote) {
  const customer = quote.customer_name?.trim() || 'Cliente'
  const customerDetail = quote.snapshot.customerDetail?.trim() || ''
  const printMode =
    quote.snapshot.printSides === 'double'
      ? 'Doble faz'
      : quote.snapshot.printSides === 'single'
        ? 'Simple faz'
        : null

  const fallbackDetail = [
    quote.snapshot.jobLabel,
    `${quote.quantity} unidad(es)`,
    printMode,
  ]
    .filter(Boolean)
    .join(' · ')

  const detail = customerDetail || fallbackDetail

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(quote.public_code)} · Presupuesto Alimar</title>
  <style>
    :root {
      color-scheme: only light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --ink: #10202a;
      --muted: #68757c;
      --blue: #70bed5;
      --blue-dark: #39788b;
      --blue-soft: #edf8fb;
      --cream: #fff7e8;
      --paper: #fffdf8;
      --line: rgba(16, 32, 42, .13);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      color: var(--ink);
      background: #e9eef0;
    }

    .toolbar {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      justify-content: center;
      gap: 10px;
      padding: 14px;
      background: rgba(16, 32, 42, .92);
      backdrop-filter: blur(8px);
    }

    .toolbar button {
      min-height: 42px;
      padding: 0 17px;
      border: 0;
      border-radius: 11px;
      color: #fff;
      background: var(--blue-dark);
      font: inherit;
      font-weight: 850;
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
      padding: 17mm 17mm 15mm;
      background:
        radial-gradient(circle at 100% 0%, rgba(112, 190, 213, .17), transparent 29%),
        radial-gradient(circle at 0% 100%, rgba(243, 232, 207, .38), transparent 31%),
        var(--paper);
      box-shadow: 0 18px 60px rgba(0,0,0,.14);
    }

    .brand {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 26px;
      padding-bottom: 13px;
      border-bottom: 1px solid var(--line);
    }

    /* ALIMAR 1PDF.13 - TRANSPARENT LOGO CROP */
    .brand-logo-crop {
      width: 24mm;
      height: 24mm;
      flex: 0 0 24mm;
      display: grid;
      place-items: center;
      overflow: hidden;
      border-radius: 50%;
      background: transparent;
    }

    .brand-logo {
      width: 128%;
      max-width: none;
      height: 128%;
      display: block;
      object-fit: cover;
      object-position: center;
    }

    .doc-meta {
      display: grid;
      justify-items: end;
      gap: 4px;
      text-align: right;
    }

    .doc-meta b {
      color: var(--blue-dark);
      font-size: 9px;
      letter-spacing: .12em;
      text-transform: uppercase;
    }

    .doc-meta strong {
      font-size: 15px;
    }

    .doc-meta span {
      color: var(--muted);
      font-size: 10px;
    }

    .hero {
      padding: 26px 0 18px;
    }

    .hero p {
      margin: 0 0 7px;
      color: var(--blue-dark);
      font-size: 10px;
      font-weight: 900;
      letter-spacing: .11em;
      text-transform: uppercase;
    }

    .hero h1 {
      max-width: 150mm;
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 31px;
      line-height: 1.05;
      letter-spacing: -.035em;
    }

    .hero small {
      display: block;
      margin-top: 9px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.5;
    }

    .summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 3px;
    }

    .card {
      min-height: 75px;
      padding: 12px 13px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: rgba(255,255,255,.58);
    }

    .card span,
    .detail span,
    .total span {
      display: block;
      color: var(--muted);
      font-size: 9px;
      font-weight: 850;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    .card strong {
      display: block;
      margin-top: 5px;
      font-size: 13px;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }

    .card small {
      display: block;
      margin-top: 4px;
      color: var(--muted);
      font-size: 10px;
      line-height: 1.4;
    }

    .detail {
      margin-top: 13px;
      padding: 15px 16px;
      border: 1px solid rgba(57,120,139,.2);
      border-radius: 15px;
      background: var(--blue-soft);
    }

    .detail strong {
      display: block;
      margin-top: 6px;
      font-size: 13px;
    }

    .detail p {
      margin: 7px 0 0;
      color: #40535c;
      font-size: 11px;
      line-height: 1.62;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .total {
      margin-top: 18px;
      padding: 18px 19px;
      border: 1px solid rgba(57,120,139,.24);
      border-radius: 17px;
      background:
        linear-gradient(135deg, rgba(112,190,213,.2), rgba(255,247,232,.92));
    }

    .total strong {
      display: block;
      margin-top: 5px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 34px;
      line-height: 1;
      letter-spacing: -.025em;
    }

    .total small {
      display: block;
      margin-top: 8px;
      color: var(--muted);
      font-size: 10px;
      line-height: 1.45;
    }

    .conditions {
      margin-top: 15px;
      padding: 12px 14px;
      border-left: 3px solid var(--blue);
      color: var(--muted);
      background: rgba(255,255,255,.38);
      font-size: 9.5px;
      line-height: 1.55;
    }

    footer {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      margin-top: 28px;
      padding-top: 11px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 9px;
      line-height: 1.5;
    }

    footer strong { color: var(--ink); }

    @page {
      size: A4;
      margin: 0;
    }

    @media print {
      html,
      body {
        width: 210mm;
        min-height: 0;
        margin: 0;
        background: #fff !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .toolbar { display: none !important; }

      .page {
        width: 210mm;
        min-height: 0;
        margin: 0;
        padding: 12mm 13mm 10mm;
        background: #fff !important;
        box-shadow: none !important;
      }

      .brand-logo-crop {
        width: 20mm;
        height: 20mm;
        flex-basis: 20mm;
      }

      .brand-logo {
        width: 128%;
        height: 128%;
      }

      .hero { padding: 17px 0 12px; }
      .hero h1 { font-size: 25px; }
      .hero small { font-size: 9px; }

      .card {
        min-height: 58px;
        padding: 9px 10px;
        border-color: #d3dcdf !important;
        break-inside: avoid;
      }

      .card span,
      .detail span,
      .total span { font-size: 7px; }

      .card strong { font-size: 10px; }
      .card small { font-size: 8px; }

      .detail {
        padding: 11px 12px;
        background: #eef8fb !important;
        break-inside: avoid;
      }

      .detail strong { font-size: 10px; }
      .detail p { font-size: 8.5px; }

      .total {
        padding: 13px 14px;
        background: #f5fafb !important;
        break-inside: avoid;
      }

      .total strong { font-size: 27px; }
      .total small { font-size: 8px; }

      .conditions {
        font-size: 8px;
        break-inside: avoid;
      }

      footer {
        margin-top: 18px;
        font-size: 7.5px;
        break-inside: avoid;
      }
    }

    @media (max-width: 720px) {
      .page { padding: 22px; }
      .brand { align-items: flex-start; }
      .summary { grid-template-columns: 1fr; }
      .doc-meta {
        justify-items: start;
        text-align: left;
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
      <span class="brand-logo-crop" aria-label="Alimar">
        <img
          class="brand-logo"
          src="${alimarLogoDataUrl}"
          alt="Alimar"
        />
      </span>

      <div class="doc-meta">
        <b>Presupuesto</b>
        <strong>${escapeHtml(quote.public_code)}</strong>
        <span>Creado ${escapeHtml(dateTimeLabel(quote.created_at))}</span>
      </div>
    </header>

    <section class="hero">
      <p>Propuesta preparada para ${escapeHtml(customer)}</p>
      <h1>${escapeHtml(quote.title)}</h1>
      <small>
        Presupuesto válido hasta ${escapeHtml(dateLabel(quote.valid_until))}.
      </small>
    </section>

    <section class="summary">
      <div class="card">
        <span>Cliente</span>
        <strong>${escapeHtml(customer)}</strong>
        <small>Presupuesto personalizado de Alimar</small>
      </div>

      <div class="card">
        <span>Tipo de trabajo</span>
        <strong>${escapeHtml(quote.snapshot.jobLabel)}</strong>
        <small>${printMode ? escapeHtml(printMode) : 'Trabajo personalizado'}</small>
      </div>

      <div class="card">
        <span>Cantidad</span>
        <strong>${quote.quantity} unidad(es)</strong>
        <small>Cantidad contemplada en esta propuesta</small>
      </div>

      <div class="card">
        <span>Vigencia</span>
        <strong>${escapeHtml(dateLabel(quote.valid_until))}</strong>
        <small>Después de esta fecha el precio puede actualizarse</small>
      </div>
    </section>

    <section class="detail">
      <span>Detalle del pedido</span>
      <strong>${escapeHtml(quote.title)}</strong>
      <p>${escapeHtml(detail)}</p>
    </section>

    <section class="total">
      <span>Total presupuestado</span>
      <strong>${escapeHtml(money(Number(quote.total_price)))}</strong>
      <small>Precio final correspondiente al pedido detallado en este presupuesto.</small>
    </section>

    <div class="conditions">
      Este presupuesto contempla el trabajo y la cantidad indicados. Cambios de diseño,
      cantidad, materiales o alcance pueden requerir una actualización del valor.
    </div>

    <footer>
      <span>
        <strong>Gracias por elegir Alimar.</strong><br />
        Diseños personalizados hechos especialmente para vos.
      </span>
      <span>
        Instagram: @alimar.imp<br />
        WhatsApp: +54 9 11 3568 2635
      </span>
    </footer>
  </main>
</body>
</html>`
}

export function openQuoteCustomerPrintView(
  quote: AdminQuote,
  existingWindow?: Window | null,
) {
  const target =
    existingWindow ??
    window.open('', '_blank', 'width=980,height=1200')

  if (!target) return false

  try {
    target.opener = null
  } catch {
    // Some browsers do not allow changing opener; the preview still works.
  }

  target.document.open()
  target.document.write(buildQuoteCustomerPrintHtml(quote))
  target.document.close()
  target.focus()

  return true
}
