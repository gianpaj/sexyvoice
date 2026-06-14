import {
  DB_MODEL_TO_EXTERNAL_ID,
  EXTERNAL_API_MODELS,
  type ExternalApiModelId,
} from '@/lib/api/constants';

export function resolveExternalModelId(
  model: string,
): ExternalApiModelId | undefined {
  const mapped = DB_MODEL_TO_EXTERNAL_ID[model];
  if (mapped && Object.hasOwn(EXTERNAL_API_MODELS, mapped)) {
    return mapped as ExternalApiModelId;
  }
  return undefined;
}

export function getDefaultFormat(model: ExternalApiModelId): 'wav' | 'mp3' {
  return model === 'gpro' ? 'wav' : 'mp3';
}

export function isFormatSupported(
  model: ExternalApiModelId,
  format: string,
): boolean {
  return (
    EXTERNAL_API_MODELS[model].supportedFormats as readonly string[]
  ).includes(format);
}

export function getModelCatalogResponse() {
  return Object.values(EXTERNAL_API_MODELS).map((model) => ({
    id: model.id,
    name: model.name,
    max_input_length: model.maxInputLength,
    supported_formats: [...model.supportedFormats],
  }));
}
