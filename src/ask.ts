// Ask wire types live in src/protocol (single source for all remote
// clients); re-exported here so runtime consumers keep their import path.
export type {
  AskKind,
  AskSource,
  AgentQuestionOptionKind,
  AgentQuestionOption,
  AgentQuestionItem,
  AgentQuestionAnswer,
  AgentQuestionDecision,
  PendingAskUi,
} from "./protocol/index.js";
import type {
  AskKind,
  AskSource,
  AgentQuestionOption,
  AgentQuestionItem,
  PendingAskUi,
} from "./protocol/index.js";

export interface AskBase {
  id: string;
  kind: AskKind;
  createdAt: string;
  source: AskSource;
  summary: string;
  roundIndex?: number;
  /**
   * Turn the gated tool_call belongs to, captured at suspension time.
   * All resolution bookkeeping (ask_resolution, tool_result) must anchor to
   * this turn — the live turn counter may advance while the ask is pending.
   */
  turnIndex?: number;
}

export const ASK_CUSTOM_OPTION_LABEL = "Enter custom answer";
export const ASK_DISCUSS_OPTION_LABEL = "Discuss further";
export const ASK_DISCUSS_FURTHER_GUIDANCE =
  'One or more answers are "Discuss further". Treat those answers as requests to continue the discussion rather than final commitments. Use any other answers normally. Briefly address the discussion points, then return control to the user.';

export interface AgentQuestion extends AskBase {
  kind: "agent_question";
  payload: { questions: AgentQuestionItem[]; toolCallId: string };
  options: string[];
}

export interface ApprovalRequest extends AskBase {
  kind: "approval";
  payload: {
    toolCallId: string;
    toolName: string;
    toolSummary: string;
    permissionClass: string;
    offers: Array<{
      type: string;
      label: string;
      scope?: string;
      rule?: Record<string, unknown>;
    }>;
    /** Warning shown before persistent rule options (dim text, not selectable). */
    persistentWarning?: string;
  };
  options: string[];
}

export type AskRequest = AgentQuestion | ApprovalRequest;

export interface AskAuditRecord {
  askId: string;
  kind: AskKind;
  summary: string;
  decidedAt: string;
  decision: string;
  source: AskSource;
}

export interface PendingTurnState {
  stage: "pre_user_input" | "activation";
  userInput?: string;
  nextActivationIdx?: number;
  convLenBefore?: number;
  pendingToolResultText?: string;
  pendingToolCallId?: string;
}

export class AskPendingError extends Error {
  askId: string;
  ask?: AskRequest;

  constructor(askOrId: string | AskRequest) {
    const askId = typeof askOrId === "string" ? askOrId : askOrId.id;
    super(`Ask request pending resolution (${askId})`);
    this.name = "AskPendingError";
    this.askId = askId;
    if (typeof askOrId !== "string") {
      this.ask = askOrId;
    }
  }
}

export function isAskPendingError(err: unknown): err is AskPendingError {
  return err instanceof AskPendingError ||
    ((err as any)?.name === "AskPendingError" && typeof (err as any)?.askId === "string");
}

export function toPendingAskUi(ask: AskRequest | null): PendingAskUi | null {
  if (!ask) return null;
  return {
    id: ask.id,
    kind: ask.kind,
    createdAt: ask.createdAt,
    summary: ask.summary,
    source: ask.source,
    payload: ask.payload as Record<string, unknown>,
    options: [...ask.options],
  };
}
