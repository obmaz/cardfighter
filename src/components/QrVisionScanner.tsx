import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, RefreshCw, Sparkles } from 'lucide-react';
import { sfx } from '../audio/sfx';

interface QrVisionScannerProps {
  onScan: (qrCode: string) => void;
  onOpenTestDeck: () => void;
  disabled?: boolean;
  lastScanStatus?: {
    text: string;
    isError?: boolean;
  } | null;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

export function QrVisionScanner({
  onScan,
  onOpenTestDeck,
  disabled = false,
  lastScanStatus,
}: QrVisionScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const roiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const motionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevLumaRef = useRef<Uint8Array | null>(null);

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [cameraActive, setCameraActive] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [motionEnergy, setMotionEnergy] = useState(0);
  const [scanPulse, setScanPulse] = useState(false);
  const [lastDecodeMs, setLastDecodeMs] = useState<number | null>(null);
  const [engineLabel, setEngineLabel] = useState<string>('jsQR ROI');

  const lastScannedRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const handleDetectedCode = useCallback(
    (rawValue: string, elapsedMs: number) => {
      if (disabled) return;
      const code = rawValue.trim().toUpperCase();
      if (!code) return;

      const now = performance.now();
      if (
        lastScannedRef.current.code === code &&
        now - lastScannedRef.current.at < 1800
      ) {
        return;
      }

      lastScannedRef.current = { code, at: now };
      setLastDecodeMs(Math.max(1, Math.round(elapsedMs)));
      setScanPulse(true);
      sfx.playScanBeep();
      onScanRef.current(code);
      window.setTimeout(() => setScanPulse(false), 450);
    },
    [disabled],
  );

  useEffect(() => {
    if (!cameraActive) {
      setMotionEnergy(0);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId = 0;
    let detector: BarcodeDetectorLike | null = null;
    let isDecoding = false;
    let lastScanAttempt = 0;

    if (typeof window !== 'undefined' && window.BarcodeDetector) {
      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        setEngineLabel('BarcodeDetector + Vision');
      } catch {
        detector = null;
        setEngineLabel('jsQR ROI + Vision');
      }
    } else {
      setEngineLabel('jsQR ROI + Vision');
    }

    const startCamera = async () => {
      setCameraError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('이 브라우저는 카메라 스트림(HTTPS/localhost)을 지원하지 않습니다.');
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const roiCanvas =
          roiCanvasRef.current ?? (roiCanvasRef.current = document.createElement('canvas'));
        const motionCanvas =
          motionCanvasRef.current ??
          (motionCanvasRef.current = document.createElement('canvas'));
        motionCanvas.width = 96;
        motionCanvas.height = 96;
        const motionCtx = motionCanvas.getContext('2d', { willReadFrequently: true });
        const roiCtx = roiCanvas.getContext('2d', { willReadFrequently: true });

        const tick = async () => {
          if (cancelled) return;
          const now = performance.now();

          if (
            video.readyState >= 2 &&
            video.videoWidth > 0 &&
            video.videoHeight > 0 &&
            now - lastScanAttempt >= 55 &&
            !isDecoding
          ) {
            lastScanAttempt = now;
            isDecoding = true;

            try {
              const vw = video.videoWidth;
              const vh = video.videoHeight;
              const cropSize = Math.floor(Math.min(vw, vh) * 0.72);
              const sx = Math.floor((vw - cropSize) / 2);
              const sy = Math.floor((vh - cropSize) / 2);

              // 1. Vision motion energy check on tiny 96x96 ROI
              if (motionCtx) {
                motionCtx.drawImage(video, sx, sy, cropSize, cropSize, 0, 0, 96, 96);
                const imgData = motionCtx.getImageData(0, 0, 96, 96).data;
                const luma = new Uint8Array(96 * 96);
                let diffSum = 0;
                const prev = prevLumaRef.current;
                for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
                  const y = (imgData[p] * 77 + imgData[p + 1] * 150 + imgData[p + 2] * 29) >> 8;
                  luma[i] = y;
                  if (prev) {
                    const delta = Math.abs(y - prev[i]);
                    if (delta > 18) diffSum += delta;
                  }
                }
                prevLumaRef.current = luma;
                const normalized = Math.min(1, diffSum / (96 * 96 * 14));
                setMotionEnergy((prevEnergy) => prevEnergy * 0.65 + normalized * 0.35);
              }

              // 2. QR decoding on sharp 360x360 ROI
              if (roiCtx) {
                const targetSize = 360;
                if (roiCanvas.width !== targetSize) {
                  roiCanvas.width = targetSize;
                  roiCanvas.height = targetSize;
                }
                roiCtx.drawImage(
                  video,
                  sx,
                  sy,
                  cropSize,
                  cropSize,
                  0,
                  0,
                  targetSize,
                  targetSize,
                );

                const t0 = performance.now();
                let decoded: string | null = null;

                if (detector) {
                  try {
                    const results = await detector.detect(roiCanvas);
                    if (results[0]?.rawValue) {
                      decoded = results[0].rawValue;
                    }
                  } catch {
                    // Fallback to jsQR below if native detector fails
                  }
                }

                if (!decoded) {
                  const frame = roiCtx.getImageData(0, 0, targetSize, targetSize);
                  const qr = jsQR(frame.data, targetSize, targetSize, {
                    inversionAttempts: 'attemptBoth',
                  });
                  if (qr?.data) {
                    decoded = qr.data;
                  }
                }

                if (decoded) {
                  handleDetectedCode(decoded, performance.now() - t0);
                }
              }
            } finally {
              isDecoding = false;
            }
          }

          rafId = window.requestAnimationFrame(() => {
            void tick();
          });
        };

        rafId = window.requestAnimationFrame(() => {
          void tick();
        });
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : '카메라 권한이 거부되었거나 장치를 찾을 수 없습니다.';
        setCameraError(msg);
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      prevLumaRef.current = null;
    };
  }, [cameraActive, facingMode, handleDetectedCode]);

