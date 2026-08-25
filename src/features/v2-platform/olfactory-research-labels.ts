export function trainingModeLabel(trainingMode: string) {
  if (['FINE_TUNE_FROZEN_PRETRAINED_ENCODER', 'TRANSFER_LEARNING_FROZEN_PRETRAINED_ENCODER'].includes(trainingMode)) {
    return 'Transfer learning — frozen pretrained encoder'
  }
  return trainingMode.replaceAll('_', ' ')
}
