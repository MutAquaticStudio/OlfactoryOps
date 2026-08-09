import { PlatformError } from '../../platform/src/service.js'

export function assertProductionUsageCorrectionAllowed(input: { orderStatus: string; hasCompletedProcessStage: boolean }) {
  if (input.hasCompletedProcessStage) {
    throw new PlatformError('PRODUCTION_USAGE_REVERSAL_TOO_LATE', 'Raw-material correction is unavailable after a production process stage completes. Record controlled rework instead.', 409)
  }
  if (!['WEIGHING', 'COMPOUNDING', 'HOLD'].includes(input.orderStatus)) {
    throw new PlatformError('PRODUCTION_USAGE_REVERSAL_STATE_INVALID', 'Raw-material correction is available only before downstream production processing.', 409)
  }
}