  const motionRingScale = 1 + motionEnergy * 0.14;

  return (
    <div className={`qr-scanner-panel ${scanPulse ? 'scan-pulse' : ''}`}>
      <div className="qr-scanner-header">
        <div className="qr-scanner-title">
          <Sparkles size={14} className="accent-amber" />
          <span>QR · 비전 스캐너 ({facingMode === 'user' ? '전면' : '후면'})</span>
          <span className="engine-pill">{engineLabel}</span>
        </div>

        <div className="qr-scanner-controls">
          <button
            type="button"
            className="mini-btn"
            onClick={() => setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))}
            title="전/후면 카메라 전환"
          >
            <RefreshCw size={13} />
            전환
          </button>
          <button
            type="button"
            className="mini-btn"
            onClick={() => setCameraActive((v) => !v)}
          >
            {cameraActive ? <CameraOff size={13} /> : <Camera size={13} />}
            {cameraActive ? '일시정지' : '카메라 켜기'}
          </button>
          <button
            type="button"
            className="mini-btn mini-btn-accent"
            onClick={onOpenTestDeck}
          >
            카드 QR / 시뮬레이터
          </button>
        </div>
      </div>

      <div className="qr-viewfinder-box">
        {cameraActive && !cameraError ? (
          <>
            <video
              ref={videoRef}
              className={`qr-video ${facingMode === 'user' ? 'mirrored' : ''}`}
              playsInline
              muted
            />
            <div
              className="vision-reticle"
              style={{
                transform: `translate(-50%, -50%) scale(${motionRingScale.toFixed(3)})`,
                borderColor:
                  scanPulse
                    ? '#fbbf24'
                    : motionEnergy > 0.22
                      ? '#38bdf8'
                      : 'rgba(255,255,255,0.42)',
              }}
            >
              <span className="reticle-corner tl" />
              <span className="reticle-corner tr" />
              <span className="reticle-corner bl" />
              <span className="reticle-corner br" />
            </div>
            <div className="vision-telemetry">
              <span>모션 감지 {Math.round(motionEnergy * 100)}%</span>
              {lastDecodeMs !== null && <span>인식 {lastDecodeMs}ms</span>}
            </div>
          </>
        ) : (
          <div className="camera-fallback">
            <p>{cameraError ?? '카메라가 일시 정지되었습니다.'}</p>
            <button
              type="button"
              className="btn-primary-sm"
              onClick={onOpenTestDeck}
            >
              시뮬레이터 카드로 바로 테스트하기
            </button>
          </div>
        )}
      </div>

      <div className="qr-status-strip">
        {lastScanStatus ? (
          <span className={lastScanStatus.isError ? 'status-err' : 'status-ok'}>
            {lastScanStatus.text}
          </span>
        ) : (
          <span>카메라 15cm 앞에 카드 QR을 비추거나 [카드 QR / 시뮬레이터]를 여세요.</span>
        )}
      </div>
    </div>
  );
}
