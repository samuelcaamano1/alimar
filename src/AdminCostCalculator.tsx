import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

type CostCategory =
  | 'paper'
  | 'ink'
  | 'filament'
  | 'paint'
  | 'energy'
  | 'machine'
  | 'labor'
  | 'consumable'
  | 'other'

type CostUnit =
  | 'unit'
  | 'sheet'
  | 'print'
  | 'g'
  | 'kg'
  | 'ml'
  | 'l'
  | 'm'
  | 'kwh'
  | 'minute'
  | 'hour'

type CostResource = {
  id: string
  name: string
  category: CostCategory
  detail: string | null
  unit: CostUnit
  purchase_price: string
  package_quantity: string
  waste_percent: string
  notes: string | null
  effective_unit_cost: string
  updated_at: string
}

type Draft = {
  name: string
  category: CostCategory
  detail: string
  unit: CostUnit
  purchasePrice: string
  packageQuantity: string
  wastePercent: string
  notes: string
}

type GuidedJobType = 'paper-print' | '3d-print' | 'manual'
type WizardStep = 1 | 2 | 3
type PrintSides = 'single' | 'double'

type GuidedCost = {
  key: string
  label: string
  detail: string
  total: number
}

const LIGHT_PERCENT = 10
const WEAR_PERCENT = 20

const categoryLabels: Record<CostCategory, string> = {
  paper: 'Papel',
  ink: 'Tinta',
  filament: 'Filamento 3D',
  paint: 'Pintura / acrílico',
  energy: 'Energía',
  machine: 'Máquina',
  labor: 'Mano de obra',
  consumable: 'Consumible',
  other: 'Otro',
}

const unitLabels: Record<CostUnit, string> = {
  unit: 'unidad',
  sheet: 'hoja',
  print: 'impresión',
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'litro',
  m: 'metro',
  kwh: 'kWh',
  minute: 'minuto',
  hour: 'hora',
}

const emptyDraft: Draft = {
  name: '',
  category: 'paper',
  detail: '',
  unit: 'sheet',
  purchasePrice: '',
  packageQuantity: '',
  wastePercent: '0',
  notes: '',
}

function defaultUnitForCategory(category: CostCategory): CostUnit {
  switch (category) {
    case 'paper':
      return 'sheet'
    case 'ink':
      return 'print'
    case 'filament':
      return 'g'
    case 'paint':
      return 'ml'
    case 'labor':
      return 'hour'
    case 'energy':
      return 'kwh'
    case 'machine':
      return 'hour'
    default:
      return 'unit'
  }
}

function money(value: number) {
  if (!Number.isFinite(value)) return '$0'

  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(value)
}

function number(value: string) {
  const raw = value.trim().replace(/\s+/g, '')
  if (!raw) return 0

  let normalized = raw

  if (raw.includes(',') && raw.includes('.')) {
    normalized =
      raw.lastIndexOf(',') > raw.lastIndexOf('.')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw.replace(/,/g, '')
  } else if (raw.includes(',')) {
    normalized = raw.replace(',', '.')
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, '')
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundUp(value: number, step: number) {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (!Number.isFinite(step) || step <= 1) return Math.ceil(value)
  return Math.ceil(value / step) * step
}

function convertUsage(amount: number, from: CostUnit, to: CostUnit) {
  if (from === to) return amount
  if (from === 'g' && to === 'kg') return amount / 1000
  if (from === 'kg' && to === 'g') return amount * 1000
  if (from === 'ml' && to === 'l') return amount / 1000
  if (from === 'l' && to === 'ml') return amount * 1000
  if (from === 'minute' && to === 'hour') return amount / 60
  if (from === 'hour' && to === 'minute') return amount * 60
  return amount
}

async function responseMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string }
    return data.error || `Error ${response.status}`
  } catch {
    return `Error ${response.status}`
  }
}

function draftFromResource(resource: CostResource): Draft {
  const needsInkYield = resource.category === 'ink' && resource.unit !== 'print'

  if (resource.category === 'labor') {
    return {
      name: resource.name,
      category: 'labor',
      detail: resource.detail ?? '',
      unit: 'hour',
      purchasePrice: resource.effective_unit_cost || resource.purchase_price,
      packageQuantity: '1',
      wastePercent: '0',
      notes: resource.notes ?? '',
    }
  }

  return {
    name: resource.name,
    category: resource.category,
    detail: resource.detail ?? '',
    unit: resource.category === 'ink' ? 'print' : resource.unit,
    purchasePrice: resource.purchase_price,
    packageQuantity: needsInkYield ? '' : resource.package_quantity,
    wastePercent: resource.waste_percent,
    notes: resource.notes ?? '',
  }
}

function payloadFromDraft(draft: Draft) {
  return {
    name: draft.name,
    category: draft.category,
    detail: draft.detail,
    unit: draft.category === 'labor' ? 'hour' : draft.unit,
    purchasePrice: draft.purchasePrice,
    packageQuantity: draft.category === 'labor' ? '1' : draft.packageQuantity,
    wastePercent: draft.category === 'labor' ? '0' : draft.wastePercent,
    notes: draft.notes,
  }
}

