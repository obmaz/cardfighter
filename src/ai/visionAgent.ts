import type { AiCardAction, BaseColor, BossState } from '../types/game';

export type AiProviderMode = 'demo' | 'local' | 'gemini' | 'openai';

export interface AiAgentConfig {
  mode: AiProviderMode;
  localEndpoint: string;
  localModel: string;
  localApiKey: string;
  geminiApiKey: string;
  geminiModel: string;
  openaiApiKey: string;
  openaiModel: string;
}

const STORAGE_KEY = 'kinfire_ai_config_v1';

export const DEFAULT_AI_CONFIG: AiAgentConfig = {
  mode: 'demo',
  localEndpoint: 'http://localhost:11434/v1/chat/completions',
  localModel: 'qwen2.5vl',
  localApiKey: '',
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
};

export function loadAiConfig(): AiAgentConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AI_CONFIG;
    return { ...DEFAULT_AI_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_AI_CONFIG;
  }
}

export function saveAiConfig(config: AiAgentConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage quota issues
  }
}

export function isAiConfigured(config: AiAgentConfig): boolean {
  if (config.mode === 'demo') return true;
  if (config.mode === 'local') {
    return Boolean(config.localEndpoint.trim() && config.localModel.trim());
  }
  if (config.mode === 'gemini') {
    return Boolean(config.geminiApiKey.trim());
  }
  return Boolean(config.openaiApiKey.trim());
}

function buildSystemPrompt(boss: BossState): string {
  const primedDesc = boss.primedElement
    ? `현재 보스에게 [${boss.primedElement.toUpperCase()}] 원소가 부여되어 있습니다 (다른 속성 공격 시 원소 공명 발동: R+B=과부하 융해, B+G=시간 균열, R+G=파쇄 치명타).`
    : '현재 보스에게 부여된 원소가 없습니다 (공격 시 해당 원소가 대기 상태로 부여됩니다).';

  const stanceDesc = boss.temporalStance
    ? `현재 시간 태세: ${
        boss.temporalStance === 'accelerate'
          ? '가속 (반격 +1, 시간 균열[파랑+초록] 발동 시 추가 피해 +4 및 역행 전환)'
          : '역행 (부스트/보호막 파쇄 시 게이지 +15, 반격 시 보호막 잔존 시 +2 회복)'
      }`
    : '';

  return [
    '당신은 실물 보드게임 카드를 카메라로 인식해 보스 레이드 전투를 수행하는 AI 전투 에이전트입니다.',
    '사용자가 보여준 카드 이미지를 보고 카드의 이름, 색상(빨강/초록/파랑/황금 랜턴), 능력치와 특수 효과를 해석하세요.',
    `현재 보스: ${boss.name} (${boss.subtitle}), PHASE ${boss.phase}, HP ${boss.hp}/${boss.maxHp}`,
    `현재 보스 보호막: RED ${boss.shields.red}, GREEN ${boss.shields.green}, BLUE ${boss.shields.blue}`,
    `예고된 보스 반격 의도: ${boss.intent.title} (${boss.intent.description})`,
    stanceDesc,
    primedDesc,
    boss.invulnerable ? '보스는 현재 무적 결계 상태입니다(lantern 속성으로만 관통 가능).' : '',
    '반드시 아래 JSON 스키마만 출력하세요 (다른 설명 금지):',
    '{',
    '  "cardName": "이미지에서 읽은 카드 이름 (한국어)",',
    '  "color": "red | green | blue | lantern 중 하나",',
    '  "skillTitle": "AI 에이전트가 발동할 기술명 (짧고 강렬하게)",',
    '  "damage": 1~12 사이 정수 (카드 위력/효과에 비례),',
    '  "guard": 0~5 사이 정수 (방어/보호 계열이면 높게),',
    '  "disruptChallenge": true 또는 false (방해 제거/민첩/초록 계열이면 true),',
    '  "specialNote": "카드 능력 요약 1줄",',
    '  "battleCry": "AI 에이전트의 짧은 전투 대사 1문장 (보스 페이즈/의도/원소 공명 연계 반영)",',
    '  "reactionHint": "다음 연계할 추천 원소 공명 또는 공략 힌트 (선택)",',
    '  "recommendedRole": "breaker | defender | disruptor | burst 중 하나 (선택)"',
    '}',
  ]
    .filter(Boolean)
    .join('\n');
}

