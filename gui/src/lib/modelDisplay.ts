export function compactModelLabel(configName: string | null | undefined, modelId?: string | null): string {
  const name = configName?.trim() ?? ''
  if (!name) return ''

  const model = modelId?.trim()
  if (model && name.length > 28) return model

  const runtimeOpenAi = name.match(/^runtime-openai-codex-(.+)$/)
  if (runtimeOpenAi) return normalizeRuntimeModel(runtimeOpenAi[1]!)

  return name
}

function normalizeRuntimeModel(value: string): string {
  const gpt = value.match(/^gpt-(\d+)-(\d+)(.*)$/)
  if (gpt) return `gpt-${gpt[1]}.${gpt[2]}${gpt[3] ?? ''}`
  return value
}
