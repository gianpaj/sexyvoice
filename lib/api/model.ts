import {
  EXTERNAL_API_MODELS,
  type ExternalApiModelId,
} from '@/lib/api/constants';

export function resolveExternalModelId(model: string) {
  if (Object.hasOwn(EXTERNAL_API_MODELS, model)) {
    return model as ExternalApiModelId;
  }
}

export function getDefaultFormat(model: ExternalApiModelId): 'wav' | 'mp3' {
  return model === 'gpro' ? 'wav' : 'mp3';
}

export function getModelCatalogResponse() {
  return Object.values(EXTERNAL_API_MODELS).map((model) => ({
    id: model.id,
    name: model.name,
    max_input_length: model.maxInputLength,
    supported_formats: [...model.supportedFormats],
    supported_styles: [...model.supportedStyles],
  }));
}
