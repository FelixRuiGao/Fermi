# Provider/model audit — 2026-10-09

Scope: every one of Fermi's 22 registered provider endpoints, their existing
models, current text/tool-capable replacements, regional/plan differences,
retirements, reasoning, sampling, caching, and transport compatibility. Sources
below are first-party documentation or first-party model catalogs. Specs for
historical IDs remain available for restored/manual configurations; retirement
is evaluated separately for each provider.

New models needing the adapters in this change use `minAppVersion: 0.4.2` for
remote delivery. Factory registries load them immediately. `registryRevision`
20261009 keeps older signed caches from overriding this bundled catalog; model
and provider revisions must match. Do not distribute a
signed remote registry to older binaries without these gates.

## Publication and refresh

Catalog updates must be signed with `scripts/sign-registry.ts` and pushed with
their `.sig` files. Builds and tests verify these signatures against the embedded
public key. TUI and GUI/VS Code server startup check immediately, even with a
fresh cache, then poll every three minutes. Verified newer revisions are applied
to the live catalog automatically. Existing requests finish with their original
config; subsequent requests refresh provider settings without changing the
selected model. Duplicate revisions do not rebuild clients. Publication must
increase the shared registryRevision; same/older revisions cannot replace the
bundled or current generation. minAppVersion continues to gate adapter compatibility.

## OpenAI API and ChatGPT Login

