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

type GuidedCost = {
  key: string
  label: string
  detail: string
  total: number
}

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
    case 'energy':
      return 'kwh'
    case 'machine':
    case 'labor':
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
  const normalized = value.trim().replace(/\s+/g, '').replace(',', '.')
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
    unit: draft.unit,
    purchasePrice: draft.purchasePrice,
    packageQuantity: draft.packageQuantity,
    wastePercent: draft.wastePercent,
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

  const [productionQuantity, setProductionQuantity] = useState('1')
  const [overheadPercent, setOverheadPercent] = useState('10')
  const [profitPercent, setProfitPercent] = useState('40')
  const [roundingStep, setRoundingStep] = useState('100')
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<WizardStep>(1)
  const [jobType, setJobType] = useState<GuidedJobType>('paper-print')

  const [paperResourceId, setPaperResourceId] = useState('')
  const [sheetsPerUnit, setSheetsPerUnit] = useState('1')
  const [inkResourceId, setInkResourceId] = useState('')
  const [printsPerUnit, setPrintsPerUnit] = useState('1')

  const [filamentResourceId, setFilamentResourceId] = useState('')
  const [gramsPerUnit, setGramsPerUnit] = useState('20')
  const [paintEnabled, setPaintEnabled] = useState(false)
  const [paintResourceId, setPaintResourceId] = useState('')
  const [paintMlPerUnit, setPaintMlPerUnit] = useState('2')

  const [manualResourceId, setManualResourceId] = useState('')
  const [manualUsagePerUnit, setManualUsagePerUnit] = useState('1')
  const [manualExtraEnabled, setManualExtraEnabled] = useState(false)
  const [manualExtraResourceId, setManualExtraResourceId] = useState('')
  const [manualExtraUsagePerUnit, setManualExtraUsagePerUnit] = useState('1')

  const [machineResourceId, setMachineResourceId] = useState('')
  const [machineTimePerUnit, setMachineTimePerUnit] = useState('')
  const [energyResourceId, setEnergyResourceId] = useState('')
  const [energyKwhPerHour, setEnergyKwhPerHour] = useState('')
  const [laborResourceId, setLaborResourceId] = useState('')
  const [laborMinutes, setLaborMinutes] = useState('')
  const [laborScope, setLaborScope] = useState<'unit' | 'job'>('job')

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

  const guidedCalculation = useMemo(() => {
    const quantity = Math.max(1, Math.floor(number(productionQuantity) || 1))
    const overhead = Math.max(0, number(overheadPercent))
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
      const sheets = Math.max(0, number(sheetsPerUnit))
      const prints = Math.max(0, number(printsPerUnit))

      addCost({
        key: 'paper',
        label: 'Papel',
        resourceId: paperResourceId,
        amount: sheets,
        inputUnit: 'sheet',
        multiplier: quantity,
        detail: `${sheets || 0} hoja(s) × ${quantity} unidad(es)`,
      })

      addCost({
        key: 'ink',
        label: 'Tinta',
        resourceId: inkResourceId,
        amount: prints,
        inputUnit: 'print',
        multiplier: quantity,
        detail: `${prints || 0} impresión(es) × ${quantity} unidad(es)`,
      })
    }

    if (jobType === '3d-print') {
      const grams = Math.max(0, number(gramsPerUnit))

      addCost({
        key: 'filament',
        label: 'Filamento',
        resourceId: filamentResourceId,
        amount: grams,
        inputUnit: 'g',
        multiplier: quantity,
        detail: `${grams || 0} g × ${quantity} pieza(s)`,
      })

      if (paintEnabled) {
        const paintMl = Math.max(0, number(paintMlPerUnit))

        addCost({
          key: 'paint',
          label: 'Pintura / acrílico',
          resourceId: paintResourceId,
          amount: paintMl,
          inputUnit: 'ml',
          multiplier: quantity,
          detail: `${paintMl || 0} ml × ${quantity} pieza(s)`,
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
          multiplier: quantity,
          detail: `${mainUsage || 0} ${unitLabels[mainResource.unit]} × ${quantity} unidad(es)`,
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
            multiplier: quantity,
            detail: `${extraUsage || 0} ${unitLabels[extraResource.unit]} × ${quantity} unidad(es)`,
          })
        }
      }
    }

    const machineValue = Math.max(0, number(machineTimePerUnit))
    const machineHours =
      jobType === '3d-print'
        ? machineValue
        : machineValue / 60

    if (machineResourceId && machineHours > 0) {
      addCost({
        key: 'machine',
        label: jobType === '3d-print' ? 'Impresora 3D' : 'Máquina / impresión',
        resourceId: machineResourceId,
        amount: machineHours,
        inputUnit: 'hour',
        multiplier: quantity,
        detail:
          jobType === '3d-print'
            ? `${machineValue} h × ${quantity} pieza(s)`
            : `${machineValue} min × ${quantity} unidad(es)`,
      })
    }

    const energyRate = Math.max(0, number(energyKwhPerHour))
    if (energyResourceId && machineHours > 0 && energyRate > 0) {
      const totalKwh = energyRate * machineHours * quantity

      addCost({
        key: 'energy',
        label: 'Energía',
        resourceId: energyResourceId,
        amount: totalKwh,
        inputUnit: 'kwh',
        detail: `${energyRate} kWh/h × ${(machineHours * quantity).toFixed(2)} h`,
      })
    }

    const laborValue = Math.max(0, number(laborMinutes))
    if (laborResourceId && laborValue > 0) {
      addCost({
        key: 'labor',
        label: 'Trabajo / tiempo',
        resourceId: laborResourceId,
        amount: laborValue,
        inputUnit: 'minute',
        multiplier: laborScope === 'unit' ? quantity : 1,
        detail:
          laborScope === 'unit'
            ? `${laborValue} min × ${quantity} unidad(es)`
            : `${laborValue} min del trabajo completo`,
      })
    }

    const directCost = costs.reduce((sum, item) => sum + item.total, 0)
    const overheadCost = directCost * (overhead / 100)
    const productionCost = directCost + overheadCost
    const rawSaleTotal = productionCost * (1 + profit / 100)
    const rawSalePerUnit = rawSaleTotal / quantity
    const suggestedPerUnit = roundUp(rawSalePerUnit, rounding)
    const suggestedTotal = suggestedPerUnit * quantity

    return {
      quantity,
      overhead,
      profit,
      costs,
      directCost,
      overheadCost,
      productionCost,
      costPerUnit: productionCost / quantity,
      suggestedPerUnit,
      suggestedTotal,
    }
  }, [
    energyKwhPerHour,
    energyResourceId,
    filamentResourceId,
    gramsPerUnit,
    inkResourceId,
    jobType,
    laborMinutes,
    laborResourceId,
    laborScope,
    machineResourceId,
    machineTimePerUnit,
    manualExtraEnabled,
    manualExtraResourceId,
    manualExtraUsagePerUnit,
    manualResourceId,
    manualUsagePerUnit,
    overheadPercent,
    paintEnabled,
    paintMlPerUnit,
    paintResourceId,
    paperResourceId,
    printsPerUnit,
    productionQuantity,
    profitPercent,
    resources,
    roundingStep,
    sheetsPerUnit,
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
    if (machineResourceId === resourceId) setMachineResourceId('')
    if (energyResourceId === resourceId) setEnergyResourceId('')
    if (laborResourceId === resourceId) setLaborResourceId('')
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
    setProductionQuantity('1')

    setSheetsPerUnit('1')
    setPrintsPerUnit('1')
    setGramsPerUnit('20')
    setPaintEnabled(false)
    setPaintMlPerUnit('2')
    setManualUsagePerUnit('1')
    setManualExtraEnabled(false)
    setManualExtraResourceId('')
    setManualExtraUsagePerUnit('1')
    setMachineTimePerUnit('')
    setEnergyKwhPerHour('')
    setLaborMinutes('')
    setLaborScope('job')

    if (type === 'paper-print') {
      setPaperResourceId(firstResourceId('paper'))
      setInkResourceId(firstResourceId('ink'))
      setMachineResourceId('')
    }

    if (type === '3d-print') {
      setFilamentResourceId(firstResourceId('filament'))
      setPaintResourceId(firstResourceId('paint'))
      setMachineResourceId(firstResourceId('machine'))
    }

    if (type === 'manual') {
      const firstMaterial = resources.find((resource) =>
        ['paper', 'paint', 'consumable', 'other', 'filament'].includes(resource.category),
      )

      setManualResourceId(firstMaterial?.id ?? '')
      setMachineResourceId('')
    }

    setEnergyResourceId(firstResourceId('energy'))
    setLaborResourceId(firstResourceId('labor'))
    setQuoteOpen(true)
  }

  function closeQuote() {
    setQuoteOpen(false)
    setWizardStep(1)
  }

  function goToCostData() {
    setQuoteOpen(false)
    setView('data')
    setMessage('Cargá o actualizá tus costos y después volvé a Presupuesto rápido.')
  }

  const paperResources = resources.filter((resource) => resource.category === 'paper')
  const inkResources = resources.filter((resource) => resource.category === 'ink')
  const filamentResources = resources.filter((resource) => resource.category === 'filament')
  const paintResources = resources.filter((resource) => resource.category === 'paint')
  const machineResources = resources.filter((resource) => resource.category === 'machine')
  const energyResources = resources.filter((resource) => resource.category === 'energy')
  const laborResources = resources.filter((resource) => resource.category === 'labor')
  const manualMaterialResources = resources.filter((resource) =>
    ['paper', 'paint', 'consumable', 'other', 'filament'].includes(resource.category),
  )

  const selectedManualResource =
    resources.find((resource) => resource.id === manualResourceId) ?? null
  const selectedManualExtraResource =
    resources.find((resource) => resource.id === manualExtraResourceId) ?? null

  const stepTwoReady =
    jobType === 'paper-print'
      ? Boolean(
          paperResourceId &&
          inkResourceId &&
          number(sheetsPerUnit) > 0 &&
          number(printsPerUnit) > 0,
        )
      : jobType === '3d-print'
        ? Boolean(
            filamentResourceId &&
            number(gramsPerUnit) > 0 &&
            (!paintEnabled || (paintResourceId && number(paintMlPerUnit) > 0)),
          )
        : Boolean(
            manualResourceId &&
            number(manualUsagePerUnit) > 0 &&
            (!manualExtraEnabled ||
              (manualExtraResourceId && number(manualExtraUsagePerUnit) > 0)),
          )

  const jobTitle =
    jobType === 'paper-print'
      ? 'Impresión en papel'
      : jobType === '3d-print'
        ? 'Impresión 3D'
        : 'Manualidad / armado'

  return (
    <section className="admin-panel admin-cost-calculator">
      <div className="admin-cost-heading-v2">
        <div className="admin-cost-heading-copy">
          <span className="admin-cost-eyebrow">Costos & rentabilidad</span>
          <h2>Presupuesto rápido</h2>
          <p>
            Elegí qué tipo de trabajo vas a hacer y la calculadora te pregunta solamente lo necesario.
          </p>

          <div className="admin-cost-heading-meta">
            <span>{resources.length} datos cargados</span>
            <span>Cálculo privado del admin</span>
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
        <div className="admin-guided-calculator">
          {resources.length === 0 ? (
            <div className="admin-cost-empty admin-cost-empty-hero">
              <div className="admin-cost-empty-icon" aria-hidden="true">+</div>
              <div className="admin-cost-empty-copy">
                <span className="admin-cost-empty-kicker">Primero tu base de costos</span>
                <strong>Cargá tus materiales una vez y después presupuestá en segundos.</strong>
                <p>
                  Papeles, tintas, filamentos, energía, horas de máquina y mano de obra quedan
                  guardados para reutilizarlos en cada cálculo.
                </p>
              </div>
              <button className="admin-primary" type="button" onClick={() => setView('data')}>
                Cargar costos
              </button>
            </div>
          ) : (
            <>
              <div className="admin-guided-intro">
                <div>
                  <span className="admin-cost-eyebrow">Nuevo presupuesto</span>
                  <h3>¿Qué vas a fabricar?</h3>
                  <p>
                    No agregues costos uno por uno. Elegí el tipo de trabajo y te guiamos con
                    los materiales que normalmente necesita.
                  </p>
                </div>

                <button className="admin-secondary" type="button" onClick={() => setView('data')}>
                  Editar base de costos
                </button>
              </div>

              <div className="admin-guided-job-grid">
                <button
                  type="button"
                  className="admin-guided-job-card"
                  onClick={() => openQuote('paper-print')}
                >
                  <span className="admin-guided-job-icon">01</span>
                  <strong>Impresión en papel</strong>
                  <p>Papel + tinta + tiempo de impresión + energía + trabajo manual.</p>
                  <small>
                    {paperResources.length} papeles · {inkResources.length} tintas disponibles
                  </small>
                  <span className="admin-guided-job-action">Calcular →</span>
                </button>

                <button
                  type="button"
                  className="admin-guided-job-card"
                  onClick={() => openQuote('3d-print')}
                >
                  <span className="admin-guided-job-icon">02</span>
                  <strong>Impresión 3D</strong>
                  <p>Filamento + horas de máquina + energía + acrílico opcional + acabado.</p>
                  <small>
                    {filamentResources.length} filamentos · {machineResources.length} costos de máquina
                  </small>
                  <span className="admin-guided-job-action">Calcular →</span>
                </button>

                <button
                  type="button"
                  className="admin-guided-job-card"
                  onClick={() => openQuote('manual')}
                >
                  <span className="admin-guided-job-icon">03</span>
                  <strong>Manualidad / armado</strong>
                  <p>Material principal + material extra + tiempo de trabajo + herramienta.</p>
                  <small>{manualMaterialResources.length} materiales compatibles</small>
                  <span className="admin-guided-job-action">Calcular →</span>
                </button>
              </div>

              <div className="admin-guided-how">
                <div><span>1</span><strong>Elegís el trabajo</strong><small>Solo mostramos costos relacionados.</small></div>
                <div><span>2</span><strong>Indicás qué consume</strong><small>Por unidad, pieza o trabajo completo.</small></div>
                <div><span>3</span><strong>Ves el precio</strong><small>Con costo real, indirectos y recargo.</small></div>
              </div>
            </>
          )}

          {quoteOpen && (
            <div className="admin-quote-overlay" role="presentation">
              <section
                className="admin-quote-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-quote-title"
              >
                <header className="admin-quote-header">
                  <div>
                    <span>Presupuesto guiado · Paso {wizardStep} de 3</span>
                    <h3 id="admin-quote-title">{jobTitle}</h3>
                  </div>
                  <button
                    className="admin-quote-close"
                    type="button"
                    onClick={closeQuote}
                    aria-label="Cerrar presupuesto"
                  >
                    ×
                  </button>
                </header>

                <div className="admin-quote-progress" aria-hidden="true">
                  <span className={wizardStep >= 1 ? 'is-active' : ''} />
                  <span className={wizardStep >= 2 ? 'is-active' : ''} />
                  <span className={wizardStep >= 3 ? 'is-active' : ''} />
                </div>

                <div className="admin-quote-body">
                  {wizardStep === 1 && (
                    <div className="admin-quote-step admin-quote-step-start">
                      <div className="admin-quote-step-copy">
                        <span className="admin-cost-eyebrow">Paso 1</span>
                        <h4>¿Cuántas unidades vas a hacer?</h4>
                        <p>
                          Primero definimos la cantidad. En el siguiente paso te preguntamos
                          cuánto material usa una sola unidad.
                        </p>
                      </div>

                      <label className="admin-quote-quantity">
                        Cantidad
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={productionQuantity}
                          onChange={(event) => setProductionQuantity(event.target.value)}
                          autoFocus
                        />
                        <small>
                          {jobType === '3d-print' ? 'Cantidad de piezas 3D.' : 'Cantidad final que vas a entregar.'}
                        </small>
                      </label>

                      <div className="admin-quote-example">
                        <strong>Cómo funciona</strong>
                        <span>
                          Si hacés {Math.max(1, Math.floor(number(productionQuantity) || 1))} unidades,
                          la calculadora multiplica automáticamente los consumos “por unidad”.
                        </span>
                      </div>
                    </div>
                  )}

                  {wizardStep === 2 && (
                    <div className="admin-quote-step">
                      <div className="admin-quote-step-copy">
                        <span className="admin-cost-eyebrow">Paso 2</span>
                        <h4>¿Qué consume una unidad?</h4>
                        <p>
                          Completá solamente lo que realmente usa este trabajo. Los campos
                          opcionales pueden quedar vacíos.
                        </p>
                      </div>

                      {jobType === 'paper-print' && (
                        <div className="admin-quote-material-pair">
                          <div className="admin-quote-resource-card">
                            <span className="admin-quote-resource-number">1</span>
                            <div>
                              <strong>Papel</strong>
                              <small>Cada unidad necesita un papel o fracción de hoja.</small>
                            </div>

                            {paperResources.length > 0 ? (
                              <>
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
                                <label>
                                  Hojas por unidad
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={sheetsPerUnit}
                                    onChange={(event) => setSheetsPerUnit(event.target.value)}
                                  />
                                </label>
                              </>
                            ) : (
                              <button className="admin-secondary" type="button" onClick={goToCostData}>
                                Cargar un papel
                              </button>
                            )}
                          </div>

                          <div className="admin-quote-plus" aria-hidden="true">+</div>

                          <div className="admin-quote-resource-card">
                            <span className="admin-quote-resource-number">2</span>
                            <div>
                              <strong>Tinta</strong>
                              <small>Cada impresión consume el rendimiento de la tinta elegida.</small>
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
                                  Impresiones por unidad
                                  <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={printsPerUnit}
                                    onChange={(event) => setPrintsPerUnit(event.target.value)}
                                  />
                                  <small>Frente = 1 · doble faz = 2.</small>
                                </label>
                              </>
                            ) : (
                              <button className="admin-secondary" type="button" onClick={goToCostData}>
                                Cargar una tinta
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {jobType === '3d-print' && (
                        <div className="admin-quote-stack">
                          <div className="admin-quote-resource-card admin-quote-resource-card-wide">
                            <span className="admin-quote-resource-number">1</span>
                            <div>
                              <strong>Filamento</strong>
                              <small>Usá los gramos estimados que te informa el laminador.</small>
                            </div>

                            {filamentResources.length > 0 ? (
                              <div className="admin-quote-fields-2">
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
                                    value={gramsPerUnit}
                                    onChange={(event) => setGramsPerUnit(event.target.value)}
                                  />
                                </label>
                              </div>
                            ) : (
                              <button className="admin-secondary" type="button" onClick={goToCostData}>
                                Cargar filamento
                              </button>
                            )}
                          </div>

                          <div className="admin-quote-optional-card">
                            <label className="admin-quote-check">
                              <input
                                type="checkbox"
                                checked={paintEnabled}
                                onChange={(event) => setPaintEnabled(event.target.checked)}
                              />
                              <span>
                                <strong>¿La pieza lleva acrílico / pintura?</strong>
                                <small>Activá esto solo si realmente la vas a pintar.</small>
                              </span>
                            </label>

                            {paintEnabled && (
                              paintResources.length > 0 ? (
                                <div className="admin-quote-fields-2">
                                  <label>
                                    Pintura
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
                                      value={paintMlPerUnit}
                                      onChange={(event) => setPaintMlPerUnit(event.target.value)}
                                    />
                                  </label>
                                </div>
                              ) : (
                                <button className="admin-secondary" type="button" onClick={goToCostData}>
                                  Cargar pintura / acrílico
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      )}

                      {jobType === 'manual' && (
                        <div className="admin-quote-stack">
                          <div className="admin-quote-resource-card admin-quote-resource-card-wide">
                            <span className="admin-quote-resource-number">1</span>
                            <div>
                              <strong>Material principal</strong>
                              <small>Elegí el material que más pesa en este trabajo.</small>
                            </div>

                            {manualMaterialResources.length > 0 ? (
                              <div className="admin-quote-fields-2">
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
                                      : 'Según la unidad de tu dato.'}
                                  </small>
                                </label>
                              </div>
                            ) : (
                              <button className="admin-secondary" type="button" onClick={goToCostData}>
                                Cargar un material
                              </button>
                            )}
                          </div>

                          <div className="admin-quote-optional-card">
                            <label className="admin-quote-check">
                              <input
                                type="checkbox"
                                checked={manualExtraEnabled}
                                onChange={(event) => setManualExtraEnabled(event.target.checked)}
                              />
                              <span>
                                <strong>¿Usa un segundo material?</strong>
                                <small>Por ejemplo cinta, acrílico, papel adicional o pegamento.</small>
                              </span>
                            </label>

                            {manualExtraEnabled && (
                              <div className="admin-quote-fields-2">
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

                      <div className="admin-quote-optional-section">
                        <div className="admin-quote-section-title">
                          <strong>Tiempo, máquina y energía</strong>
                          <small>Opcional. Completá solo lo que quieras cobrar o medir.</small>
                        </div>

                        <div className="admin-quote-fields-3">
                          <label>
                            Costo de máquina
                            <select
                              value={machineResourceId}
                              onChange={(event) => setMachineResourceId(event.target.value)}
                            >
                              <option value="">No incluir</option>
                              {machineResources.map((resource) => (
                                <option key={resource.id} value={resource.id}>
                                  {resource.name}{resource.detail ? ` · ${resource.detail}` : ''}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            {jobType === '3d-print' ? 'Horas de máquina por pieza' : 'Minutos de máquina por unidad'}
                            <input
                              type="number"
                              min={0}
                              step={jobType === '3d-print' ? '0.1' : '1'}
                              value={machineTimePerUnit}
                              onChange={(event) => setMachineTimePerUnit(event.target.value)}
                              disabled={!machineResourceId}
                              placeholder={jobType === '3d-print' ? 'Ej. 3.5' : 'Ej. 2'}
                            />
                          </label>

                          <label>
                            Tarifa eléctrica
                            <select
                              value={energyResourceId}
                              onChange={(event) => setEnergyResourceId(event.target.value)}
                            >
                              <option value="">No incluir</option>
                              {energyResources.map((resource) => (
                                <option key={resource.id} value={resource.id}>
                                  {resource.name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            Consumo eléctrico kWh/h
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={energyKwhPerHour}
                              onChange={(event) => setEnergyKwhPerHour(event.target.value)}
                              disabled={!energyResourceId || !machineResourceId}
                              placeholder="Ej. 0.12"
                            />
                            <small>Potencia promedio de la máquina.</small>
                          </label>

                          <label>
                            Valor de tu tiempo
                            <select
                              value={laborResourceId}
                              onChange={(event) => setLaborResourceId(event.target.value)}
                            >
                              <option value="">No incluir</option>
                              {laborResources.map((resource) => (
                                <option key={resource.id} value={resource.id}>
                                  {resource.name}{resource.detail ? ` · ${resource.detail}` : ''}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            Minutos de trabajo
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={laborMinutes}
                              onChange={(event) => setLaborMinutes(event.target.value)}
                              disabled={!laborResourceId}
                              placeholder="Ej. 30"
                            />
                          </label>

                          <label>
                            Ese tiempo es
                            <select
                              value={laborScope}
                              onChange={(event) =>
                                setLaborScope(event.target.value as 'unit' | 'job')
                              }
                              disabled={!laborResourceId}
                            >
                              <option value="job">Una vez por todo el trabajo</option>
                              <option value="unit">Por cada unidad</option>
                            </select>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {wizardStep === 3 && (
                    <div className="admin-quote-step admin-quote-result-step">
                      <div className="admin-quote-step-copy">
                        <span className="admin-cost-eyebrow">Paso 3</span>
                        <h4>Este es el costo real del trabajo</h4>
                        <p>
                          Podés volver atrás para cambiar materiales. Abajo ajustás indirectos,
                          recargo y redondeo del precio final.
                        </p>
                      </div>

                      <div className="admin-quote-result-layout">
                        <div className="admin-quote-breakdown">
                          <div className="admin-quote-section-title">
                            <strong>¿En qué se va la plata?</strong>
                            <small>Desglose calculado automáticamente.</small>
                          </div>

                          {guidedCalculation.costs.length === 0 ? (
                            <div className="admin-cost-empty admin-cost-empty-small">
                              Todavía no hay costos medibles. Volvé al paso 2 y completá al menos un material.
                            </div>
                          ) : (
                            guidedCalculation.costs.map((cost) => (
                              <div className="admin-quote-cost-row" key={cost.key}>
                                <div>
                                  <strong>{cost.label}</strong>
                                  <small>{cost.detail}</small>
                                </div>
                                <span>{money(cost.total)}</span>
                              </div>
                            ))
                          )}

                          <div className="admin-quote-cost-row admin-quote-cost-row-subtotal">
                            <div>
                              <strong>Costos directos</strong>
                              <small>Materiales, máquina, energía y tiempo.</small>
                            </div>
                            <span>{money(guidedCalculation.directCost)}</span>
                          </div>
                        </div>

                        <aside className="admin-quote-price-panel">
                          <div className="admin-quote-selling-controls">
                            <label>
                              Costos indirectos %
                              <input
                                type="number"
                                min={0}
                                step="0.1"
                                value={overheadPercent}
                                onChange={(event) => setOverheadPercent(event.target.value)}
                              />
                            </label>
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

                          <div className="admin-quote-price-metric">
                            <span>Costo total</span>
                            <strong>{money(guidedCalculation.productionCost)}</strong>
                            <small>{money(guidedCalculation.costPerUnit)} por unidad</small>
                          </div>

                          <div className="admin-quote-price-final">
                            <span>Precio sugerido</span>
                            <strong>{money(guidedCalculation.suggestedTotal)}</strong>
                            <small>
                              {money(guidedCalculation.suggestedPerUnit)} × {guidedCalculation.quantity} unidad(es)
                            </small>
                          </div>
                        </aside>
                      </div>
                    </div>
                  )}
                </div>

                <footer className="admin-quote-footer">
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

                  <div className="admin-quote-footer-main">
                    {wizardStep === 2 && !stepTwoReady && (
                      <span className="admin-quote-footer-hint">
                        Completá los materiales obligatorios.
                      </span>
                    )}

                    <button className="admin-secondary" type="button" onClick={closeQuote}>
                      Cerrar
                    </button>

                    {wizardStep < 3 && (
                      <button
                        className="admin-primary"
                        type="button"
                        disabled={
                          wizardStep === 1
                            ? number(productionQuantity) < 1
                            : !stepTwoReady
                        }
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
                Tu base de costos alimenta automáticamente la calculadora. Podés cargar desde
                una hoja de papel hasta una hora de diseño o de impresora 3D.
              </span>
            </div>

            <label>
              Nombre
              <input
                value={draft.name}
                onChange={(event) => updateDraft('name', event.target.value)}
                maxLength={120}
                placeholder="Ej. Papel holográfico"
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
                    unit:
                      nextCategory === 'ink'
                        ? 'print'
                        : current.unit === 'print'
                          ? defaultUnitForCategory(nextCategory)
                          : current.unit,
                    packageQuantity:
                      nextCategory === 'ink' && current.category !== 'ink'
                        ? ''
                        : current.packageQuantity,
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
                placeholder="Ej. A4 · 180 g · doble faz"
              />
            </label>

            {draft.category === 'ink' ? (
              <label>
                Unidad base
                <input value="impresión" readOnly aria-readonly="true" />
                <small>Para tinta usamos rendimiento por impresión.</small>
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
              Precio pagado
              <input
                value={draft.purchasePrice}
                onChange={(event) => updateDraft('purchasePrice', event.target.value)}
                inputMode="decimal"
                placeholder="Ej. 15000"
                required
              />
            </label>

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
                  ? 'Ejemplo: si pagaste $10.000 y rinde 50 impresiones, la tinta cuesta $200 por impresión.'
                  : 'La calculadora obtiene automáticamente el costo por unidad base.'}
              </small>
            </label>

            {draft.category === 'ink' && (
              <div className="admin-cost-ink-note admin-cost-span-2">
                <strong>Tinta por impresión</strong>
                <span>
                  La tinta se calcula por impresión y es independiente del papel elegido.
                  En la calculadora, 1 impresión por unidad usa exactamente este costo.
                </span>
              </div>
            )}

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

            <label className="admin-cost-span-2">
              Notas
              <textarea
                value={draft.notes}
                onChange={(event) => updateDraft('notes', event.target.value)}
                maxLength={280}
                rows={2}
                placeholder="Marca, proveedor, observaciones, etc."
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
                  placeholder="Papel, tinta, PLA..."
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
