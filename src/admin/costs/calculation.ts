import { LIGHT_PERCENT, WEAR_PERCENT, unitLabels } from './config'
import type {
  CostResource,
  CostUnit,
  GuidedCost,
  GuidedJobType,
  PrintSides,
} from './types'
import { convertUsage, number, roundUp } from './utils'

type GuidedCalculationInput = {
  resources: CostResource[]
  jobType: GuidedJobType
  quantity: string
  profitPercent: string
  roundingStep: string
  paperResourceId: string
  inkResourceId: string
  printSides: PrintSides
  filamentResourceId: string
  gramsPerPiece: string
  paintEnabled: boolean
  paintResourceId: string
  paintMlPerPiece: string
  manualResourceId: string
  manualUsagePerUnit: string
  manualExtraEnabled: boolean
  manualExtraResourceId: string
  manualExtraUsagePerUnit: string
  workerResourceId: string
  projectHours: string
}

export function calculateGuidedCost(args: GuidedCalculationInput) {
  const finalQuantity = Math.max(1, Math.floor(number(args.quantity) || 1))
  const profit = Math.max(0, number(args.profitPercent))
  const rounding = Math.max(1, number(args.roundingStep) || 1)
  const costs: GuidedCost[] = []

  function resource(resourceId: string) {
    return args.resources.find((item) => item.id === resourceId) ?? null
  }

  function addCost(input: {
    key: string
    label: string
    resourceId: string
    amount: number
    inputUnit: CostUnit
    multiplier?: number
    detail: string
  }) {
    const selected = resource(input.resourceId)
    if (
      !selected ||
      !Number.isFinite(input.amount) ||
      input.amount <= 0
    ) {
      return
    }

    const usage = convertUsage(
      input.amount,
      input.inputUnit,
      selected.unit,
    )
    const total =
      number(selected.effective_unit_cost) *
      usage *
      Math.max(1, input.multiplier ?? 1)

    if (!Number.isFinite(total) || total <= 0) return

    costs.push({
      key: input.key,
      label: `${input.label} · ${selected.name}`,
      detail: input.detail,
      total,
    })
  }

  if (args.jobType === 'paper-print') {
    const impressionsPerSheet = args.printSides === 'double' ? 2 : 1

    addCost({
      key: 'paper',
      label: 'Papel',
      resourceId: args.paperResourceId,
      amount: finalQuantity,
      inputUnit: 'sheet',
      detail: `${finalQuantity} hoja(s)`,
    })

    addCost({
      key: 'ink',
      label: 'Tinta',
      resourceId: args.inkResourceId,
      amount: finalQuantity * impressionsPerSheet,
      inputUnit: 'print',
      detail:
        args.printSides === 'double'
          ? `${finalQuantity} hoja(s) × 2 caras = ${finalQuantity * 2} impresiones`
          : `${finalQuantity} hoja(s) = ${finalQuantity} impresiones`,
    })
  }

  if (args.jobType === '3d-print') {
    const grams = Math.max(0, number(args.gramsPerPiece))

    addCost({
      key: 'filament',
      label: 'Filamento',
      resourceId: args.filamentResourceId,
      amount: grams,
      inputUnit: 'g',
      multiplier: finalQuantity,
      detail: `${grams || 0} g × ${finalQuantity} pieza(s)`,
    })

    if (args.paintEnabled) {
      const paintMl = Math.max(0, number(args.paintMlPerPiece))

      addCost({
        key: 'paint',
        label: 'Pintura / acrílico',
        resourceId: args.paintResourceId,
        amount: paintMl,
        inputUnit: 'ml',
        multiplier: finalQuantity,
        detail: `${paintMl || 0} ml × ${finalQuantity} pieza(s)`,
      })
    }
  }

  if (args.jobType === 'manual') {
    const mainResource = resource(args.manualResourceId)
    const mainUsage = Math.max(0, number(args.manualUsagePerUnit))

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

    if (args.manualExtraEnabled) {
      const extraResource = resource(args.manualExtraResourceId)
      const extraUsage = Math.max(
        0,
        number(args.manualExtraUsagePerUnit),
      )

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

  const hours = Math.max(0, number(args.projectHours))
  if (args.workerResourceId && hours > 0) {
    addCost({
      key: 'labor',
      label: 'Trabajo',
      resourceId: args.workerResourceId,
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
}