- [Model catalog](https://developers.openai.com/api/docs/models)
- [All models](https://developers.openai.com/api/docs/models/all)
- [GPT-6 migration and compatibility](https://developers.openai.com/api/docs/guides/latest-model)
- [Astra migration quickstart](https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra.md#migration-quickstart)
- [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
- [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)
- [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol)
- [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [GPT-5 Mini](https://developers.openai.com/api/docs/models/gpt-5-mini)
- [Deprecations](https://developers.openai.com/api/docs/deprecations)
- [Codex model availability and retirements](https://learn.chatgpt.com/docs/models)
- [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)

Added the seven GPT-5.6/6/6.1 general coding models. Astra and 6.1 Sol expose
low–max, without none/minimal. Tool calling uses Responses. New models use
`prompt_cache_options.ttl`, not legacy retention. Sampling and logprob fields
are removed during reasoning; cache_write_tokens is recorded separately from reads. Pro mode is an API option, not a new direct-API
model slug. Ultra is a Codex orchestration mode, not a native reasoning effort.
ChatGPT Login presets follow its current rollout and exclude retired 5.4/mini.
Its 272k configured context follows the signed-in Codex catalog observed on the
audit date; it is deliberately distinct from the API's 1.05M specification.

## Anthropic

- [Current models](https://platform.claude.com/docs/en/models/overview)
- [Thinking configuration matrix](https://platform.claude.com/docs/en/build-with-claude/thinking)
- [Effort levels](https://platform.claude.com/docs/en/build-with-claude/effort)
- [Thinking errors](https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting)
- [Opus 5.5 migration](https://platform.claude.com/docs/en/models/opus-5-5/migration-guide)
- [Retirements](https://platform.claude.com/docs/en/about-claude/model-deprecations)

Added Fable 5/5.1, Opus 5/5.5, Sonnet 5/5.5, Haiku 5.5, and the canonical
direct-API spelling for Opus 4.8. Opus 5.5/Fable cannot disable thinking;
Sonnet 5.5 cannot disable all thinking (its separate between-tools setting is
not presented as “off”). Haiku 5.5 can disable it at low–high effort. Adaptive
models must not receive manual budgets. Opus/Sonnet 4.6 have GA 1M context;
legacy 1M selectors remain compatible without a beta header.

## GitHub Copilot

- [Supported models, plans, and retirement history](https://docs.github.com/en/copilot/reference/ai-models/supported-models)
- Authenticated, read-only `GET /models` on the Copilot gateway: fetched during
  this audit. Only model IDs, capabilities, endpoint names, and public limits
  were used; credentials are not included in the repository.

Provider overrides follow gateway limits, rather than assuming native limits.
Gemini 3.7/3.8 Flash and Kimi K3 advertise only `/chat/completions`; GPT and
MAI-Code-1.1 Flash advertise `/responses`; Claude advertises `/v1/messages`.
Removed the retired Opus 4.7 preset. Sonnet 4.6 remains with its annual-plan
restriction. Visibility still follows the current account's catalog/policy.
Grok models appear in GitHub's product documentation but were absent from the
gateway catalog returned to this integrator; no guessed gateway IDs or limits
are added. This is a catalog-availability gap, not a claim they are unavailable
in GitHub's own clients.

## Qwen — China, Singapore, US

- [Model recommendations and legacy lineup](https://www.alibabacloud.com/help/en/model-studio/text-generation-model)
- [Responses API migration](https://www.alibabacloud.com/help/en/model-studio/compatibility-with-openai-responses-api)
- [Responses request reference](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-responses)
- [Thinking models](https://www.alibabacloud.com/help/en/model-studio/deep-thinking)
- [Web search by region/protocol](https://www.alibabacloud.com/help/en/model-studio/web-search)
- [Qwen3.8 Max](https://www.alibabacloud.com/help/en/model-studio/qwen3-8-max)
- [Qwen3.8 Flash](https://www.alibabacloud.com/help/en/model-studio/qwen3-8-flash)
- [Qwen3.8 27B](https://www.alibabacloud.com/help/en/model-studio/qwen3-8-27b)
- [Qwen3.8 2.4T A95B](https://www.alibabacloud.com/help/en/model-studio/qwen3-8-2-4t-a95b)
- [Qwen3.8 Omni Flash](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/qwen3-8-omni-flash)
- [Qwen3.7 Plus](https://www.alibabacloud.com/help/en/model-studio/qwen3-7-plus)
- [Qwen3.7 Max](https://www.alibabacloud.com/help/en/model-studio/qwen3-7-max)

Added 3.8 Max/snapshot/Flash/Omni and open models where region availability is
documented; retained 3.7 Plus/Flash and older compatible models. Use the new
`/compatible-mode/v1` path. Workspace-specific domains require the user's ID,
so shared documented domains remain defaults. 3.8 exposes none/low/medium/xhigh;
the 2.4T open model is thinking-only. Responses reserves about 20% of context
and may silently truncate excess input: presets use an 800k effective budget
while native model specs retain 1M. Max output is now sent explicitly.

## Kimi — global, China, Coding

- [Global models and retirement dates](https://platform.kimi.ai/docs/models)
- [China models and retirement dates](https://platform.kimi.com/docs/models)
- [K3 quickstart](https://platform.kimi.ai/docs/guide/kimi-k3-quickstart)
- [Parameter differences](https://platform.kimi.ai/docs/api/models-overview)
- [Messages API and cache writes](https://platform.kimi.ai/docs/api/messages)
- [Web search migration](https://platform.kimi.ai/docs/guide/use-web-search)
- [Coding model IDs, effort, limits, and plans](https://www.kimi.com/code/docs/kimi-code/models.html)

Added K3 and K2.7 Highspeed to the public API; removed discontinued K2.5/K2.
Coding has its own four IDs: k3, k3-256k, kimi-for-coding (K2.8 Preview), and
kimi-for-coding-highspeed. K3 public API is effort-only and always reasons;
Coding can turn thinking off by routing to K2.8. Do not conflate these specs.
K3 requires top-level cache control to write the cache. Current sampling is
fixed. The expiring legacy search channel is not enabled for the new presets;
Fermi's client search tool remains available. Unpublished Coding output ceilings
are left unspecified rather than inferred from the context length.

## GLM — China/international, API/Coding

- [China model overview](https://docs.bigmodel.cn/cn/guide/start/model-overview)
- [China GLM-5.3](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3)
- [China Flash/FlashX](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash)
- [International GLM-5.3](https://docs.z.ai/guides/llm/glm-5.3)
- [International Flash/FlashX](https://docs.z.ai/guides/vlm/glm-5.3-flash)
- [Migration](https://docs.z.ai/guides/overview/migrate-to-glm-new)
- [Coding availability](https://docs.z.ai/devpack/latest-model)
- [Thinking](https://docs.z.ai/guides/capabilities/thinking-mode)
- [API availability/pricing](https://docs.z.ai/guides/overview/pricing)

Added 5.3 and 5.3 Flash to all four entries; FlashX is API-only, not Coding.
Added 5.2 to API presets as well. 5.3 always thinks with low/high/max; preserve
reasoning and send the selected effort. Tool streaming uses `tool_stream`.
Native specs retain documented 1M/128K; OpenRouter may expose different limits.

## MiniMax — global and China

- [Model catalog](https://platform.minimax.io/docs/guides/models-intro)
- [Anthropic compatibility and thinking](https://platform.minimax.io/docs/api-reference/text-anthropic-api)
- [Messages schema and token limits](https://platform.minimax.io/docs/api-reference/text-chat-anthropic)
- [Server web search](https://platform.minimax.io/docs/guides/server-tools)

Added M3.1 Flash Preview, marked M Plan-only. It always thinks with low–max;
M3 uses adaptive/disabled, not enabled. Corrected sampling to [0,2], M3/3.1
output ceiling to 524288, and M2.x ceiling to 204800. Enabled the documented
Messages server-search format for M3/3.1.

## DeepSeek

- [Current model metadata](https://api-docs.deepseek.com/api/list-models/)
- [Current pricing/model details](https://api-docs.deepseek.com/quick_start/pricing)
- [Anthropic compatibility](https://api-docs.deepseek.com/guides/anthropic_api)
- [V4.1 Flash release and temporary redirects](https://api-docs.deepseek.com/news/news260910/)
- [Responses reference](https://api-docs.deepseek.com/api/create-response/)

Use deepseek-flash for the current vision-capable V4.1 Flash. V4 Flash is a
compatibility alias. The September announcement describes a temporary Pro
redirect; today's authenticated `/models` confirms a separate text-only Pro,
so its current availability takes precedence over that announcement. Low/high/max effort and exact
1048576/393216 token values follow the metadata reference.

## MiMo

- [Current models/retirements](https://mimo.mi.com/docs/en-US/quick-start/model)
- [Messages API](https://mimo.mi.com/docs/en-US/api/chat/anthropic-api)
- [Thinking and replay](https://mimo.mi.com/docs/en-US/quick-start/usage-guide/other/deep-thinking)
- [V2.6 Flash](https://mimo.mi.com/models/en-US/mimo-v2.6-flash)

Added V2.6 Pro/Flash/UltraSpeed; the latter requires access. V2.5 presets carry
the October 21 retirement date. Retain binary thinking and plain replay.
Search in other interfaces is not assumed to work through Messages.

## OpenRouter and local inference

- [Live full model catalog](https://openrouter.ai/api/v1/models)
- [Reasoning efforts and per-model discovery](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
- [GPT-6 gateway compatibility](https://openrouter.ai/openai/gpt-6-astra/providers)
- [Ollama API compatibility](https://docs.ollama.com/api/openai-compatibility)
- [oMLX API compatibility](https://github.com/jundot/omlx#api-compatibility)
- [LM Studio API compatibility](https://lmstudio.ai/docs/developer/openai-compat)
- [LM Studio tools](https://lmstudio.ai/docs/developer/openai-compat/tools)

OpenRouter presets are intersected with its live catalog: do not invent the
native-provider slug. Added current models across all eight existing vendor
buckets, including distinct Prime/snapshot entries. max effort is preserved. Verified OpenRouter Pro slugs are gateway-only choices,
not new direct-API IDs. Chat vendor extensions are serialized at the top level
through the Node SDK.
Ollama/oMLX/LM Studio retain Chat Completions and /models discovery: their
installed model lists are local state, not a global static release catalog.
