import React, { useState, useEffect } from "react";
import { rpcRequest } from "../vscode-api.js";
import type { ProviderPresetInfo, ModelPickerNode } from "../../src/types.js";

type WizardStep = "providers" | "api-key" | "model" | "thinking" | "search" | "done";

interface SearchOption {
  env: string;
  name: string;
  url: string;
  free: string;
  configured: boolean;
}

export function InitWizard() {
  const [step, setStep] = useState<WizardStep>("providers");
  const [providers, setProviders] = useState<ProviderPresetInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ProviderPresetInfo | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [modelTree, setModelTree] = useState<ModelPickerNode[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [modelSelection, setModelSelection] = useState<any>(null);
  const [thinkingLevels, setThinkingLevels] = useState<string[]>([]);
  const [selectedThinking, setSelectedThinking] = useState<string>("none");
  const [searchOptions, setSearchOptions] = useState<SearchOption[]>([]);
  const [selectedSearch, setSelectedSearch] = useState<string | null>(null);
  const [searchKey, setSearchKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rpcRequest<ProviderPresetInfo[]>("init.listProviders").then(setProviders);
  }, []);

  const handleProviderSelect = (provider: ProviderPresetInfo) => {
    setSelectedProvider(provider);
    setApiKey("");
    setError(null);

    if (provider.configured) {
      loadModelTree();
      return;
    }

    if (provider.isOAuth) {
      setSaving(true);
      rpcRequest("init.startOAuthFlow", { providerId: provider.id })
        .then(() => {
          setProviders((prev) =>
            prev.map((p) => (p.id === provider.id ? { ...p, configured: true } : p)),
          );
          loadModelTree();
        })
        .catch((err) => setError(err.message))
        .finally(() => setSaving(false));
      return;
    }

    setStep("api-key");
  };

  const handleSaveApiKey = async () => {
    if (!selectedProvider || !apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const method = selectedProvider.isManaged
        ? "init.configureManagedProvider"
        : "init.configureApiKeyProvider";
      await rpcRequest(method, { providerId: selectedProvider.id, apiKey: apiKey.trim() });
      setProviders((prev) =>
        prev.map((p) => (p.id === selectedProvider.id ? { ...p, configured: true } : p)),
      );
      loadModelTree();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const loadModelTree = async () => {
    try {
      const tree = await rpcRequest<ModelPickerNode[]>("init.buildModelPickerTree");
      setModelTree(tree);
      setStep("model");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleModelSelect = async (nodeId: string, value?: string) => {
    if (value) {
      try {
        const selection = await rpcRequest("init.resolveModelSelection", { target: value });
        setModelSelection(selection);
        setSelectedModel(value);

        const levels = await rpcRequest<{ all: string[]; tierEligible: string[] }>(
          "init.getThinkingLevels",
          { modelId: (selection as any).modelId },
        );
        if (levels.all.length > 0) {
          setThinkingLevels(levels.all);
          setStep("thinking");
        } else {
          setSelectedThinking("none");
          loadSearchOptions();
        }
      } catch (err: any) {
        setError(err.message);
      }
    }
  };

  const handleThinkingSelect = (level: string) => {
    setSelectedThinking(level);
    loadSearchOptions();
  };

  const loadSearchOptions = async () => {
    try {
      const options = await rpcRequest<SearchOption[]>("init.getSearchApiOptions");
      setSearchOptions(options);
      setStep("search");
    } catch {
      handleFinish();
    }
  };

  const handleSearchSave = async () => {
    if (selectedSearch && searchKey.trim()) {
      await rpcRequest("init.saveSearchApiKey", { envVar: selectedSearch, apiKey: searchKey.trim() });
    }
    handleFinish();
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      await rpcRequest("init.finish", {
        modelSelection,
        thinkingLevel: selectedThinking,
      });
      setStep("done");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (step === "done") {
    return (
      <div className="welcome">
        <h2>Setup Complete</h2>
        <p>Fermi is starting...</p>
      </div>
    );
  }

  return (
    <div className="init-wizard">
      <h3>Welcome to Fermi</h3>

      {error && <div className="error-block">{error}</div>}

      {step === "providers" && (
        <div className="init-step">
          <p style={{ marginBottom: 12, opacity: 0.7 }}>
            Select a provider to get started:
          </p>
          <div className="provider-list">
            {providers
              .filter((p) => !p.isLocal)
              .map((p) => (
                <div
                  key={p.id}
                  className={`provider-item ${p.configured ? "configured" : ""}`}
                  onClick={() => handleProviderSelect(p)}
                >
                  <div>
                    <div className="provider-name">{p.name}</div>
                    <div className="provider-status">
                      {p.configured ? "✓ Configured" : p.isOAuth ? "Login required" : `${p.envVar}`}
                    </div>
                  </div>
                  <span style={{ opacity: 0.4 }}>→</span>
                </div>
              ))}
          </div>
          {providers.some((p) => p.configured) && (
            <button className="init-btn" onClick={loadModelTree} style={{ marginTop: 12 }}>
              Continue with configured providers →
            </button>
          )}
        </div>
      )}

      {step === "api-key" && selectedProvider && (
        <div className="init-step">
          <p style={{ marginBottom: 8 }}>
            <strong>{selectedProvider.name}</strong>
          </p>
          <p style={{ marginBottom: 8, opacity: 0.7 }}>
            Paste your API key ({selectedProvider.envVar}):
          </p>
          <input
            className="init-input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveApiKey()}
            placeholder="sk-..."
            autoFocus
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="init-btn" onClick={handleSaveApiKey} disabled={!apiKey.trim() || saving}>
              {saving ? "Saving..." : "Save & Continue"}
            </button>
            <button className="init-btn init-btn-secondary" onClick={() => setStep("providers")}>
              ← Back
            </button>
          </div>
        </div>
      )}

      {step === "model" && (
        <div className="init-step">
          <p style={{ marginBottom: 8, opacity: 0.7 }}>Select a model:</p>
          <ModelTree nodes={modelTree} onSelect={handleModelSelect} />
          <button
            className="init-btn init-btn-secondary"
            onClick={() => setStep("providers")}
            style={{ marginTop: 8 }}
          >
            ← Back
          </button>
        </div>
      )}

      {step === "thinking" && (
        <div className="init-step">
          <p style={{ marginBottom: 8, opacity: 0.7 }}>Thinking level:</p>
          <div className="provider-list">
            {[...(thinkingLevels.includes("off") ? [] : ["off"]), ...thinkingLevels].map((level) => (
              <div
                key={level}
                className="provider-item"
                onClick={() => handleThinkingSelect(level)}
              >
                <span className="provider-name">{level}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === "search" && (
        <div className="init-step">
          <p style={{ marginBottom: 8, opacity: 0.7 }}>
            Web search API key (recommended for better results):
          </p>
          <div className="provider-list">
            {searchOptions.map((opt) => (
              <div
                key={opt.env}
                className={`provider-item ${opt.configured ? "configured" : ""} ${selectedSearch === opt.env ? "configured" : ""}`}
                onClick={() => setSelectedSearch(opt.env)}
              >
                <div>
                  <div className="provider-name">{opt.name}</div>
                  <div className="provider-status">
                    {opt.configured ? "✓ Configured" : `${opt.free} free → ${opt.url}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {selectedSearch && !searchOptions.find((o) => o.env === selectedSearch)?.configured && (
            <input
              className="init-input"
              type="password"
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
              placeholder="Paste API key..."
              autoFocus
            />
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="init-btn" onClick={handleSearchSave} disabled={saving}>
              {selectedSearch && searchKey.trim() ? "Save & Finish" : "Skip & Finish"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ModelTree({
  nodes,
  onSelect,
  depth = 0,
}: {
  nodes: ModelPickerNode[];
  onSelect: (id: string, value?: string) => void;
  depth?: number;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  return (
    <div className="model-picker-tree" style={{ paddingLeft: depth * 12 }}>
      {nodes.map((node) => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedIds.has(node.id);

        return (
          <React.Fragment key={node.id}>
            <div
              className="model-picker-node"
              onClick={() => {
                if (hasChildren) {
                  setExpandedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(node.id)) next.delete(node.id);
                    else next.add(node.id);
                    return next;
                  });
                } else {
                  onSelect(node.id, node.value);
                }
              }}
            >
              {hasChildren ? (isExpanded ? "▾ " : "▸ ") : "  "}
              {node.label}
            </div>
            {hasChildren && isExpanded && (
              <ModelTree nodes={node.children!} onSelect={onSelect} depth={depth + 1} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
