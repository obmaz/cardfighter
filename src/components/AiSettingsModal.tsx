import { useEffect, useState } from 'react';
import { Bot, CheckCircle2, Cpu, KeyRound, Sparkles, X } from 'lucide-react';
import {
  testAiConnection,
  type AiAgentConfig,
  type AiProviderMode,
} from '../ai/visionAgent';

interface AiSettingsModalProps {
  open: boolean;
  config: AiAgentConfig;
  onClose: () => void;
  onSave: (next: AiAgentConfig) => void;
}

export function AiSettingsModal({
  open,
  config,
  onClose,
  onSave,
}: AiSettingsModalProps) {
  const [draft, setDraft] = useState<AiAgentConfig>(config);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(config);
      setTestResult(null);
    }
  }, [open, config]);

  if (!open) return null;

  const setMode = (mode: AiProviderMode) => {
    setTestResult(null);
    setDraft((prev) => ({ ...prev, mode }));
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const msg = await testAiConnection(draft);
      setTestResult({ ok: true, message: msg });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : '연결 실패',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="setup-modal ai-modal" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="ai-modal-title">
            <Bot size={18} className="accent-amber" />
            <div>
              <h3>AI 비전 에이전트 연결</h3>
              <p className="drawer-sub">
                API Key 없이 즉시 테스트하는 비전 데모부터 로컬 AI · Gemini · OpenAI까지 지원합니다.
              </p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="drawer-tabs">
          <button
            type="button"
            className={draft.mode === 'demo' ? 'active' : ''}
            onClick={() => setMode('demo')}
          >
            <Sparkles size={13} /> 비전 데모
          </button>
          <button
            type="button"
            className={draft.mode === 'local' ? 'active' : ''}
            onClick={() => setMode('local')}
          >
            <Cpu size={13} /> 로컬 AI
          </button>
          <button
            type="button"
            className={draft.mode === 'gemini' ? 'active' : ''}
            onClick={() => setMode('gemini')}
          >
            <KeyRound size={13} /> Gemini Key
          </button>
          <button
            type="button"
            className={draft.mode === 'openai' ? 'active' : ''}
            onClick={() => setMode('openai')}
          >
            <KeyRound size={13} /> OpenAI Key
          </button>
        </div>

        {draft.mode === 'demo' && (
          <div className="ai-demo-box">
            <strong>비전 데모 모드 (API Key 불필요)</strong>
            <p>
              카메라 프레임이나 업로드한 카드 사진의 지배 색상(빨강/초록/파랑)을 브라우저에서
              실시간 분석해 보스의 현재 보호막·원소 공명 상태에 맞는 전술 액션을 즉시 실행합니다.
            </p>
          </div>
        )}

        {draft.mode === 'local' && (
          <div className="ai-form-fields">
            <div className="setup-group">
              <label>로컬 비전 엔드포인트 (OpenAI 호환 또는 Ollama /api/chat)</label>
              <input
                type="text"
                className="text-input"
                value={draft.localEndpoint}
                onChange={(e) =>
                  setDraft({ ...draft, localEndpoint: e.target.value })
                }
                placeholder="http://localhost:11434/v1/chat/completions"
              />
            </div>
            <div className="setup-row">
              <div className="setup-group">
                <label>모델명</label>
                <input
                  type="text"
                  className="text-input"
                  value={draft.localModel}
                  onChange={(e) =>
                    setDraft({ ...draft, localModel: e.target.value })
                  }
                  placeholder="qwen2.5vl / llava"
                />
              </div>
              <div className="setup-group">
                <label>토큰 (선택)</label>
                <input
                  type="password"
                  className="text-input"
                  value={draft.localApiKey}
                  onChange={(e) =>
                    setDraft({ ...draft, localApiKey: e.target.value })
                  }
                  placeholder="로컬 서버 불필요 시 공백"
                />
              </div>
            </div>
          </div>
        )}

        {draft.mode === 'gemini' && (
          <div className="ai-form-fields">
            <div className="setup-group">
              <label>Gemini API Key (브라우저 로컬에만 저장됨)</label>
              <input
                type="password"
                className="text-input"
                value={draft.geminiApiKey}
                onChange={(e) =>
                  setDraft({ ...draft, geminiApiKey: e.target.value })
                }
                placeholder="AIza..."
              />
            </div>
            <div className="setup-group">
              <label>모델</label>
              <input
                type="text"
                className="text-input"
                value={draft.geminiModel}
                onChange={(e) =>
                  setDraft({ ...draft, geminiModel: e.target.value })
                }
                placeholder="gemini-2.5-flash"
              />
            </div>
          </div>
        )}

        {draft.mode === 'openai' && (
          <div className="ai-form-fields">
            <div className="setup-group">
              <label>OpenAI API Key (브라우저 로컬에만 저장됨)</label>
              <input
                type="password"
                className="text-input"
                value={draft.openaiApiKey}
                onChange={(e) =>
                  setDraft({ ...draft, openaiApiKey: e.target.value })
                }
                placeholder="sk-..."
              />
            </div>
            <div className="setup-group">
              <label>모델</label>
              <input
                type="text"
                className="text-input"
                value={draft.openaiModel}
                onChange={(e) =>
                  setDraft({ ...draft, openaiModel: e.target.value })
                }
                placeholder="gpt-4o-mini"
              />
            </div>
          </div>
        )}

        {testResult && (
          <div className={`ai-test-msg ${testResult.ok ? 'ok' : 'err'}`}>
            <CheckCircle2 size={14} />
            <span>{testResult.message}</span>
          </div>
        )}

        <div className="setup-footer">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void handleTest()}
            disabled={testing}
          >
            {testing ? '테스트 중...' : '연결 테스트'}
          </button>
          <button
            type="button"
            className="btn-phase-next"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            저장 후 적용
          </button>
        </div>
      </div>
    </div>
  );
}
