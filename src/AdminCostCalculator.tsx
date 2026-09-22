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

type CalculationLine = {
  id: string
  resourceId: string
  usage: string
  scope: 'unit' | 'job'
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
  const [lines, setLines] = useState<CalculationLine[]>([])

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

  const calculation = useMemo(() => {
    const quantity = Math.max(1, Math.floor(number(productionQuantity) || 1))
    const overhead = Math.max(0, number(overheadPercent))
    const profit = Math.max(0, number(profitPercent))
    const rounding = Math.max(1, number(roundingStep) || 1)

    const detailedLines = lines.flatMap((line) => {
      const resource = resources.find((item) => item.id === line.resourceId)
      if (!resource) return []

      const usage = Math.max(0, number(line.usage))
      const effectiveUnitCost = number(resource.effective_unit_cost)
      const multiplier = line.scope === 'unit' ? quantity : 1
      const total = effectiveUnitCost * usage * multiplier

      return [
        {
          ...line,
          resource,
          usage,
          effectiveUnitCost,
          total,
        },
      ]
    })

    const directCost = detailedLines.reduce((sum, line) => sum + line.total, 0)
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
      detailedLines,
      directCost,
      overheadCost,
      productionCost,
      costPerUnit: productionCost / quantity,
      rawSalePerUnit,
      suggestedPerUnit,
      suggestedTotal,
    }
  }, [
    lines,
    overheadPercent,
    productionQuantity,
    profitPercent,
    resources,
    roundingStep,
  ])

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
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

      setLines((current) => current.filter((line) => line.resourceId !== resource.id))
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

  function addCalculationLine() {
    const first = resources[0]
    if (!first) {
      setView('data')
      setMessage('Primero cargá al menos un dato de costo.')
      return
    }

    setLines((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        resourceId: first.id,
        usage: '1',
        scope: 'unit',
      },
    ])
  }

  function updateLine(
    lineId: string,
    patch: Partial<Pick<CalculationLine, 'resourceId' | 'usage' | 'scope'>>,
  ) {
    setLines((current) =>
      current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    )
  }

  return (
    <section className="admin-panel admin-cost-calculator">
      <div className="admin-cost-heading-v2">
        <div className="admin-cost-heading-copy">
          <span className="admin-cost-eyebrow">Costos & rentabilidad</span>
          <h2>Calculadora inteligente</h2>
          <p>
            Armá precios con tus costos reales de materiales, tinta, energía, máquina y tiempo.
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
            Calculadora
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
        <div className="admin-cost-workspace">
          <div className="admin-cost-setup-card">
            <div className="admin-cost-section-heading">
              <span>01</span>
              <div>
                <strong>Configuración del trabajo</strong>
                <small>Definí cantidad, indirectos, recargo y redondeo antes de cargar consumos.</small>
              </div>
            </div>

            <div className="admin-cost-controls">
            <label>
              Cantidad a producir
              <input
                type="number"
                min={1}
                step={1}
                value={productionQuantity}
                onChange={(event) => setProductionQuantity(event.target.value)}
              />
                          <small>Cantidad total de unidades del trabajo o pedido.</small>
            </label>

            <label>
              Costos indirectos %
              <input
                type="number"
                min={0}
                step="0.1"
                value={overheadPercent}
                onChange={(event) => setOverheadPercent(event.target.value)}
              />
              <small>Luz general, herramientas, descartes y gastos difíciles de medir.</small>
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
                          <small>Margen aplicado sobre el costo total calculado.</small>
            </label>

            <label>
              Redondear precio a
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
                          <small>El precio sugerido sube al múltiplo elegido.</small>
            </label>
            </div>
          </div>

          {resources.length === 0 ? (
            <div className="admin-cost-empty admin-cost-empty-hero">
              <div className="admin-cost-empty-icon" aria-hidden="true">+</div>

              <div className="admin-cost-empty-copy">
                <span className="admin-cost-empty-kicker">Empezá por tu base</span>
                <strong>La calculadora se vuelve útil cuando conoce tus costos reales.</strong>
                <p>
                  Cargá una vez tus papeles, tintas, filamentos, energía, tiempos y desgaste de
                  máquina. Después los reutilizás en cada presupuesto.
                </p>

                <div className="admin-cost-empty-tags" aria-label="Ejemplos de costos">
                  <span>Papel</span>
                  <span>Tinta</span>
                  <span>Filamento</span>
                  <span>Energía</span>
                  <span>Tiempo</span>
                </div>
              </div>

              <button className="admin-primary" type="button" onClick={() => setView('data')}>
                Ir a Base de costos
              </button>
            </div>
          ) : (
            <>
              <div className="admin-cost-lines">
                <div className="admin-cost-lines-heading">
                  <span className="admin-cost-section-number">02</span>
                  <div>
                    <strong>Consumos del trabajo</strong>
                    <span>
                      Elegí “Por unidad” si el gasto se repite por cada pieza o “Por trabajo” si
                      se paga una sola vez.
                    </span>
                  </div>

                  <button className="admin-secondary" type="button" onClick={addCalculationLine}>
                    + Agregar costo
                  </button>
                </div>

                {lines.length === 0 ? (
                  <div className="admin-cost-empty admin-cost-empty-small">
                    Agregá los materiales y tiempos que usa este trabajo.
                  </div>
                ) : (
                  <div className="admin-cost-line-list">
                    {calculation.detailedLines.map((line) => (
                      <article className="admin-cost-line" key={line.id}>
                        <label className="admin-cost-resource-select">
                          Dato
                          <select
                            value={line.resourceId}
                            onChange={(event) => {
                              const resourceId = event.target.value
                              const nextResource = resources.find(
                                (resource) => resource.id === resourceId,
                              )

                              updateLine(line.id, {
                                resourceId,
                                ...(nextResource?.unit === 'print'
                                  ? { usage: '1', scope: 'unit' }
                                  : {}),
                              })
                            }}
                          >
                            {resources.map((resource) => (
                              <option key={resource.id} value={resource.id}>
                                {resource.name}
                                {resource.detail ? ` · ${resource.detail}` : ''}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          {line.resource.unit === 'print'
                            ? 'Impresiones por unidad'
                            : `Consumo (${unitLabels[line.resource.unit]})`}
                          <input
                            type="number"
                            min={0}
                            step={line.resource.unit === 'print' ? 1 : '0.001'}
                            value={line.usage}
                            onChange={(event) => updateLine(line.id, { usage: event.target.value })}
                          />
                        </label>

                        <label>
                          Se aplica
                          <select
                            value={line.scope}
                            onChange={(event) =>
                              updateLine(line.id, {
                                scope: event.target.value as 'unit' | 'job',
                              })
                            }
                          >
                            <option value="unit">Por unidad</option>
                            <option value="job">Por trabajo</option>
                          </select>
                        </label>

                        <div className="admin-cost-line-result">
                          <small>
                            {money(line.effectiveUnitCost)} / {unitLabels[line.resource.unit]}
                          </small>
                          <strong>{money(line.total)}</strong>
                        </div>

                        <button
                          type="button"
                          className="admin-danger"
                          onClick={() =>
                            setLines((current) => current.filter((item) => item.id !== line.id))
                          }
                        >
                          Quitar
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className="admin-cost-summary">
                <div>
                  <span>Costos directos</span>
                  <strong>{money(calculation.directCost)}</strong>
                </div>
                <div>
                  <span>Indirectos ({calculation.overhead}%)</span>
                  <strong>{money(calculation.overheadCost)}</strong>
                </div>
                <div>
                  <span>Costo total de producción</span>
                  <strong>{money(calculation.productionCost)}</strong>
                </div>
                <div>
                  <span>Costo por unidad</span>
                  <strong>{money(calculation.costPerUnit)}</strong>
                </div>
                <div className="admin-cost-summary-highlight">
                  <span>Precio sugerido por unidad</span>
                  <strong>{money(calculation.suggestedPerUnit)}</strong>
                  <small>
                    Incluye {calculation.profit}% de ganancia y redondeo seleccionado.
                  </small>
                </div>
                <div className="admin-cost-summary-highlight">
                  <span>Venta sugerida del trabajo</span>
                  <strong>{money(calculation.suggestedTotal)}</strong>
                  <small>{calculation.quantity} unidades</small>
                </div>
              </div>
            </>
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
