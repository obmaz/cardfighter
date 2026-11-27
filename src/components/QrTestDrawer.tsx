import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { BookOpen, Bot, Play, QrCode, Trash2, X } from 'lucide-react';
import { CARDS, getCardsForSeeker, SEEKER_ROSTER } from '../data/cards';
import type {
  BaseColor,
  CardDef,
  DiscoveredAiCard,
  SeekerId,
} from '../types/game';

interface QrTestDrawerProps {
  open: boolean;
  onClose: () => void;
  p1Seeker: SeekerId;
  p2Seeker: SeekerId;
  onSimulateScan: (qrCode: string) => void;
  onSimulateAiImage?: (imageDataUrl: string) => void;
  grimoire?: DiscoveredAiCard[];
  onCastGrimoireCard?: (card: DiscoveredAiCard) => void;
  onClearGrimoire?: () => void;
}

interface VisionSampleCard {
  id: string;
  title: string;
  colorLabel: string;
  colorKey: BaseColor | 'lantern';
  imageUrl: string;
  fallbackHex: string;
  subtitle: string;
}

const VISION_SAMPLES: VisionSampleCard[] = [
  {
    id: 'sample_red',
    title: '태양망치 강타',
    colorLabel: '빨강 · 힘',
    colorKey: 'red',
    imageUrl: '/assets/card_red.jpg',
    fallbackHex: '#dc2626',
    subtitle: '화염 강타 & 융해/파쇄 기폭',
  },
  {
    id: 'sample_green',
    title: '그림자 연격',
    colorLabel: '초록 · 기교',
    colorKey: 'green',
    imageUrl: '/assets/card_green.jpg',
    fallbackHex: '#10b981',
    subtitle: '방해 해제 & 시간 균열/파쇄',
  },
  {
    id: 'sample_blue',
    title: '성좌 방벽',
    colorLabel: '파랑 · 지혜',
    colorKey: 'blue',
    imageUrl: '/assets/card_blue.jpg',
    fallbackHex: '#0284c7',
    subtitle: '팀 방어 + 플라스크 파쇄',
  },
  {
    id: 'sample_lantern',
    title: '태양의 랜턴',
    colorLabel: '랜턴 · 빛',
    colorKey: 'lantern',
    imageUrl: '/assets/card_lantern.jpg',
    fallbackHex: '#f59e0b',
    subtitle: '강력한 관통 일격 & 결계 돌파',
  },
];

async function sampleToJpegDataUrl(sample: VisionSampleCard): Promise<string> {
  const buildFallback = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = sample.fallbackHex;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(11, 14, 23, 0.35)';
    ctx.fillRect(24, 24, canvas.width - 48, canvas.height - 48);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(sample.title, canvas.width / 2, canvas.height / 2);
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(sample.colorLabel, canvas.width / 2, canvas.height / 2 + 48);
    return canvas.toDataURL('image/jpeg', 0.86);
  };

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image load failed'));
      el.src = sample.imageUrl;
    });

    const maxW = 512;
    const scale = Math.min(1, maxW / (img.naturalWidth || maxW));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((img.naturalWidth || 480) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || 640) * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return buildFallback();
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.86);
  } catch {
    return buildFallback();
  }
}