export default function AdminCostCalculator() {
  const [view, setView] = useState<'calculator' | 'data'>('calculator')
  const [resources, setResources] = useState<CostResource[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [resourceSearch, setResourceSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | CostCategory>('all')

  const [quoteOpen, setQuoteOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<WizardStep>(1)
  const [jobType, setJobType] = useState<GuidedJobType>('paper-print')
  const [quantity, setQuantity] = useState('1')
  const [profitPercent, setProfitPercent] = useState('40')
  const [roundingStep, setRoundingStep] = useState('100')

  const [paperResourceId, setPaperResourceId] = useState('')
  const [inkResourceId, setInkResourceId] = useState('')
  const [printSides, setPrintSides] = useState<PrintSides>('single')

  const [filamentResourceId, setFilamentResourceId] = useState('')
  const [gramsPerPiece, setGramsPerPiece] = useState('20')
  const [paintEnabled, setPaintEnabled] = useState(false)
  const [paintResourceId, setPaintResourceId] = useState('')
  const [paintMlPerPiece, setPaintMlPerPiece] = useState('2')

  const [manualResourceId, setManualResourceId] = useState('')
  const [manualUsagePerUnit, setManualUsagePerUnit] = useState('1')
  const [manualExtraEnabled, setManualExtraEnabled] = useState(false)
  const [manualExtraResourceId, setManualExtraResourceId] = useState('')
  const [manualExtraUsagePerUnit, setManualExtraUsagePerUnit] = useState('1')

  const [workerResourceId, setWorkerResourceId] = useState('')
  const [projectHours, setProjectHours] = useState('1')

  const loadResources = useCallback(async () => {
    setState('loading')

    try {
      const response = await fetch('/api/admin/catalog?action=cost-resources', {
        cache: 'no-store',
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as { resources: CostResource[] }
      setResources(data.resources)
      setState('ready')
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'No se pudieron cargar los datos de costos.',
      )
      setState('error')
    }
  }, [])

  useEffect(() => {
    void loadResources()
  }, [loadResources])

  useEffect(() => {
    if (!quoteOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setQuoteOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [quoteOpen])

  const filteredResources = useMemo(() => {
    const query = resourceSearch.trim().toLocaleLowerCase('es-AR')

    return resources.filter((resource) => {
      if (categoryFilter !== 'all' && resource.category !== categoryFilter) return false
      if (!query) return true

      return [
        resource.name,
        resource.detail ?? '',
        resource.notes ?? '',
        categoryLabels[resource.category],
      ]
        .join(' ')
        .toLocaleLowerCase('es-AR')
        .includes(query)
    })
  }, [categoryFilter, resourceSearch, resources])

  const paperResources = resources.filter((resource) => resource.category === 'paper')
  const inkResources = resources.filter((resource) => resource.category === 'ink')
  const filamentResources = resources.filter((resource) => resource.category === 'filament')
  const paintResources = resources.filter((resource) => resource.category === 'paint')
  const workerResources = resources.filter((resource) => resource.category === 'labor')
  const manualMaterialResources = resources.filter((resource) =>
    ['paper', 'paint', 'consumable', 'other', 'filament'].includes(resource.category),
  )

  const selectedManualResource =
    resources.find((resource) => resource.id === manualResourceId) ?? null
  const selectedManualExtraResource =
    resources.find((resource) => resource.id === manualExtraResourceId) ?? null

  const guidedCalculation = useMemo(() => {
    const finalQuantity = Math.max(1, Math.floor(number(quantity) || 1))
    const profit = Math.max(0, number(profitPercent))
    const rounding = Math.max(1, number(roundingStep) || 1)
    const costs: GuidedCost[] = []

    function resource(resourceId: string) {
      return resources.find((item) => item.id === resourceId) ?? null
    }

    function addCost(args: {
      key: string
      label: string
      resourceId: string
      amount: number
      inputUnit: CostUnit
      multiplier?: number
      detail: string
    }) {
      const selected = resource(args.resourceId)
      if (!selected || !Number.isFinite(args.amount) || args.amount <= 0) return

      const usage = convertUsage(args.amount, args.inputUnit, selected.unit)
      const total =
        number(selected.effective_unit_cost) *
        usage *
        Math.max(1, args.multiplier ?? 1)

      if (!Number.isFinite(total) || total <= 0) return

      costs.push({
        key: args.key,
        label: `${args.label} · ${selected.name}`,
        detail: args.detail,
        total,
      })
    }

    if (jobType === 'paper-print') {
      const impressionsPerSheet = printSides === 'double' ? 2 : 1

      addCost({
        key: 'paper',
        label: 'Papel',
        resourceId: paperResourceId,
        amount: finalQuantity,
        inputUnit: 'sheet',
        detail: `${finalQuantity} hoja(s)`,
      })

      addCost({
        key: 'ink',
        label: 'Tinta',
        resourceId: inkResourceId,
        amount: finalQuantity * impressionsPerSheet,
        inputUnit: 'print',
        detail:
          printSides === 'double'
            ? `${finalQuantity} hoja(s) × 2 caras = ${finalQuantity * 2} impresiones`
            : `${finalQuantity} hoja(s) = ${finalQuantity} impresiones`,
      })
    }

    if (jobType === '3d-print') {
      const grams = Math.max(0, number(gramsPerPiece))

      addCost({
        key: 'filament',
        label: 'Filamento',
        resourceId: filamentResourceId,
        amount: grams,
        inputUnit: 'g',
        multiplier: finalQuantity,
        detail: `${grams || 0} g × ${finalQuantity} pieza(s)`,
      })

      if (paintEnabled) {
        const paintMl = Math.max(0, number(paintMlPerPiece))

        addCost({
          key: 'paint',
          label: 'Pintura / acrílico',
          resourceId: paintResourceId,
          amount: paintMl,
          inputUnit: 'ml',
          multiplier: finalQuantity,
          detail: `${paintMl || 0} ml × ${finalQuantity} pieza(s)`,
        })
      }
    }

    if (jobType === 'manual') {
      const mainResource = resource(manualResourceId)
      const mainUsage = Math.max(0, number(manualUsagePerUnit))

      if (mainResource) {
        addCost({
          key: 'manual-main',
          label: 'Material principal',
          resourceId: mainResource.id,
          amount: mainUsage,
          inputUnit: mainResource.unit,
          multiplier: finalQuantity,
          detail: `${mainUsage || 0} ${unitLabels[mainResource.unit]} × ${finalQuantity} unidad(es)`,
        })
      }

      if (manualExtraEnabled) {
        const extraResource = resource(manualExtraResourceId)
        const extraUsage = Math.max(0, number(manualExtraUsagePerUnit))

        if (extraResource) {
          addCost({
            key: 'manual-extra',
            label: 'Material extra',
            resourceId: extraResource.id,
            amount: extraUsage,
            inputUnit: extraResource.unit,
            multiplier: finalQuantity,
            detail: `${extraUsage || 0} ${unitLabels[extraResource.unit]} × ${finalQuantity} unidad(es)`,
          })
        }
      }
    }

    const hours = Math.max(0, number(projectHours))
    if (workerResourceId && hours > 0) {
      addCost({
        key: 'labor',
        label: 'Trabajo',
        resourceId: workerResourceId,
        amount: hours,
        inputUnit: 'hour',
        detail: `${hours} hora(s) del proyecto completo`,
      })
    }

    const directCost = costs.reduce((sum, item) => sum + item.total, 0)
    const lightCost = directCost * (LIGHT_PERCENT / 100)
    const wearCost = directCost * (WEAR_PERCENT / 100)
    const realCost = directCost + lightCost + wearCost
    const rawSaleTotal = realCost * (1 + profit / 100)
    const rawSalePerUnit = rawSaleTotal / finalQuantity
    const suggestedPerUnit = roundUp(rawSalePerUnit, rounding)
    const suggestedTotal = suggestedPerUnit * finalQuantity

    return {
      quantity: finalQuantity,
      profit,
      costs,
      directCost,
      lightCost,
      wearCost,
      realCost,
      costPerUnit: realCost / finalQuantity,
      suggestedPerUnit,
      suggestedTotal,
    }
  }, [
    filamentResourceId,
    gramsPerPiece,
    inkResourceId,
    jobType,
    manualExtraEnabled,
    manualExtraResourceId,
    manualExtraUsagePerUnit,
    manualResourceId,
    manualUsagePerUnit,
    paintEnabled,
    paintMlPerPiece,
    paintResourceId,
    paperResourceId,
    printSides,
    profitPercent,
    projectHours,
    quantity,
    resources,
    roundingStep,
    workerResourceId,
  ])

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function clearResourceSelection(resourceId: string) {
    if (paperResourceId === resourceId) setPaperResourceId('')
    if (inkResourceId === resourceId) setInkResourceId('')
    if (filamentResourceId === resourceId) setFilamentResourceId('')
    if (paintResourceId === resourceId) setPaintResourceId('')
    if (manualResourceId === resourceId) setManualResourceId('')
    if (manualExtraResourceId === resourceId) setManualExtraResourceId('')
    if (workerResourceId === resourceId) setWorkerResourceId('')
  }

  async function submitResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      const response = await fetch(
        editingId
          ? `/api/admin/catalog?action=cost-resources&id=${encodeURIComponent(editingId)}`
          : '/api/admin/catalog?action=cost-resources',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadFromDraft(draft)),
        },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      setDraft(emptyDraft)
      setEditingId(null)
      await loadResources()
      setMessage(editingId ? 'Dato de costo actualizado.' : 'Dato de costo creado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el dato.')
    } finally {
      setSaving(false)
    }
  }

  async function removeResource(resource: CostResource) {
    const confirmed = window.confirm(`¿Quitar "${resource.name}" de la base de costos?`)
    if (!confirmed) return

    setSaving(true)
    setMessage('')

    try {
      const response = await fetch(
        `/api/admin/catalog?action=cost-resources&id=${encodeURIComponent(resource.id)}`,
        { method: 'DELETE' },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      clearResourceSelection(resource.id)

      if (editingId === resource.id) {
        setEditingId(null)
        setDraft(emptyDraft)
      }

      await loadResources()
      setMessage('Dato de costo quitado.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo quitar el dato.')
    } finally {
      setSaving(false)
    }
  }

  function firstResourceId(category: CostCategory) {
    return resources.find((resource) => resource.category === category)?.id ?? ''
  }

  function openQuote(type: GuidedJobType) {
    setJobType(type)
    setWizardStep(1)
    setQuantity('1')
    setProfitPercent('40')
    setRoundingStep('100')
    setPrintSides('single')
    setGramsPerPiece('20')
    setPaintEnabled(false)
    setPaintMlPerPiece('2')
    setManualUsagePerUnit('1')
    setManualExtraEnabled(false)
    setManualExtraResourceId('')
    setManualExtraUsagePerUnit('1')
    setProjectHours('1')

    setPaperResourceId(firstResourceId('paper'))
    setInkResourceId(firstResourceId('ink'))
    setFilamentResourceId(firstResourceId('filament'))
    setPaintResourceId(firstResourceId('paint'))
    setWorkerResourceId(firstResourceId('labor'))

    const firstMaterial = resources.find((resource) =>
      ['paper', 'paint', 'consumable', 'other', 'filament'].includes(resource.category),
    )
    setManualResourceId(firstMaterial?.id ?? '')

    setQuoteOpen(true)
  }

  function closeQuote() {
    setQuoteOpen(false)
    setWizardStep(1)
  }

  function goToCostData(messageText: string) {
    setQuoteOpen(false)
    setView('data')
    setMessage(messageText)
  }

  const stepTwoReady =
    jobType === 'paper-print'
      ? Boolean(
          paperResourceId &&
          inkResourceId &&
          workerResourceId &&
          number(projectHours) > 0,
        )
      : jobType === '3d-print'
        ? Boolean(
            filamentResourceId &&
            workerResourceId &&
            number(gramsPerPiece) > 0 &&
            number(projectHours) > 0 &&
            (!paintEnabled || (paintResourceId && number(paintMlPerPiece) > 0)),
          )
        : Boolean(
            manualResourceId &&
            workerResourceId &&
            number(manualUsagePerUnit) > 0 &&
            number(projectHours) > 0 &&
            (!manualExtraEnabled ||
              (manualExtraResourceId && number(manualExtraUsagePerUnit) > 0)),
          )

  const jobTitle =
    jobType === 'paper-print'
      ? 'Impresión en papel'
      : jobType === '3d-print'
        ? 'Impresión 3D'
        : 'Manualidad / armado'

  const quantityTitle =
    jobType === 'paper-print'
      ? '¿Cuántas hojas vas a imprimir?'
      : jobType === '3d-print'
        ? '¿Cuántas piezas vas a hacer?'
        : '¿Cuántas unidades vas a hacer?'

  const quantityLabel =
    jobType === 'paper-print'
      ? 'Cantidad de hojas'
      : jobType === '3d-print'
        ? 'Cantidad de piezas'
        : 'Cantidad de unidades'

  return (
    <section className="admin-panel admin-cost-calculator">
      <div className="admin-cost-heading-v2">
        <div className="admin-cost-heading-copy">
          <span className="admin-cost-eyebrow">Costos & rentabilidad</span>
          <h2>Presupuesto rápido</h2>
          <p>
            Elegí el tipo de trabajo, sus materiales y una persona. Luz y desgaste se calculan
            automáticamente.
          </p>

          <div className="admin-cost-heading-meta">
            <span>{resources.length} datos cargados</span>
            <span>Luz +{LIGHT_PERCENT}%</span>
            <span>Desgaste +{WEAR_PERCENT}%</span>
          </div>
        </div>

        <div className="admin-cost-tabs" role="tablist" aria-label="Calculadora de costos">
          <button
            type="button"
            className={view === 'calculator' ? 'is-active' : ''}
            onClick={() => setView('calculator')}
          >
            Presupuesto rápido
          </button>
          <button
            type="button"
            className={view === 'data' ? 'is-active' : ''}
            onClick={() => setView('data')}
          >
            Base de costos
          </button>
        </div>
      </div>

      {message && <div className="admin-toast admin-cost-message">{message}</div>}

      {view === 'calculator' ? (
        <div className="admin-budget-home">
          {resources.length === 0 ? (
            <div className="admin-cost-empty admin-cost-empty-hero">
              <div className="admin-cost-empty-icon" aria-hidden="true">+</div>
              <div className="admin-cost-empty-copy">
                <span className="admin-cost-empty-kicker">Primero tu base de costos</span>
                <strong>Cargá materiales y personas una vez; después presupuestá en segundos.</strong>
                <p>
                  Papel, tinta, filamento, pintura y el valor/hora de Samuel, Stefania o quien trabaje.
                </p>
              </div>
              <button className="admin-primary" type="button" onClick={() => setView('data')}>
                Cargar costos
              </button>
            </div>
          ) : (
            <>
              <div className="admin-budget-intro">
                <div>
                  <span className="admin-cost-eyebrow">Nuevo presupuesto</span>
                  <h3>¿Qué trabajo vas a calcular?</h3>
                  <p>La calculadora muestra solamente lo necesario para ese tipo de proyecto.</p>
                </div>

                <button className="admin-secondary" type="button" onClick={() => setView('data')}>
                  Editar base de costos
                </button>
              </div>

              <div className="admin-budget-job-grid">
                <button
                  className="admin-budget-job"
                  type="button"
                  onClick={() => openQuote('paper-print')}
                >
                  <span>01</span>
                  <strong>Impresión en papel</strong>
                  <p>Papel + tinta automática por cara + una persona + luz y desgaste.</p>
                  <small>{paperResources.length} papeles · {inkResources.length} tintas</small>
                  <b>Calcular →</b>
                </button>

                <button
                  className="admin-budget-job"
                  type="button"
                  onClick={() => openQuote('3d-print')}
                >
                  <span>02</span>
                  <strong>Impresión 3D</strong>
                  <p>Filamento + pintura opcional + una persona + luz y desgaste.</p>
                  <small>{filamentResources.length} filamentos · {paintResources.length} pinturas</small>
                  <b>Calcular →</b>
                </button>

                <button
                  className="admin-budget-job"
                  type="button"
                  onClick={() => openQuote('manual')}
                >
                  <span>03</span>
                  <strong>Manualidad / armado</strong>
                  <p>Material principal + extra opcional + una persona + luz y desgaste.</p>
                  <small>{manualMaterialResources.length} materiales disponibles</small>
                  <b>Calcular →</b>
                </button>
              </div>

              <div className="admin-budget-rule">
                <strong>Regla automática de Alimar</strong>
                <span>
                  Costo directo + {LIGHT_PERCENT}% de luz + {WEAR_PERCENT}% de desgaste.
                  Después se aplica el recargo/ganancia que elijas.
                </span>
              </div>
            </>
          )}

          {quoteOpen && (
            <div className="admin-budget-overlay" role="presentation">
              <section
                className="admin-budget-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-budget-title"
              >
                <header className="admin-budget-header">
                  <div>
                    <span>Presupuesto guiado · Paso {wizardStep} de 3</span>
                    <h3 id="admin-budget-title">{jobTitle}</h3>
                  </div>
                  <button
                    type="button"
                    className="admin-budget-close"
                    onClick={closeQuote}
                    aria-label="Cerrar presupuesto"
                  >
                    ×
                  </button>
                </header>

                <div className="admin-budget-progress" aria-hidden="true">
                  <span className={wizardStep >= 1 ? 'is-active' : ''} />
                  <span className={wizardStep >= 2 ? 'is-active' : ''} />
                  <span className={wizardStep >= 3 ? 'is-active' : ''} />
                </div>

                <div className="admin-budget-body">
                  {wizardStep === 1 && (
                    <div className="admin-budget-step admin-budget-step-quantity">
                      <div className="admin-budget-copy">
                        <span className="admin-cost-eyebrow">Paso 1</span>
                        <h4>{quantityTitle}</h4>
                        <p>
                          Esta cantidad multiplica los materiales. Las horas de la persona son
                          del proyecto completo y no se multiplican por cantidad.
                        </p>
                      </div>

                      <label className="admin-budget-quantity">
                        {quantityLabel}
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={quantity}
                          onChange={(event) => setQuantity(event.target.value)}
                          autoFocus
                        />
                      </label>
                    </div>
                  )}

                  {wizardStep === 2 && (
                    <div className="admin-budget-step">
                      <div className="admin-budget-copy">
                        <span className="admin-cost-eyebrow">Paso 2</span>
                        <h4>Materiales y trabajo</h4>
                        <p>
                          Elegí los costos reales. Luz y desgaste no se cargan: se agregan
                          automáticamente en el resultado.
                        </p>
                      </div>

                      {jobType === 'paper-print' && (
                        <div className="admin-budget-card-grid">
                          <div className="admin-budget-cost-card">
                            <span className="admin-budget-card-number">1</span>
                            <div>
                              <strong>Papel</strong>
                              <small>Se cobra una hoja por cada hoja indicada en el paso 1.</small>
                            </div>

                            {paperResources.length > 0 ? (
                              <label>
                                Papel
                                <select
                                  value={paperResourceId}
                                  onChange={(event) => setPaperResourceId(event.target.value)}
                                >
                                  {paperResources.map((resource) => (
                                    <option key={resource.id} value={resource.id}>
                                      {resource.name}{resource.detail ? ` · ${resource.detail}` : ''}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            ) : (
                              <button
                                className="admin-secondary"
                                type="button"
                                onClick={() =>
                                  goToCostData('Cargá al menos un papel para presupuestar impresiones.')
                                }
                              >
                                Cargar papel
                              </button>
                            )}
                          </div>

                          <div className="admin-budget-cost-card">
                            <span className="admin-budget-card-number">2</span>
                            <div>
                              <strong>Tinta</strong>
                              <small>
                                La cantidad de tinta se calcula sola a partir de las hojas y las caras.
                              </small>
                            </div>

                            {inkResources.length > 0 ? (
                              <>
                                <label>
                                  Tinta
                                  <select
                                    value={inkResourceId}
                                    onChange={(event) => setInkResourceId(event.target.value)}
                                  >
                                    {inkResources.map((resource) => (
                                      <option key={resource.id} value={resource.id}>
                                        {resource.name}{resource.detail ? ` · ${resource.detail}` : ''}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label>
                                  Tipo de impresión
                                  <select
                                    value={printSides}
                                    onChange={(event) =>
                                      setPrintSides(event.target.value as PrintSides)
                                    }
                                  >
                                    <option value="single">Simple faz · 1 impresión por hoja</option>
                                    <option value="double">Doble faz · 2 impresiones por hoja</option>
                                  </select>
                                </label>

                                <div className="admin-budget-auto">
                                  <span>Impresiones calculadas</span>
                                  <strong>
                                    {Math.max(1, Math.floor(number(quantity) || 1)) *
                                      (printSides === 'double' ? 2 : 1)}
                                  </strong>
                                </div>
                              </>
                            ) : (
                              <button
                                className="admin-secondary"
                                type="button"
                                onClick={() =>
                                  goToCostData('Cargá al menos una tinta con su rendimiento por impresión.')
                                }
                              >
                                Cargar tinta
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {jobType === '3d-print' && (
                        <div className="admin-budget-stack">
                          <div className="admin-budget-cost-card admin-budget-wide">
                            <span className="admin-budget-card-number">1</span>
                            <div>
                              <strong>Filamento</strong>
                              <small>Ingresá los gramos aproximados que usa cada pieza.</small>
                            </div>

                            {filamentResources.length > 0 ? (
                              <div className="admin-budget-fields-2">
                                <label>
                                  Filamento
                                  <select
                                    value={filamentResourceId}
                                    onChange={(event) => setFilamentResourceId(event.target.value)}
                                  >
                                    {filamentResources.map((resource) => (
                                      <option key={resource.id} value={resource.id}>
                                        {resource.name}{resource.detail ? ` · ${resource.detail}` : ''}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label>
                                  Gramos por pieza
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.1"
                                    value={gramsPerPiece}
                                    onChange={(event) => setGramsPerPiece(event.target.value)}
                                  />
                                </label>
                              </div>
                            ) : (
                              <button
                                className="admin-secondary"
                                type="button"
                                onClick={() =>
                                  goToCostData('Cargá al menos un filamento para presupuestar 3D.')
                                }
                              >
                                Cargar filamento
                              </button>
                            )}
                          </div>

                          <div className="admin-budget-optional">
                            <label className="admin-budget-check">
                              <input
                                type="checkbox"
                                checked={paintEnabled}
                                onChange={(event) => setPaintEnabled(event.target.checked)}
                              />
                              <span>
                                <strong>¿La pieza lleva acrílico o pintura?</strong>
                                <small>Activá esto solamente si realmente la pintás.</small>
                              </span>
                            </label>

                            {paintEnabled && (
                              paintResources.length > 0 ? (
                                <div className="admin-budget-fields-2">
                                  <label>
                                    Pintura / acrílico
                                    <select
                                      value={paintResourceId}
                                      onChange={(event) => setPaintResourceId(event.target.value)}
                                    >
                                      {paintResources.map((resource) => (
                                        <option key={resource.id} value={resource.id}>
                                          {resource.name}{resource.detail ? ` · ${resource.detail}` : ''}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label>
                                    ml por pieza
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.1"
                                      value={paintMlPerPiece}
                                      onChange={(event) => setPaintMlPerPiece(event.target.value)}
                                    />
                                  </label>
                                </div>
                              ) : (
                                <button
                                  className="admin-secondary"
                                  type="button"
                                  onClick={() =>
                                    goToCostData('Cargá una pintura o acrílico para incluirlo.')
                                  }
                                >
                                  Cargar pintura
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      )}

                      {jobType === 'manual' && (
                        <div className="admin-budget-stack">
                          <div className="admin-budget-cost-card admin-budget-wide">
                            <span className="admin-budget-card-number">1</span>
                            <div>
                              <strong>Material principal</strong>
                              <small>Se multiplica por la cantidad final del proyecto.</small>
                            </div>

                            {manualMaterialResources.length > 0 ? (
                              <div className="admin-budget-fields-2">
                                <label>
                                  Material
                                  <select
                                    value={manualResourceId}
                                    onChange={(event) => setManualResourceId(event.target.value)}
                                  >
                                    {manualMaterialResources.map((resource) => (
                                      <option key={resource.id} value={resource.id}>
                                        {resource.name}{resource.detail ? ` · ${resource.detail}` : ''}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label>
                                  Uso por unidad
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={manualUsagePerUnit}
                                    onChange={(event) => setManualUsagePerUnit(event.target.value)}
                                  />
                                  <small>
                                    {selectedManualResource
                                      ? `En ${unitLabels[selectedManualResource.unit]}.`
                                      : 'Elegí el material.'}
                                  </small>
                                </label>
                              </div>
                            ) : (
                              <button
                                className="admin-secondary"
                                type="button"
                                onClick={() =>
                                  goToCostData('Cargá un material para presupuestar manualidades.')
                                }
                              >
                                Cargar material
                              </button>
                            )}
                          </div>

                          <div className="admin-budget-optional">
                            <label className="admin-budget-check">
                              <input
                                type="checkbox"
                                checked={manualExtraEnabled}
                                onChange={(event) => setManualExtraEnabled(event.target.checked)}
                              />
                              <span>
                                <strong>¿Usa un segundo material?</strong>
                                <small>Por ejemplo cinta, acrílico, papel extra o pegamento.</small>
                              </span>
                            </label>

                            {manualExtraEnabled && (
                              <div className="admin-budget-fields-2">
                                <label>
                                  Material extra
                                  <select
                                    value={manualExtraResourceId}
                                    onChange={(event) => setManualExtraResourceId(event.target.value)}
                                  >
                                    <option value="">Elegir…</option>
                                    {manualMaterialResources.map((resource) => (
                                      <option key={resource.id} value={resource.id}>
                                        {resource.name}{resource.detail ? ` · ${resource.detail}` : ''}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label>
                                  Uso por unidad
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={manualExtraUsagePerUnit}
                                    onChange={(event) => setManualExtraUsagePerUnit(event.target.value)}
                                  />
                                  <small>
                                    {selectedManualExtraResource
                                      ? `En ${unitLabels[selectedManualExtraResource.unit]}.`
                                      : 'Elegí primero el material.'}
                                  </small>
                                </label>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="admin-budget-worker">
                        <div className="admin-budget-worker-copy">
                          <span className="admin-budget-card-number">3</span>
                          <div>
                            <strong>Trabajo de una persona</strong>
                            <small>
                              Elegís una sola persona y las horas son del proyecto completo.
                              No se multiplican por hoja ni por pieza.
                            </small>
                          </div>
                        </div>

                        {workerResources.length > 0 ? (
                          <div className="admin-budget-fields-2">
                            <label>
                              Persona
                              <select
                                value={workerResourceId}
                                onChange={(event) => setWorkerResourceId(event.target.value)}
                              >
                                {workerResources.map((resource) => (
                                  <option key={resource.id} value={resource.id}>
                                    {resource.name}
                                    {resource.detail ? ` · ${resource.detail}` : ''}
                                    {' · '}
                                    {money(number(resource.effective_unit_cost))}/hora
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label>
                              Horas totales del proyecto
                              <input
                                type="number"
                                min={0}
                                step="0.25"
                                value={projectHours}
                                onChange={(event) => setProjectHours(event.target.value)}
                                placeholder="Ej. 2"
                              />
                              <small>Ej. 1,5 = una hora y media.</small>
                            </label>
                          </div>
                        ) : (
                          <button
                            className="admin-secondary"
                            type="button"
                            onClick={() =>
                              goToCostData(
                                'Cargá al menos una persona en Mano de obra. Ejemplo: Samuel = valor por hora.',
                              )
                            }
                          >
                            Cargar persona / hora
                          </button>
                        )}
                      </div>

                      <div className="admin-budget-percent-rule">
                        <div>
                          <span>Luz</span>
                          <strong>+{LIGHT_PERCENT}%</strong>
                        </div>
                        <div>
                          <span>Desgaste</span>
                          <strong>+{WEAR_PERCENT}%</strong>
                        </div>
                        <p>
                          No necesitás watts, kWh ni horas de máquina. Estos porcentajes se agregan
                          automáticamente sobre el costo directo.
                        </p>
                      </div>
                    </div>
                  )}

                  {wizardStep === 3 && (
                    <div className="admin-budget-step">
                      <div className="admin-budget-copy">
                        <span className="admin-cost-eyebrow">Paso 3</span>
                        <h4>Resultado del proyecto</h4>
                        <p>Acá podés ver claramente de dónde sale cada peso del presupuesto.</p>
                      </div>

                      <div className="admin-budget-result-layout">
                        <div className="admin-budget-breakdown">
                          {guidedCalculation.costs.map((cost) => (
                            <div className="admin-budget-cost-row" key={cost.key}>
                              <div>
                                <strong>{cost.label}</strong>
                                <small>{cost.detail}</small>
                              </div>
                              <span>{money(cost.total)}</span>
                            </div>
                          ))}

                          <div className="admin-budget-cost-row admin-budget-subtotal">
                            <div>
                              <strong>Costo directo</strong>
                              <small>Materiales + trabajo.</small>
                            </div>
                            <span>{money(guidedCalculation.directCost)}</span>
                          </div>

                          <div className="admin-budget-cost-row">
                            <div>
                              <strong>Luz · {LIGHT_PERCENT}%</strong>
                              <small>Regla fija de Alimar.</small>
                            </div>
                            <span>{money(guidedCalculation.lightCost)}</span>
                          </div>

                          <div className="admin-budget-cost-row">
                            <div>
                              <strong>Desgaste · {WEAR_PERCENT}%</strong>
                              <small>Herramientas, impresoras y uso general.</small>
                            </div>
                            <span>{money(guidedCalculation.wearCost)}</span>
                          </div>

                          <div className="admin-budget-cost-row admin-budget-real-cost">
                            <div>
                              <strong>Costo real del proyecto</strong>
                              <small>Antes de ganancia.</small>
                            </div>
                            <span>{money(guidedCalculation.realCost)}</span>
                          </div>
                        </div>

                        <aside className="admin-budget-price-panel">
                          <div className="admin-budget-price-controls">
                            <label>
                              Recargo / ganancia %
                              <input
                                type="number"
                                min={0}
                                step="0.1"
                                value={profitPercent}
                                onChange={(event) => setProfitPercent(event.target.value)}
                              />
                            </label>

                            <label>
                              Redondear a
                              <select
                                value={roundingStep}
                                onChange={(event) => setRoundingStep(event.target.value)}
                              >
                                <option value="1">$1</option>
                                <option value="10">$10</option>
                                <option value="50">$50</option>
                                <option value="100">$100</option>
                                <option value="500">$500</option>
                                <option value="1000">$1.000</option>
                              </select>
                            </label>
                          </div>

                          <div className="admin-budget-price-metric">
                            <span>Costo real</span>
                            <strong>{money(guidedCalculation.realCost)}</strong>
                            <small>{money(guidedCalculation.costPerUnit)} por unidad</small>
                          </div>

                          <div className="admin-budget-price-final">
                            <span>Precio sugerido</span>
                            <strong>{money(guidedCalculation.suggestedTotal)}</strong>
                            <small>
                              {money(guidedCalculation.suggestedPerUnit)} ×{' '}
                              {guidedCalculation.quantity}
                            </small>
                          </div>
                        </aside>
                      </div>
                    </div>
                  )}
                </div>

                <footer className="admin-budget-footer">
                  <div>
                    {wizardStep > 1 && (
                      <button
                        className="admin-secondary"
                        type="button"
                        onClick={() => setWizardStep((wizardStep - 1) as WizardStep)}
                      >
                        ← Volver
                      </button>
                    )}
                  </div>

                  <div className="admin-budget-footer-main">
                    {wizardStep === 2 && !stepTwoReady && (
                      <span>Completá materiales, persona y horas del proyecto.</span>
                    )}

                    <button className="admin-secondary" type="button" onClick={closeQuote}>
                      Cerrar
                    </button>

                    {wizardStep < 3 && (
                      <button
                        className="admin-primary"
                        type="button"
                        disabled={wizardStep === 1 ? number(quantity) < 1 : !stepTwoReady}
                        onClick={() => setWizardStep((wizardStep + 1) as WizardStep)}
                      >
                        Continuar →
                      </button>
                    )}

                    {wizardStep === 3 && (
                      <button
                        className="admin-primary"
                        type="button"
                        onClick={() => openQuote(jobType)}
                      >
                        Nuevo cálculo
                      </button>
                    )}
                  </div>
                </footer>
              </section>
            </div>
          )}
        </div>
      ) : (
        <div className="admin-cost-data">
          <form className="admin-cost-data-form" onSubmit={submitResource}>
            <div className="admin-cost-data-title">
              <strong>{editingId ? 'Editar dato de costo' : 'Nuevo dato de costo'}</strong>
              <span>
                Guardá materiales y personas con su valor/hora. Estos datos alimentan el presupuesto rápido.
              </span>
            </div>

            <label>
              {draft.category === 'labor' ? 'Persona / trabajo' : 'Nombre'}
              <input
                value={draft.name}
                onChange={(event) => updateDraft('name', event.target.value)}
                maxLength={120}
                placeholder={draft.category === 'labor' ? 'Ej. Samuel' : 'Ej. Papel holográfico'}
                required
              />
            </label>

            <label>
              Categoría
              <select
                value={draft.category}
                onChange={(event) => {
                  const nextCategory = event.target.value as CostCategory

                  setDraft((current) => ({
                    ...current,
                    category: nextCategory,
                    unit: defaultUnitForCategory(nextCategory),
                    packageQuantity:
                      nextCategory === 'labor'
                        ? '1'
                        : nextCategory === 'ink' && current.category !== 'ink'
                          ? ''
                          : current.packageQuantity,
                    wastePercent: nextCategory === 'labor' ? '0' : current.wastePercent,
                  }))
                }}
              >
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Detalle / variante
              <input
                value={draft.detail}
                onChange={(event) => updateDraft('detail', event.target.value)}
                maxLength={160}
                placeholder={
                  draft.category === 'labor'
                    ? 'Ej. Diseño, corte, armado'
                    : 'Ej. A4 · 180 g · doble faz'
                }
              />
            </label>

            {draft.category === 'ink' ? (
              <label>
                Unidad base
                <input value="impresión" readOnly aria-readonly="true" />
                <small>Para tinta usamos rendimiento por impresión.</small>
              </label>
            ) : draft.category === 'labor' ? (
              <label>
                Unidad base
                <input value="hora" readOnly aria-readonly="true" />
                <small>La persona se cobra por hora del proyecto completo.</small>
              </label>
            ) : (
              <label>
                Unidad base
                <select
                  value={draft.unit}
                  onChange={(event) => updateDraft('unit', event.target.value as CostUnit)}
                >
                  {Object.entries(unitLabels)
                    .filter(([value]) => value !== 'print')
                    .map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
            )}

            <label>
              {draft.category === 'labor' ? 'Valor por hora' : 'Precio pagado'}
              <input
                value={draft.purchasePrice}
                onChange={(event) => updateDraft('purchasePrice', event.target.value)}
                inputMode="decimal"
                placeholder={draft.category === 'labor' ? 'Ej. 5000' : 'Ej. 15000'}
                required
              />
            </label>

            {draft.category !== 'labor' && (
              <label>
                {draft.category === 'ink' ? '¿Cuántas impresiones rinde?' : 'Ese precio contiene'}
                <input
                  value={draft.packageQuantity}
                  onChange={(event) => updateDraft('packageQuantity', event.target.value)}
                  inputMode="decimal"
                  placeholder={
                    draft.category === 'ink'
                      ? 'Ej. 50'
                      : 'Ej. 100 hojas / 1000 g / 1 hora'
                  }
                  required
                />
                <small>
                  {draft.category === 'ink'
                    ? 'Ejemplo: $10.000 / 50 impresiones = $200 por impresión.'
                    : 'La calculadora obtiene automáticamente el costo por unidad base.'}
                </small>
              </label>
            )}

            {draft.category === 'labor' && (
              <div className="admin-budget-labor-note admin-cost-span-2">
                <strong>Una persona por proyecto</strong>
                <span>
                  Ejemplo: Samuel vale $5.000/h. En el presupuesto elegís Samuel y ponés 2 horas;
                  el costo de trabajo será $10.000, sin multiplicarse por hojas o piezas.
                </span>
              </div>
            )}

            {draft.category === 'ink' && (
              <div className="admin-cost-ink-note admin-cost-span-2">
                <strong>Tinta por impresión</strong>
                <span>
                  Simple faz usa 1 impresión por hoja. Doble faz usa la misma hoja pero 2 impresiones.
                </span>
              </div>
            )}

            {draft.category !== 'labor' && (
              <label>
                Desperdicio %
                <input
                  value={draft.wastePercent}
                  onChange={(event) => updateDraft('wastePercent', event.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  required
                />
                <small>Ej. 5% por pruebas, recortes o material que se pierde.</small>
              </label>
            )}

            <label className="admin-cost-span-2">
              Notas
              <textarea
                value={draft.notes}
                onChange={(event) => updateDraft('notes', event.target.value)}
                maxLength={280}
                rows={2}
                placeholder="Proveedor, tarea, observaciones, etc."
              />
            </label>

            <div className="admin-cost-form-actions admin-cost-span-2">
              {editingId && (
                <button
                  type="button"
                  className="admin-secondary"
                  onClick={() => {
                    setEditingId(null)
                    setDraft(emptyDraft)
                    setMessage('')
                  }}
                  disabled={saving}
                >
                  Cancelar edición
                </button>
              )}

              <button className="admin-primary" type="submit" disabled={saving}>
                {saving ? 'Guardando…' : editingId ? 'Actualizar dato' : 'Guardar dato'}
              </button>
            </div>
          </form>

          <div className="admin-cost-data-list">
            <div className="admin-cost-data-toolbar">
              <label className="admin-cost-search">
                Buscar
                <input
                  type="search"
                  value={resourceSearch}
                  onChange={(event) => setResourceSearch(event.target.value)}
                  placeholder="Papel, tinta, Samuel, PLA..."
                />
              </label>

              <label>
                Categoría
                <select
                  value={categoryFilter}
                  onChange={(event) =>
                    setCategoryFilter(event.target.value as 'all' | CostCategory)
                  }
                >
                  <option value="all">Todas</option>
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {state === 'loading' && resources.length === 0 && (
              <div className="admin-cost-empty">Cargando datos de costos…</div>
            )}

            {state === 'error' && resources.length === 0 && (
              <div className="admin-cost-empty">No se pudieron cargar los datos de costos.</div>
            )}

            {state === 'ready' && filteredResources.length === 0 && (
              <div className="admin-cost-empty">No hay datos para este filtro.</div>
            )}

            <div className="admin-cost-resource-list">
              {filteredResources.map((resource) => (
                <article className="admin-cost-resource-row" key={resource.id}>
                  <div className="admin-cost-resource-main">
                    <span>{categoryLabels[resource.category]}</span>
                    <strong>{resource.name}</strong>
                    {resource.detail && <small>{resource.detail}</small>}
                    {resource.notes && <small>{resource.notes}</small>}
                  </div>

                  <div className="admin-cost-resource-price">
                    {resource.category === 'labor' ? (
                      <>
                        <small>Valor de trabajo</small>
                        <strong>{money(number(resource.effective_unit_cost))} / hora</strong>
                      </>
                    ) : (
                      <>
                        <small>
                          Compra: {money(number(resource.purchase_price))} /{' '}
                          {resource.package_quantity} {unitLabels[resource.unit]}
                        </small>
                        <strong>
                          {money(number(resource.effective_unit_cost))} / {unitLabels[resource.unit]}
                        </strong>
                        {number(resource.waste_percent) > 0 && (
                          <small>Incluye {resource.waste_percent}% de desperdicio</small>
                        )}
                      </>
                    )}
                  </div>

                  <div className="admin-cost-resource-actions">
                    <button
                      type="button"
                      className="admin-edit"
                      onClick={() => {
                        setEditingId(resource.id)
                        setDraft(draftFromResource(resource))
                        setMessage('')
                      }}
                      disabled={saving}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="admin-danger"
                      onClick={() => void removeResource(resource)}
                      disabled={saving}
                    >
                      Quitar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
