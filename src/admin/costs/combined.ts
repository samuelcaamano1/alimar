import { LIGHT_PERCENT, WEAR_PERCENT, unitLabels } from './config'
import type { CostResource, CostUnit, GuidedCost, PrintSides } from './types'
import { convertUsage, number, roundUp } from './utils'

export type CombinedPaperComponent = {
  id: string
  kind: 'paper'
  paperResourceId: string
  inkResourceId: string
  sheetsPerUnit: string
  printSides: PrintSides
}

export type Combined3dComponent = {
  id: string
  kind: '3d'
  filamentResourceId: string
  piecesPerUnit: string
  gramsPerPiece: string
}

export type CombinedMaterialComponent = {
  id: string
  kind: 'material'
  resourceId: string
  usagePerUnit: string
}

export type CombinedComponent =
  | CombinedPaperComponent
  | Combined3dComponent
  | CombinedMaterialComponent

export type CombinedRecipe = {
  version: 1
  components: CombinedComponent[]
}

export type CombinedTemplate = {
  id: string
  name: string
  recipe: CombinedRecipe
  created_at: string
  updated_at: string
}

export type CombinedCalculationInput = {
  resources: CostResource[]
  quantity: string
  profitPercent: string
  roundingStep: string
  components: CombinedComponent[]
  workerResourceId: string
  projectHours: string
}

function resourceById(resources: CostResource[], id: string) {
  return resources.find((item) => item.id === id) ?? null
}

export function newCombinedComponent(
  kind: CombinedComponent['kind'],
): CombinedComponent {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  if (kind === 'paper') {
    return {
      id,
      kind,
      paperResourceId: '',
      inkResourceId: '',
      sheetsPerUnit: '',
      printSides: 'single',
    }
  }

  if (kind === '3d') {
    return {
      id,
      kind,
      filamentResourceId: '',
      piecesPerUnit: '1',
      gramsPerPiece: '',
    }
  }

  return {
    id,
    kind,
    resourceId: '',
    usagePerUnit: '',
  }
}

export function combinedComponentReady(component: CombinedComponent) {
  if (component.kind === 'paper') {
    return Boolean(
      component.paperResourceId &&
        component.inkResourceId &&
        number(component.sheetsPerUnit) > 0,
    )
  }

  if (component.kind === '3d') {
    return Boolean(
      component.filamentResourceId &&
        number(component.piecesPerUnit) > 0 &&
        number(component.gramsPerPiece) > 0,
    )
  }

  return Boolean(component.resourceId && number(component.usagePerUnit) > 0)
}

export function calculateCombinedCost(args: CombinedCalculationInput) {
  const finalQuantity = Math.max(1, Math.floor(number(args.quantity) || 1))
  const profit = Math.max(0, number(args.profitPercent))
  const rounding = Math.max(1, number(args.roundingStep) || 1)
  const costs: GuidedCost[] = []

  function addCost(input: {
    key: string
    label: string
    resourceId: string
    amount: number
    inputUnit: CostUnit
    detail: string
  }) {
    const selected = resourceById(args.resources, input.resourceId)
    if (!selected || !Number.isFinite(input.amount) || input.amount <= 0) return

    const usage = convertUsage(input.amount, input.inputUnit, selected.unit)
    const total = number(selected.effective_unit_cost) * usage
    if (!Number.isFinite(total) || total <= 0) return

    costs.push({
      key: input.key,
      label: `${input.label} · ${selected.name}`,
      detail: input.detail,
      total,
    })
  }

  args.components.forEach((component, index) => {
    const part = index + 1

    if (component.kind === 'paper') {
      const sheetsPerUnit = Math.max(0, number(component.sheetsPerUnit))
      const totalSheets = sheetsPerUnit * finalQuantity
      const impressionsPerSheet = component.printSides === 'double' ? 2 : 1
      const totalPrints = totalSheets * impressionsPerSheet

      addCost({
        key: `${component.id}-paper`,
        label: `Parte ${part} · Papel`,
        resourceId: component.paperResourceId,
        amount: totalSheets,
        inputUnit: 'sheet',
        detail: `${sheetsPerUnit} hoja(s) × ${finalQuantity} unidad(es) = ${totalSheets} hoja(s)`,
      })

      addCost({
        key: `${component.id}-ink`,
        label: `Parte ${part} · Tinta`,
        resourceId: component.inkResourceId,
        amount: totalPrints,
        inputUnit: 'print',
        detail:
          component.printSides === 'double'
            ? `${totalSheets} hoja(s) × 2 caras = ${totalPrints} impresiones`
            : `${totalSheets} hoja(s) = ${totalPrints} impresiones`,
      })
      return
    }

    if (component.kind === '3d') {
      const piecesPerUnit = Math.max(0, number(component.piecesPerUnit))
      const gramsPerPiece = Math.max(0, number(component.gramsPerPiece))
      const totalPieces = piecesPerUnit * finalQuantity
      const totalGrams = totalPieces * gramsPerPiece

      addCost({
        key: `${component.id}-filament`,
        label: `Parte ${part} · Filamento`,
        resourceId: component.filamentResourceId,
        amount: totalGrams,
        inputUnit: 'g',
        detail: `${gramsPerPiece} g × ${totalPieces} pieza(s) = ${totalGrams} g`,
      })
      return
    }

    const selected = resourceById(args.resources, component.resourceId)
    if (!selected) return

    const usagePerUnit = Math.max(0, number(component.usagePerUnit))
    const totalUsage = usagePerUnit * finalQuantity

    addCost({
      key: `${component.id}-material`,
      label: `Parte ${part} · Insumo`,
      resourceId: selected.id,
      amount: totalUsage,
      inputUnit: selected.unit,
      detail: `${usagePerUnit} ${unitLabels[selected.unit]} × ${finalQuantity} unidad(es)`,
    })
  })

  const hours = Math.max(0, number(args.projectHours))
  if (args.workerResourceId && hours > 0) {
    addCost({
      key: 'combined-labor',
      label: 'Trabajo del proyecto',
      resourceId: args.workerResourceId,
      amount: hours,
      inputUnit: 'hour',
      detail: `${hours} hora(s) totales del proyecto`,
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
}