function normalizeAiAction(raw: unknown): AiCardAction {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const validColors: Array<BaseColor | 'lantern'> = [
    'red',
    'green',
    'blue',
    'lantern',
  ];
  const rawColor = String(obj.color ?? 'red').toLowerCase();
  const color = (validColors.includes(rawColor as BaseColor | 'lantern')
    ? rawColor
    : 'red') as BaseColor | 'lantern';

  const damageNum = Number(obj.damage);
  const guardNum = Number(obj.guard);
  const validRoles = ['breaker', 'defender', 'disruptor', 'burst'] as const;
  const rawRole = typeof obj.recommendedRole === 'string'
    ? obj.recommendedRole.toLowerCase().trim()
    : '';
  const recommendedRole = validRoles.includes(
    rawRole as (typeof validRoles)[number],
  )
    ? (rawRole as AiCardAction['recommendedRole'])
    : undefined;
  const reactionHint =
    typeof obj.reactionHint === 'string' && obj.reactionHint.trim()
      ? obj.reactionHint.trim().slice(0, 80)
      : undefined;

  return {
    cardName: String(obj.cardName || '미확인 카드').slice(0, 40),
    color,
    skillTitle: String(obj.skillTitle || obj.cardName || '에이전트 일격').slice(
      0,
      40,
    ),
    damage: Number.isFinite(damageNum)
      ? Math.max(1, Math.min(15, Math.round(damageNum)))
      : 4,
    guard: Number.isFinite(guardNum)
      ? Math.max(0, Math.min(5, Math.round(guardNum)))
      : 0,
    disruptChallenge: Boolean(obj.disruptChallenge),
    specialNote: String(obj.specialNote || 'AI 비전 카드 해석 발동').slice(0, 80),
    battleCry: String(
      obj.battleCry || '카드의 힘을 읽어 보스를 타격한다!',
    ).slice(0, 100),
    ...(reactionHint ? { reactionHint } : {}),
    ...(recommendedRole ? { recommendedRole } : {}),
  };
}

function extractJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error('AI 응답에서 유효한 JSON을 파싱하지 못했습니다.');
  }
}

function fallbackDominantColor(imageDataUrl: string, boss: BossState): BaseColor {
  if (boss.primedElement === 'red') return 'blue';
  if (boss.primedElement === 'blue') return 'green';
  if (boss.primedElement === 'green') return 'red';
  const colors: BaseColor[] = ['red', 'green', 'blue'];
  return colors[imageDataUrl.length % colors.length];
}

async function detectDominantColor(
  imageDataUrl: string,
  boss: BossState,
): Promise<BaseColor> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return fallbackDominantColor(imageDataUrl, boss);
  }

  return new Promise<BaseColor>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(fallbackDominantColor(imageDataUrl, boss));
          return;
        }
        ctx.drawImage(img, 0, 0, 24, 24);
        const { data } = ctx.getImageData(0, 0, 24, 24);
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // Weight saturated pixels higher so card borders/artwork win over neutral backgrounds
          const spread = Math.max(r, g, b) - Math.min(r, g, b);
          const weight = 1 + spread / 32;
          rSum += r * weight;
          gSum += g * weight;
          bSum += b * weight;
        }
        if (rSum >= gSum && rSum >= bSum) resolve('red');
        else if (gSum >= rSum && gSum >= bSum) resolve('green');
        else resolve('blue');
      } catch {
        resolve(fallbackDominantColor(imageDataUrl, boss));
      }
    };
    img.onerror = () => resolve(fallbackDominantColor(imageDataUrl, boss));
    img.src = imageDataUrl;
  });
}

async function analyzeCardDemo(
  imageDataUrl: string,
  boss: BossState,
): Promise<AiCardAction> {
  const color = await detectDominantColor(imageDataUrl, boss);
  const reactionMap: Record<BaseColor, string> = {
    red:
      boss.primedElement === 'blue'
        ? '과부하 융해 발동! 전 보호막 약화!'
        : boss.primedElement === 'green'
          ? '파쇄 치명타 발동! 1.5배 폭딜!'
          : '다음 파랑(융해) 또는 초록(파쇄) 카드로 원소 공명 연계',
    green:
      boss.primedElement === 'blue'
        ? '시간 균열 발동! 보스 반격 약화 및 챌린지 해제!'
        : boss.primedElement === 'red'
          ? '파쇄 치명타 발동! 강타 연계!'
          : '다음 파랑(시간 균열) 또는 빨강(파쇄) 카드로 공명 연계',
    blue:
      boss.primedElement === 'red'
        ? '과부하 융해 발동! 전 보호막 -1 연쇄!'
        : boss.primedElement === 'green'
          ? '시간 균열 발동! 반격 약화 & 방어 보강!'
          : '다음 빨강(융해) 또는 초록(시간 균열) 카드로 공명 연계',
  };

  const preset: Record<BaseColor, AiCardAction> = {
    red: {
      cardName: '홍련의 비전 카드',
      color: 'red',
      skillTitle: '화염 쇄도',
      damage: 5,
      guard: 1,
      disruptChallenge: false,
      specialNote: `비전 데모 · 붉은 파동 분석 (${boss.intent.title} 대응)`,
      battleCry: `${boss.name}의 방벽을 불꽃으로 꿰뚫는다!`,
      reactionHint: reactionMap.red,
      recommendedRole: 'breaker',
    },
    green: {
      cardName: '비취의 기교 카드',
      color: 'green',
      skillTitle: '질풍 교란',
      damage: 4,
      guard: 1,
      disruptChallenge: true,
      specialNote: `비전 데모 · 초록 파동 분석 (방해 챌린지 해제)`,
      battleCry:
        boss.temporalStance === 'accelerate'
          ? '가속 태세를 끊고 시간의 틈새를 노린다!'
          : `${boss.name}의 빈틈을 파고들어 교란한다!`,
      reactionHint: reactionMap.green,
      recommendedRole: 'disruptor',
    },
    blue: {
      cardName: '창공의 지혜 카드',
      color: 'blue',
      skillTitle: '성좌 방벽',
      damage: 4,
      guard: 2,
      disruptChallenge: false,
      specialNote: `비전 데모 · 푸른 파동 분석 (팀 보호 +2)`,
      battleCry: `${boss.intent.title}에 맞서 성좌의 방벽을 전개한다!`,
      reactionHint: reactionMap.blue,
      recommendedRole: 'defender',
    },
  };

  return normalizeAiAction(preset[color]);
}

