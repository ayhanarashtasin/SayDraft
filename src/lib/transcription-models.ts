export const PARAKEET_MODELS = ["parakeet-tdt-0.6b-v2", "parakeet-ctc-1.1b-asr"] as const;

export type ParakeetModel = (typeof PARAKEET_MODELS)[number];

export function isParakeetModel(model: string): model is ParakeetModel {
  return PARAKEET_MODELS.some((name) => name === model);
}
