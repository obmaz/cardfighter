import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, Play, X } from 'lucide-react';
import { CARDS, getCardsForSeeker, SEEKER_ROSTER } from '../data/cards';
import type { CardDef, SeekerId } from '../types/game';

interface QrTestDrawerProps {
  open: boolean;
  onClose: () => void;
  p1Seeker: SeekerId;
  p2Seeker: SeekerId;
  onSimulateScan: (qrCode: string) => void;
}

export function QrTestDrawer({
  open,
  onClose,
  p1Seeker,
  p2Seeker,
  onSimulateScan,
}: QrTestDrawerProps) {
  const [tab, setTab] = useState<'p1' | 'p2' | 'lantern'>('p1');
  const [selectedQrCard, setSelectedQrCard] = useState<CardDef | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [manualInput, setManualInput] = useState('');

  const cards = useMemo(() => {
    if (tab === 'p1') return getCardsForSeeker(p1Seeker);
    if (tab === 'p2') return getCardsForSeeker(p2Seeker);
    return CARDS.filter((c) => c.color === 'lantern');
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h3>테스트 카드 덱 &amp; QR 코드 생성기</h3>
            <p className="drawer-sub">
              가상 스캔으로 즉시 룰을 테스트하거나, QR을 띄워 실제 전면 카메라로 비춰보세요.
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
        </div>

        <div className="drawer-body">
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
                    onClick={() => onSimulateScan(card.id)}
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
        </div>
      </div>
    </div>
  );
}