export async function analyzeCardWithAI(
  imageDataUrl: string,
  boss: BossState,
  config: AiAgentConfig,
): Promise<AiCardAction> {
  if (config.mode === 'demo') {
    return analyzeCardDemo(imageDataUrl, boss);
  }

  const prompt = buildSystemPrompt(boss);
  const base64Only = imageDataUrl.includes(',')
    ? imageDataUrl.split(',')[1]
    : imageDataUrl;

  if (config.mode === 'gemini') {
    if (!config.geminiApiKey.trim()) {
      throw new Error('Gemini API Key를 먼저 입력해주세요.');
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      config.geminiModel || 'gemini-2.5-flash',
    )}:generateContent?key=${encodeURIComponent(config.geminiApiKey.trim())}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: base64Only,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.25,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API 오류 (${res.status}): ${errText.slice(0, 160)}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini 응답이 비어 있습니다.');
    return normalizeAiAction(extractJsonFromText(text));
  }

  // OpenAI or Local OpenAI-Compatible / Ollama endpoint
  const isLocal = config.mode === 'local';
  const endpoint = isLocal
    ? config.localEndpoint.trim()
    : 'https://api.openai.com/v1/chat/completions';
  const model = isLocal ? config.localModel.trim() : config.openaiModel.trim();
  const apiKey = isLocal ? config.localApiKey.trim() : config.openaiApiKey.trim();

  if (!isLocal && !apiKey) {
    throw new Error('OpenAI API Key를 먼저 입력해주세요.');
  }

  // Support Ollama native /api/chat seamlessly if user enters that endpoint
  const isOllamaNative = isLocal && endpoint.endsWith('/api/chat');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const body = isOllamaNative
    ? {
        model,
        stream: false,
        format: 'json',
        messages: [
          {
            role: 'user',
            content: prompt,
            images: [base64Only],
          },
        ],
      }
    : {
        model,
        temperature: 0.25,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: imageDataUrl },
              },
            ],
          },
        ],
      };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `${isLocal ? '로컬 AI' : 'OpenAI'} 오류 (${res.status}): ${errText.slice(0, 160)}`,
    );
  }

  const data = (await res.json()) as {
    message?: { content?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content =
    data.choices?.[0]?.message?.content ?? data.message?.content ?? '';
  if (!content) throw new Error('AI 응답 텍스트가 비어 있습니다.');
  return normalizeAiAction(extractJsonFromText(content));
}

export async function testAiConnection(config: AiAgentConfig): Promise<string> {
  if (config.mode === 'demo') {
    return '비전 데모 모드 연결 완료! (카메라/사진 색상 실시간 분석)';
  }
  if (config.mode === 'gemini') {
    if (!config.geminiApiKey.trim()) {
      throw new Error('Gemini API Key를 입력하세요.');
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      config.geminiModel || 'gemini-2.5-flash',
    )}:generateContent?key=${encodeURIComponent(config.geminiApiKey.trim())}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with OK only.' }] }],
      }),
    });
    if (!res.ok) throw new Error(`연결 실패 (${res.status})`);
    return `Gemini (${config.geminiModel}) 연결 성공!`;
  }

  const isLocal = config.mode === 'local';
  const endpoint = isLocal
    ? config.localEndpoint.trim()
    : 'https://api.openai.com/v1/chat/completions';
  const model = isLocal ? config.localModel.trim() : config.openaiModel.trim();
  const apiKey = isLocal ? config.localApiKey.trim() : config.openaiApiKey.trim();

  if (!isLocal && !apiKey) throw new Error('OpenAI API Key를 입력하세요.');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const isOllamaNative = isLocal && endpoint.endsWith('/api/chat');
  const payload = isOllamaNative
    ? { model, stream: false, messages: [{ role: 'user', content: 'OK' }] }
    : { model, messages: [{ role: 'user', content: 'OK' }], max_tokens: 5 };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`연결 실패 (${res.status})`);
  return `${isLocal ? '로컬 AI' : 'OpenAI'} (${model}) 연결 성공!`;
}
