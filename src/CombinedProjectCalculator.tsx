import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import {
  LIGHT_PERCENT,
  WEAR_PERCENT,
  unitLabels,
} from './admin/costs/config'
import {
  calculateCombinedCost,
  combinedComponentReady,
  newCombinedComponent,
  type CombinedComponent,
  type CombinedRecipe,
  type CombinedTemplate,
} from './admin/costs/combined'
import type { CostResource, PrintSides } from './admin/costs/types'
import { money, number } from './admin/costs/utils'
import { adminRequest, responseMessage } from './admin/shared/http'
import { useModalLifecycle } from './admin/shared/useModalLifecycle'
import {
  openQuotePrintView,
  type AdminQuote,
  type QuoteSnapshot,
} from './adminQuotePrint'

type Props = {
  resources: CostResource[]
  sourceRequestId?: string | null
  initialTitle?: string
  initialQuantity?: string
  initialCustomerName?: string
  initialCustomerPhone?: string
  initialNotes?: string
  onClose: () => void
  onSaved: (quote: AdminQuote) => void
}

function cloneComponents(components: CombinedComponent[]) {
  return components.map((component) => ({
    ...component,
    id:
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }))
}

export default function CombinedProjectCalculator({
  resources,
  sourceRequestId = null,
  initialTitle = '',
  initialQuantity = '',
  initialCustomerName = '',
  initialCustomerPhone = '',
  initialNotes = '',
  onClose,
  onSaved,
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [title, setTitle] = useState(initialTitle)
  const [quantity, setQuantity] = useState(initialQuantity)
  const [components, setComponents] = useState<CombinedComponent[]>([])
  const [workerResourceId, setWorkerResourceId] = useState('')
  const [projectHours, setProjectHours] = useState('')
  const [profitPercent, setProfitPercent] = useState('40')
  const [roundingStep, setRoundingStep] = useState('100')

  const [customerName, setCustomerName] = useState(initialCustomerName)
  const [customerPhone, setCustomerPhone] = useState(initialCustomerPhone)
  const [validityDays, setValidityDays] = useState('7')
  const [notes, setNotes] = useState(initialNotes)

  const [templates, setTemplates] = useState<CombinedTemplate[]>([])
  const [templateName, setTemplateName] = useState('')
  const [templateBusy, setTemplateBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useModalLifecycle(true, onClose)

  const paperResources = resources.filter((resource) => resource.category === 'paper')
  const inkResources = resources.filter((resource) => resource.category === 'ink')
  const filamentResources = resources.filter((resource) => resource.category === 'filament')
  const workerResources = resources.filter((resource) => resource.category === 'labor')
  const materialResources = resources.filter((resource) => resource.category !== 'labor')

  const calculation = useMemo(
    () =>
      calculateCombinedCost({
        resources,
        quantity,
        profitPercent,
        roundingStep,
        components,
        workerResourceId,
        projectHours,
      }),
    [
      components,
      profitPercent,
      projectHours,
      quantity,
      resources,
      roundingStep,
      workerResourceId,
    ],
  )

  useEffect(() => {
    let cancelled = false

    async function loadTemplates() {
      try {
        const response = await adminRequest(
          '/api/admin/catalog?action=quote-templates',
          { cache: 'no-store' },
        )
        if (!response.ok) return

        const data = (await response.json()) as {
          templates?: CombinedTemplate[]
        }

        if (!cancelled) setTemplates(data.templates ?? [])
      } catch {
        // Las plantillas son opcionales para poder calcular.
      }
    }

    void loadTemplates()

    return () => {
      cancelled = true
    }
  }, [])

  function addComponent(kind: CombinedComponent['kind']) {
    setComponents((current) => [...current, newCombinedComponent(kind)])
  }

  function updateComponent(
    id: string,
    patch: Partial<CombinedComponent>,
  ) {
    setComponents((current) =>
      current.map((component) =>
        component.id === id
          ? ({ ...component, ...patch } as CombinedComponent)
          : component,
      ),
    )
  }

  function removeComponent(id: string) {
    setComponents((current) =>
      current.filter((component) => component.id !== id),
    )
  }

  const firstMissing = useMemo(() => {
    for (const component of components) {
      if (component.kind === 'paper') {
        if (!component.paperResourceId) return `${component.id}:paper`
        if (!component.inkResourceId) return `${component.id}:ink`
        if (number(component.sheetsPerUnit) <= 0) {
          return `${component.id}:sheets`
        }
      }

      if (component.kind === '3d') {
        if (!component.filamentResourceId) return `${component.id}:filament`
        if (number(component.piecesPerUnit) <= 0) {
          return `${component.id}:pieces`
        }
        if (number(component.gramsPerPiece) <= 0) {
          return `${component.id}:grams`
        }
      }

      if (component.kind === 'material') {
        if (!component.resourceId) return `${component.id}:resource`
        if (number(component.usagePerUnit) <= 0) {
          return `${component.id}:usage`
        }
      }
    }

    if (!workerResourceId) return 'worker'
    if (number(projectHours) <= 0) return 'hours'
    return null
  }, [components, projectHours, workerResourceId])

  const stepTwoReady =
    components.length > 0 &&
    components.every(combinedComponentReady) &&
    Boolean(workerResourceId) &&
    number(projectHours) > 0

  function fieldClass(key: string, complete: boolean) {
    return [
      'admin-combined-field',
      firstMissing === key ? 'is-next' : '',
      complete ? 'is-complete' : '',
    ]
      .filter(Boolean)
      .join(' ')
  }

  function recipe(): CombinedRecipe {
    return {
      version: 1,
      components: components.map((component) => ({ ...component })),
    }
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault()
    const name = templateName.trim()

    if (name.length < 2 || components.length < 1) {
      setMessage('Poné un nombre y agregá al menos una parte.')
      return
    }

    setTemplateBusy(true)
    setMessage('')

    try {
      const response = await adminRequest(
        '/api/admin/catalog?action=quote-templates',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, recipe: recipe() }),
        },
      )

      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as {
        template: CombinedTemplate
      }

      setTemplates((current) => [
        data.template,
        ...current.filter((item) => item.id !== data.template.id),
      ])
      setTemplateName('')
      setMessage(`Plantilla "${data.template.name}" guardada.`)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar la plantilla.',
      )
    } finally {
      setTemplateBusy(false)
    }
  }

  function applyTemplate(template: CombinedTemplate) {
    setComponents(cloneComponents(template.recipe.components))
    setStep(2)
    setMessage(`Plantilla "${template.name}" aplicada.`)
  }

  async function deleteTemplate(template: CombinedTemplate) {
    if (!window.confirm(`¿Borrar la plantilla "${template.name}"?`)) return

    setTemplateBusy(true)
    try {
      const response = await adminRequest(
        `/api/admin/catalog?action=quote-templates&id=${encodeURIComponent(
          template.id,
        )}`,
        { method: 'DELETE' },
      )
      if (!response.ok) throw new Error(await responseMessage(response))

      setTemplates((current) =>
        current.filter((item) => item.id !== template.id),
      )
      setMessage('Plantilla borrada.')
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo borrar la plantilla.',
      )
    } finally {
      setTemplateBusy(false)
    }
  }

  function validUntil() {
    const days = Math.max(1, Math.floor(number(validityDays) || 7))
    const date = new Date()
    date.setHours(12, 0, 0, 0)
    date.setDate(date.getDate() + days)
    return date.toISOString().slice(0, 10)
  }

  async function saveQuote(printAfter = false) {
    if (!stepTwoReady || title.trim().length < 2 || number(quantity) < 1) {
      setMessage('Completá el proyecto antes de guardarlo.')
      return
    }

    const previewWindow = printAfter
      ? window.open('', '_blank', 'width=980,height=1200')
      : null

    setSaving(true)
    setMessage('')

    try {
      const worker = workerResources.find(
        (resource) => resource.id === workerResourceId,
      )

      const snapshot: QuoteSnapshot = {
        version: 1,
        jobType: 'combined',
        jobLabel: 'Proyecto combinado',
        quantity: calculation.quantity,
        quantityLabel: 'Cantidad de unidades',
        workerName: worker?.name ?? '',
        projectHours: Math.max(0, number(projectHours)),
        printSides: null,
        lightPercent: LIGHT_PERCENT,
        wearPercent: WEAR_PERCENT,
        costs: calculation.costs.map((cost) => ({ ...cost })),
        directCost: calculation.directCost,
        lightCost: calculation.lightCost,
        wearCost: calculation.wearCost,
        realCost: calculation.realCost,
        profitPercent: calculation.profit,
        roundingStep: Math.max(1, number(roundingStep) || 1),
        costPerUnit: calculation.costPerUnit,
        suggestedUnitPrice: calculation.suggestedPerUnit,
        totalPrice: calculation.suggestedTotal,
      }

      const response = await adminRequest('/api/admin/catalog?action=quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          sourceRequestId,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          jobType: 'combined',
          quantity: calculation.quantity,
          validUntil: validUntil(),
          notes: notes.trim(),
          snapshot,
          directCost: calculation.directCost,
          lightCost: calculation.lightCost,
          wearCost: calculation.wearCost,
          realCost: calculation.realCost,
          profitPercent: calculation.profit,
          suggestedUnitPrice: calculation.suggestedPerUnit,
          totalPrice: calculation.suggestedTotal,
        }),
      })

      if (!response.ok) throw new Error(await responseMessage(response))

      const data = (await response.json()) as { quote: AdminQuote }

      if (printAfter && !openQuotePrintView(data.quote, previewWindow)) {
        setMessage('Guardado, pero el navegador bloqueó la vista de impresión.')
      }

      onSaved(data.quote)
    } catch (error) {
      if (previewWindow && !previewWindow.closed) previewWindow.close()
      setMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo guardar el presupuesto.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="admin-budget-overlay" role="presentation">
      <section
        className="admin-budget-modal admin-combined-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="combined-project-title"
      >
        <header className="admin-budget-header">
          <div>
            <span>Proyecto combinado · Paso {step} de 3</span>
            <h3 id="combined-project-title">🧩 Proyecto combinado</h3>
          </div>

          <button
            type="button"
            className="admin-budget-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <div className="admin-budget-progress" aria-hidden="true">
          <span className={step >= 1 ? 'is-active' : ''} />
          <span className={step >= 2 ? 'is-active' : ''} />
          <span className={step >= 3 ? 'is-active' : ''} />
        </div>

        <div className="admin-budget-body">
          {message && <div className="admin-toast">{message}</div>}

          {step === 1 && (
            <div className="admin-combined-step">
              <div className="admin-budget-copy">
                <span className="admin-cost-eyebrow">Proyecto</span>
                <h4>¿Qué vas a fabricar?</h4>
                <p>
                  Una cantidad final y todas las partes que necesite el trabajo.
                </p>
              </div>

              <div className="admin-combined-project-fields">
                <label className={title.trim().length < 2 ? 'is-next' : ''}>
                  Nombre del proyecto
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Ej. Photocard BTS + marco 3D"
                    autoFocus
                  />
                </label>

                <label
                  className={
                    title.trim().length >= 2 && number(quantity) < 1
                      ? 'is-next'
                      : ''
                  }
                >
                  Cantidad final
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    placeholder="Ej. 10"
                  />
                </label>
              </div>

              {templates.length > 0 && (
                <section className="admin-combined-templates">
                  <div>
                    <span className="admin-cost-eyebrow">Plantillas</span>
                    <strong>Arrancar desde una receta guardada</strong>
                  </div>

                  <div className="admin-combined-template-list">
                    {templates.map((template) => (
                      <article key={template.id}>
                        <button
                          type="button"
                          onClick={() => applyTemplate(template)}
                        >
                          <strong>⭐ {template.name}</strong>
                          <small>
                            {template.recipe.components.length} parte(s)
                          </small>
                        </button>
                        <button
                          type="button"
                          className="admin-text-button"
                          disabled={templateBusy}
                          onClick={() => void deleteTemplate(template)}
                        >
                          Borrar
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="admin-combined-step">
              <div className="admin-budget-copy">
                <span className="admin-cost-eyebrow">Partes del proyecto</span>
                <h4>Sumá todos los procesos</h4>
                <p>
                  Cada bloque aporta su costo. Trabajo, luz y desgaste se suman
                  una sola vez al final.
                </p>
              </div>

              <div className="admin-combined-add">
                <button type="button" onClick={() => addComponent('paper')}>
                  + 📄 Papel
                </button>
                <button type="button" onClick={() => addComponent('3d')}>
                  + 🧱 3D
                </button>
                <button type="button" onClick={() => addComponent('material')}>
                  + 🎨 Insumo / acabado
                </button>
              </div>

              {components.length === 0 ? (
                <div className="admin-combined-empty">
                  👉 Agregá la primera parte del proyecto.
                </div>
              ) : (
                <div className="admin-combined-parts">
                  {components.map((component, index) => (
                    <article className="admin-combined-part" key={component.id}>
                      <header>
                        <div>
                          <span>Parte {index + 1}</span>
                          <strong>
                            {component.kind === 'paper'
                              ? '📄 Impresión en papel'
                              : component.kind === '3d'
                                ? '🧱 Impresión 3D'
                                : '🎨 Insumo / acabado'}
                          </strong>
                        </div>
                        <button
                          type="button"
                          className="admin-danger"
                          onClick={() => removeComponent(component.id)}
                        >
                          Quitar
                        </button>
                      </header>

                      {component.kind === 'paper' && (
                        <div className="admin-combined-fields">
                          <label
                            className={fieldClass(
                              `${component.id}:paper`,
                              Boolean(component.paperResourceId),
                            )}
                          >
                            Papel
                            <select
                              value={component.paperResourceId}
                              onChange={(event) =>
                                updateComponent(component.id, {
                                  paperResourceId: event.target.value,
                                })
                              }
                            >
                              <option value="">Elegir papel…</option>
                              {paperResources.map((resource) => (
                                <option key={resource.id} value={resource.id}>
                                  {resource.name}
                                  {resource.detail ? ` · ${resource.detail}` : ''}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label
                            className={fieldClass(
                              `${component.id}:ink`,
                              Boolean(component.inkResourceId),
                            )}
                          >
                            Tinta
                            <select
                              value={component.inkResourceId}
                              onChange={(event) =>
                                updateComponent(component.id, {
                                  inkResourceId: event.target.value,
                                })
                              }
                            >
                              <option value="">Elegir tinta…</option>
                              {inkResources.map((resource) => (
                                <option key={resource.id} value={resource.id}>
                                  {resource.name}
                                  {resource.detail ? ` · ${resource.detail}` : ''}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label
                            className={fieldClass(
                              `${component.id}:sheets`,
                              number(component.sheetsPerUnit) > 0,
                            )}
                          >
                            Hojas por unidad final
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={component.sheetsPerUnit}
                              onChange={(event) =>
                                updateComponent(component.id, {
                                  sheetsPerUnit: event.target.value,
                                })
                              }
                              placeholder="Ej. 1"
                            />
                          </label>

                          <label>
                            Caras
                            <select
                              value={component.printSides}
                              onChange={(event) =>
                                updateComponent(component.id, {
                                  printSides: event.target.value as PrintSides,
                                })
                              }
                            >
                              <option value="single">Simple faz</option>
                              <option value="double">Doble faz</option>
                            </select>
                          </label>
                        </div>
                      )}

                      {component.kind === '3d' && (
                        <div className="admin-combined-fields">
                          <label
                            className={fieldClass(
                              `${component.id}:filament`,
                              Boolean(component.filamentResourceId),
                            )}
                          >
                            Filamento
                            <select
                              value={component.filamentResourceId}
                              onChange={(event) =>
                                updateComponent(component.id, {
                                  filamentResourceId: event.target.value,
                                })
                              }
                            >
                              <option value="">Elegir filamento…</option>
                              {filamentResources.map((resource) => (
                                <option key={resource.id} value={resource.id}>
                                  {resource.name}
                                  {resource.detail ? ` · ${resource.detail}` : ''}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label
                            className={fieldClass(
                              `${component.id}:pieces`,
                              number(component.piecesPerUnit) > 0,
                            )}
                          >
                            Piezas 3D por unidad final
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={component.piecesPerUnit}
                              onChange={(event) =>
                                updateComponent(component.id, {
                                  piecesPerUnit: event.target.value,
                                })
                              }
                            />
                          </label>

                          <label
                            className={fieldClass(
                              `${component.id}:grams`,
                              number(component.gramsPerPiece) > 0,
                            )}
                          >
                            Gramos por pieza 3D
                            <input
                              type="number"
                              min={0}
                              step="0.1"
                              value={component.gramsPerPiece}
                              onChange={(event) =>
                                updateComponent(component.id, {
                                  gramsPerPiece: event.target.value,
                                })
                              }
                              placeholder="Ej. 18"
                            />
                          </label>
                        </div>
                      )}

                      {component.kind === 'material' && (
                        <div className="admin-combined-fields">
                          <label
                            className={fieldClass(
                              `${component.id}:resource`,
                              Boolean(component.resourceId),
                            )}
                          >
                            Insumo
                            <select
                              value={component.resourceId}
                              onChange={(event) =>
                                updateComponent(component.id, {
                                  resourceId: event.target.value,
                                })
                              }
                            >
                              <option value="">Elegir insumo…</option>
                              {materialResources.map((resource) => (
                                <option key={resource.id} value={resource.id}>
                                  {resource.name}
                                  {resource.detail ? ` · ${resource.detail}` : ''}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label
                            className={fieldClass(
                              `${component.id}:usage`,
                              number(component.usagePerUnit) > 0,
                            )}
                          >
                            Uso por unidad final
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={component.usagePerUnit}
                              onChange={(event) =>
                                updateComponent(component.id, {
                                  usagePerUnit: event.target.value,
                                })
                              }
                              placeholder="Ej. 2"
                            />
                            <small>
                              {component.resourceId
                                ? `En ${
                                    unitLabels[
                                      resources.find(
                                        (resource) =>
                                          resource.id === component.resourceId,
                                      )?.unit ?? 'unit'
                                    ]
                                  }.`
                                : 'Elegí primero el insumo.'}
                            </small>
                          </label>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}

              <section className="admin-combined-labor">
                <header>
                  <strong>👤 Trabajo del proyecto</strong>
                  <small>Una sola persona y horas totales.</small>
                </header>

                <div className="admin-combined-fields">
                  <label
                    className={fieldClass(
                      'worker',
                      Boolean(workerResourceId),
                    )}
                  >
                    Persona
                    <select
                      value={workerResourceId}
                      onChange={(event) =>
                        setWorkerResourceId(event.target.value)
                      }
                    >
                      <option value="">Elegir persona…</option>
                      {workerResources.map((resource) => (
                        <option key={resource.id} value={resource.id}>
                          {resource.name} ·{' '}
                          {money(number(resource.effective_unit_cost))}/hora
                        </option>
                      ))}
                    </select>
                  </label>

                  <label
                    className={fieldClass(
                      'hours',
                      number(projectHours) > 0,
                    )}
                  >
                    Horas totales
                    <input
                      type="number"
                      min={0}
                      step="0.25"
                      value={projectHours}
                      onChange={(event) =>
                        setProjectHours(event.target.value)
                      }
                      placeholder="Ej. 3,5"
                    />
                  </label>
                </div>
              </section>

              <form
                className="admin-combined-template-save"
                onSubmit={(event) => void saveTemplate(event)}
              >
                <div>
                  <strong>⭐ Guardar como plantilla</strong>
                  <small>
                    Guarda la receta de partes para reutilizarla después.
                  </small>
                </div>
                <input
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="Ej. Photocard + marco 3D"
                />
                <button
                  className="admin-secondary"
                  type="submit"
                  disabled={templateBusy || components.length === 0}
                >
                  Guardar plantilla
                </button>
              </form>
            </div>
          )}

          {step === 3 && (
            <div className="admin-combined-step">
              <div className="admin-budget-copy">
                <span className="admin-cost-eyebrow">Resultado</span>
                <h4>✨ Costo del proyecto completo</h4>
                <p>
                  Todos los procesos juntos, con luz y desgaste aplicados una
                  sola vez.
                </p>
              </div>

              <div className="admin-budget-result-layout">
                <div className="admin-budget-breakdown">
                  {calculation.costs.map((cost) => (
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
                      <small>Partes + trabajo.</small>
                    </div>
                    <span>{money(calculation.directCost)}</span>
                  </div>

                  <div className="admin-budget-cost-row">
                    <div>
                      <strong>⚡ Luz · {LIGHT_PERCENT}%</strong>
                      <small>Una vez sobre el costo directo.</small>
                    </div>
                    <span>{money(calculation.lightCost)}</span>
                  </div>

                  <div className="admin-budget-cost-row">
                    <div>
                      <strong>🛠️ Desgaste · {WEAR_PERCENT}%</strong>
                      <small>Una vez sobre el costo directo.</small>
                    </div>
                    <span>{money(calculation.wearCost)}</span>
                  </div>
                </div>

                <aside className="admin-budget-price-panel">
                  <div className="admin-budget-price-controls">
                    <label>
                      Ganancia %
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={profitPercent}
                        onChange={(event) =>
                          setProfitPercent(event.target.value)
                        }
                      />
                    </label>

                    <label>
                      Redondear a
                      <select
                        value={roundingStep}
                        onChange={(event) =>
                          setRoundingStep(event.target.value)
                        }
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
                    <strong>{money(calculation.realCost)}</strong>
                    <small>{money(calculation.costPerUnit)} por unidad</small>
                  </div>

                  <div className="admin-budget-price-final">
                    <span>Precio sugerido</span>
                    <strong>{money(calculation.suggestedTotal)}</strong>
                    <small>
                      {money(calculation.suggestedPerUnit)} ×{' '}
                      {calculation.quantity}
                    </small>
                  </div>
                </aside>
              </div>

              <div className="admin-combined-customer">
                <label>
                  Cliente
                  <input
                    value={customerName}
                    onChange={(event) =>
                      setCustomerName(event.target.value)
                    }
                    placeholder="Opcional"
                  />
                </label>

                <label>
                  WhatsApp
                  <input
                    value={customerPhone}
                    onChange={(event) =>
                      setCustomerPhone(event.target.value)
                    }
                    placeholder="Opcional"
                  />
                </label>

                <label>
                  Vigencia
                  <select
                    value={validityDays}
                    onChange={(event) =>
                      setValidityDays(event.target.value)
                    }
                  >
                    <option value="3">3 días</option>
                    <option value="7">7 días</option>
                    <option value="15">15 días</option>
                    <option value="30">30 días</option>
                  </select>
                </label>

                <label className="admin-combined-notes">
                  Notas
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    placeholder="Detalles para el cliente…"
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        <footer className="admin-budget-footer">
          <div>
            {step > 1 && (
              <button
                className="admin-secondary"
                type="button"
                onClick={() => setStep((step - 1) as 1 | 2 | 3)}
              >
                ← Volver
              </button>
            )}
          </div>

          <div className="admin-budget-footer-main">
            <button
              className="admin-secondary"
              type="button"
              onClick={onClose}
            >
              Cerrar
            </button>

            {step === 1 && (
              <button
                className="admin-primary"
                type="button"
                disabled={title.trim().length < 2 || number(quantity) < 1}
                onClick={() => setStep(2)}
              >
                Armar partes →
              </button>
            )}

            {step === 2 && (
              <button
                className="admin-primary"
                type="button"
                disabled={!stepTwoReady}
                onClick={() => setStep(3)}
              >
                Ver resultado →
              </button>
            )}

            {step === 3 && (
              <>
                <button
                  className="admin-secondary"
                  type="button"
                  disabled={saving}
                  onClick={() => void saveQuote(true)}
                >
                  Guardar + PDF
                </button>
                <button
                  className="admin-primary"
                  type="button"
                  disabled={saving}
                  onClick={() => void saveQuote(false)}
                >
                  {saving ? 'Guardando…' : 'Guardar presupuesto'}
                </button>
              </>
            )}
          </div>
        </footer>
      </section>
    </div>
  )
}