export function QrTestDrawer({
  open,
  onClose,
  p1Seeker,
  p2Seeker,
  onSimulateScan,
  onSimulateAiImage,
  grimoire = [],
  onCastGrimoireCard,
  onClearGrimoire,
}: QrTestDrawerProps) {
  const [tab, setTab] = useState<
    'p1' | 'p2' | 'lantern' | 'vision_samples' | 'grimoire'
  >('p1');
  const [selectedQrCard, setSelectedQrCard] = useState<CardDef | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [manualInput, setManualInput] = useState('');
  const [busySampleId, setBusySampleId] = useState<string | null>(null);

  const cards = useMemo(() => {
    if (tab === 'p1') return getCardsForSeeker(p1Seeker);
    if (tab === 'p2') return getCardsForSeeker(p2Seeker);
    if (tab === 'lantern') return CARDS.filter((c) => c.color === 'lantern');
    return [];
  }, [tab, p1Seeker, p2Seeker]);

  useEffect(() => {
    if (!selectedQrCard) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(selectedQrCard.id, {
      width: 220,
      margin: 2,
      color: { dark: '#0b0e17', light: '#ffffff' },
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedQrCard]);

  if (!open) return null;

  const handleSampleAiAnalyze = async (sample: VisionSampleCard) => {
    if (!onSimulateAiImage || busySampleId) return;
    setBusySampleId(sample.id);
    try {
      const dataUrl = await sampleToJpegDataUrl(sample);
      if (dataUrl) {
        onSimulateAiImage(dataUrl);
        onClose();
      }
    } finally {
      setBusySampleId(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h3>테스트 카드 덱 &amp; 비전 샘플</h3>
            <p className="drawer-sub">
              가상 QR 스캔, 카메라 QR 테스트, 또는 실물 일러스트 카드로 AI 비전 인식을 바로 실행하세요.
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Manual QR text test */}
        <form
          className="manual-qr-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!manualInput.trim()) return;
            onSimulateScan(manualInput.trim());
            setManualInput('');
          }}
        >
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="직접 QR 코드 입력 (예: KD_KHOR_R01)"
          />
          <button type="submit" className="btn-primary-sm">
            코드 전송
          </button>
        </form>

        <div className="drawer-tabs">
          <button
            type="button"
            className={tab === 'p1' ? 'active' : ''}
            onClick={() => setTab('p1')}
          >
            P1: {SEEKER_ROSTER[p1Seeker].name} (18장)
          </button>
          <button
            type="button"
            className={tab === 'p2' ? 'active' : ''}
            onClick={() => setTab('p2')}
          >
            P2: {SEEKER_ROSTER[p2Seeker].name} (18장)
          </button>
          <button
            type="button"
            className={tab === 'lantern' ? 'active' : ''}
            onClick={() => setTab('lantern')}
          >
            공유 랜턴 (2장)
          </button>
          <button
            type="button"
            className={tab === 'vision_samples' ? 'active' : ''}
            onClick={() => setTab('vision_samples')}
          >
            <Bot size={12} /> 비전 카드 샘플 (4종)
          </button>
          <button
            type="button"
            className={tab === 'grimoire' ? 'active' : ''}
            onClick={() => setTab('grimoire')}
          >
            <BookOpen size={12} /> 발견한 AI 도감 ({grimoire.length})
          </button>
        </div>

        <div className="drawer-body">
          {tab === 'vision_samples' ? (
            <div className="vision-samples-grid">
              {VISION_SAMPLES.map((sample) => (
                <div
                  key={sample.id}
                  className={`vision-sample-card sim-${sample.colorKey}`}
                >
                  <div className="vision-sample-thumb-wrap">
                    <img
                      src={sample.imageUrl}
                      alt={sample.title}
                      className="vision-sample-thumb"
                    />
                    <span className={`vision-sample-tag tag-${sample.colorKey}`}>
                      {sample.colorLabel}
                    </span>
                  </div>
                  <div className="vision-sample-body">
                    <strong>{sample.title}</strong>
                    <small>{sample.subtitle}</small>
                    <button
                      type="button"
                      className="btn-sample-ai"
                      disabled={!onSimulateAiImage || busySampleId !== null}
                      onClick={() => void handleSampleAiAnalyze(sample)}
                    >
                      <Bot size={13} />
                      {busySampleId === sample.id ? '전송 중...' : 'AI 비전 분석'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : tab === 'grimoire' ? (
            <div className="grimoire-panel">
              {grimoire.length === 0 ? (
                <div className="grimoire-empty">
                  <BookOpen size={24} />
                  <strong>아직 발견한 AI 카드가 없습니다.</strong>
                  <p>
                    카메라에서 [AI 카드 인식]을 누르거나 [비전 카드 샘플] 탭에서 카드를 분석하면
                    자동으로 도감에 기록됩니다.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grimoire-toolbar">
                    <span>총 {grimoire.length}종의 실물 카드 기록됨</span>
                    {onClearGrimoire && (
                      <button
                        type="button"
                        className="mini-btn"
                        onClick={onClearGrimoire}
                      >
                        <Trash2 size={12} /> 초기화
                      </button>
                    )}
                  </div>
                  <div className="card-sim-grid">
                    {grimoire.map((card) => (
                      <div key={card.id} className={`sim-card sim-${card.color}`}>
                        <div className="sim-card-top">
                          <span className="sim-code">×{card.timesUsed} 사용</span>
                          <span className="sim-stats">
                            위력 {card.damage} / 방어 +{card.guard}
                            {card.disruptChallenge ? ' / 해제' : ''}
                          </span>
                        </div>
                        <div className="sim-card-name">{card.cardName}</div>
                        <div className="sim-card-desc">
                          {card.skillTitle}
                          {card.specialNote ? ` · ${card.specialNote}` : ''}
                        </div>
                        <div className="sim-card-actions">
                          <button
                            type="button"
                            className="btn-sim-play"
                            disabled={!onCastGrimoireCard}
                            onClick={() => {
                              onCastGrimoireCard?.(card);
                              onClose();
                            }}
                          >
                            <Play size={12} />
                            재발동
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="card-sim-grid">
                {cards.map((card) => (
                  <div key={card.id} className={`sim-card sim-${card.color}`}>
                    <div className="sim-card-top">
                      <span className="sim-code">{card.id}</span>
                      <span className="sim-stats">
                        위력 {card.power} / 부스트 +{card.boostValue}
                        {card.protection > 0 ? ` / 보호 +${card.protection}` : ''}
                        {card.diceCount > 0 ? ` / 🎲×${card.diceCount}` : ''}
                      </span>
                    </div>
                    <div className="sim-card-name">{card.name}</div>
                    <div className="sim-card-desc">{card.description}</div>
                    <div className="sim-card-actions">
                      <button
                        type="button"
                        className="btn-sim-play"
                        onClick={() => {
                          onSimulateScan(card.id);
                          onClose();
                        }}
                      >
                        <Play size={12} />
                        가상 스캔
                      </button>
                      <button
                        type="button"
                        className="btn-sim-qr"
                        onClick={() => setSelectedQrCard(card)}
                      >
                        <QrCode size={12} />
                        QR 보기
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {selectedQrCard && (
                <div className="qr-preview-box">
                  <div className="qr-preview-head">
                    <strong>{selectedQrCard.name}</strong>
                    <span>{selectedQrCard.id}</span>
                  </div>
                  {qrDataUrl && (
                    <img
                      src={qrDataUrl}
                      alt={selectedQrCard.id}
                      className="qr-preview-img"
                    />
                  )}
                  <p>다른 기기 화면에 띄우거나 인쇄해 15cm 앞 전면 카메라에 비춰보세요.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
