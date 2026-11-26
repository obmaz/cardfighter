import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import jsQR from 'jsqr';
import {
  Bot,
  Camera,
  CameraOff,
  ImagePlus,
  RefreshCw,
  ScanEye,
  Sparkles,
} from 'lucide-react';
import { sfx } from '../audio/sfx';

interface QrVisionScannerProps {
  onScan: (qrCode: string) => void;
  onCaptureForAi: (imageDataUrl: string) => void;
  onOpenTestDeck: () => void;
  onRequireAiConfig?: () => void;
  aiConfigured?: boolean;
  aiBusy?: boolean;
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
  onCaptureForAi,
  onOpenTestDeck,
  onRequireAiConfig,
  aiConfigured = false,
  aiBusy = false,
  disabled = false,
  lastScanStatus,
}: QrVisionScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const roiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const motionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevLumaRef = useRef<Uint8Array | null>(null);

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [cameraActive, setCameraActive] = useState(true);
  const [cameraRetryTick, setCameraRetryTick] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [motionEnergy, setMotionEnergy] = useState(0);
  const [scanPulse, setScanPulse] = useState(false);
  const [lastDecodeMs, setLastDecodeMs] = useState<number | null>(null);
  const [autoVision, setAutoVision] = useState(false);
  const [autoPhase, setAutoPhase] = useState<
    'idle' | 'detecting' | 'stabilizing' | 'cooldown'
  >('idle');

  const lastScannedRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const motionArmedRef = useRef(false);
  const stableTimerRef = useRef<number | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  const lastAutoCaptureRef = useRef(0);

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

  const captureFrameForAi = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    const maxW = 768;
    const scale = Math.min(1, maxW / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    setScanPulse(true);
    sfx.playScanBeep();
    onCaptureForAi(dataUrl);
    window.setTimeout(() => setScanPulse(false), 450);
  }, [onCaptureForAi]);

  const captureFrameRef = useRef(captureFrameForAi);
  captureFrameRef.current = captureFrameForAi;

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
      } catch {
        detector = null;
      }
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
  }, [cameraActive, cameraRetryTick, facingMode, handleDetectedCode]);

  // Hands-free Vision Auto-Trigger: arm on motion > 0.14, capture after < 0.05 for 900ms (4.5s cooldown)
  useEffect(() => {
    const clearStableTimer = () => {
      if (stableTimerRef.current !== null) {
        window.clearTimeout(stableTimerRef.current);
        stableTimerRef.current = null;
      }
    };

    if (!autoVision || !cameraActive || cameraError || !aiConfigured || aiBusy || disabled) {
      clearStableTimer();
      motionArmedRef.current = false;
      setAutoPhase('idle');
      return;
    }

    const elapsedSinceLast = performance.now() - lastAutoCaptureRef.current;
    if (lastAutoCaptureRef.current > 0 && elapsedSinceLast < 4500) {
      clearStableTimer();
      motionArmedRef.current = false;
      setAutoPhase('cooldown');
      return;
    }

    if (motionEnergy > 0.14) {
      motionArmedRef.current = true;
      clearStableTimer();
      setAutoPhase('detecting');
      return;
    }

    if (motionArmedRef.current && motionEnergy < 0.05) {
      if (stableTimerRef.current === null) {
        setAutoPhase('stabilizing');
        stableTimerRef.current = window.setTimeout(() => {
          stableTimerRef.current = null;
          motionArmedRef.current = false;
          const now = performance.now();
          if (now - lastAutoCaptureRef.current < 4500) {
            setAutoPhase('cooldown');
            return;
          }
          lastAutoCaptureRef.current = now;
          setAutoPhase('cooldown');
          captureFrameRef.current();
          if (cooldownTimerRef.current !== null) {
            window.clearTimeout(cooldownTimerRef.current);
          }
          cooldownTimerRef.current = window.setTimeout(() => {
            cooldownTimerRef.current = null;
            setAutoPhase('idle');
          }, 4500);
        }, 900);
      }
    } else if (motionEnergy >= 0.05) {
      clearStableTimer();
      setAutoPhase(motionArmedRef.current ? 'detecting' : 'idle');
    }
  }, [autoVision, cameraActive, cameraError, aiConfigured, aiBusy, disabled, motionEnergy]);

  useEffect(() => {
    return () => {
      if (stableTimerRef.current !== null) window.clearTimeout(stableTimerRef.current);
      if (cooldownTimerRef.current !== null) window.clearTimeout(cooldownTimerRef.current);
    };
  }, []);

  const motionRingScale = 1 + motionEnergy * 0.14;

  const handleToggleAutoVision = () => {
    if (!autoVision && !aiConfigured) {
      onRequireAiConfig?.();
      return;
    }
    setAutoVision((v) => !v);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        sfx.playScanBeep();
        onCaptureForAi(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const autoStatusText =
    autoPhase === 'stabilizing'
      ? '초점 고정 중...'
      : autoPhase === 'detecting'
        ? '카드 감지됨'
        : autoPhase === 'cooldown'
          ? '재인식 대기'
          : '자동 대기';

  return (
    <div className={`qr-scanner-panel ${scanPulse ? 'scan-pulse' : ''}`}>
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
              className={`vision-reticle ${autoVision ? 'reticle-auto' : ''}`}
              style={{
                transform: `translate(-50%, -50%) scale(${motionRingScale.toFixed(3)})`,
                borderColor:
                  scanPulse
                    ? '#fbbf24'
                    : autoPhase === 'stabilizing'
                      ? '#36d399'
                      : autoVision || motionEnergy > 0.22
                        ? '#38bdf8'
                        : 'rgba(255,255,255,0.42)',
              }}
            >
              <span className="reticle-corner tl" />
              <span className="reticle-corner tr" />
              <span className="reticle-corner bl" />
              <span className="reticle-corner br" />
              {autoVision && (
                <span className="reticle-auto-pill">{autoStatusText}</span>
              )}
            </div>
          </>
        ) : (
          <div className="camera-fallback">
            <p className="camera-fallback-msg">
              {cameraError ?? '카메라가 일시 정지되었습니다.'}
            </p>
            <div className="camera-fallback-actions">
              <button
                type="button"
                className="fallback-btn fallback-btn-primary"
                disabled={disabled || aiBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus size={14} />
                사진 업로드
              </button>
              <button
                type="button"
                className="fallback-btn fallback-btn-accent"
                onClick={onOpenTestDeck}
              >
                <Sparkles size={14} />
                테스트 덱 열기
              </button>
              <button
                type="button"
                className="fallback-btn"
                onClick={() => {
                  setCameraError(null);
                  setCameraActive(true);
                  setCameraRetryTick((n) => n + 1);
                }}
              >
                <Camera size={14} />
                {cameraError ? '재시도' : '카메라 켜기'}
              </button>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileUpload}
        />

        {/* Compact floating controls top-right */}
        <div className="scanner-overlay-controls">
          <button
            type="button"
            className="mini-btn mini-btn-ai"
            disabled={disabled || aiBusy || !cameraActive || Boolean(cameraError)}
            onClick={captureFrameForAi}
            title="카메라에 비춘 카드를 AI가 직접 읽고 공격"
          >
            <Bot size={12} />
            {aiBusy ? 'AI 분석 중...' : 'AI 카드 인식'}
          </button>
          <button
            type="button"
            className={`mini-btn ${autoVision ? 'mini-btn-auto-on' : ''}`}
            onClick={handleToggleAutoVision}
            title="카드가 프레임에 고정되면 자동으로 AI 인식 실행"
          >
            <ScanEye size={12} />
            자동 인식
          </button>
          <button
            type="button"
            className="mini-btn"
            disabled={disabled || aiBusy}
            onClick={() => fileInputRef.current?.click()}
            title="카드 사진 파일로 AI 테스트"
          >
            <ImagePlus size={12} />
            사진
          </button>
          <button
            type="button"
            className="mini-btn"
            onClick={() => setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))}
            title="전/후면 카메라 전환"
          >
            <RefreshCw size={12} />
            {facingMode === 'user' ? '전면' : '후면'}
          </button>
          <button
            type="button"
            className="mini-btn"
            onClick={() => setCameraActive((v) => !v)}
          >
            {cameraActive ? <CameraOff size={12} /> : <Camera size={12} />}
          </button>
          <button
            type="button"
            className="mini-btn mini-btn-accent"
            onClick={onOpenTestDeck}
          >
            <Sparkles size={12} />
            QR 테스트
          </button>
        </div>

        {/* Compact floating status bottom */}
        <div className="scanner-overlay-status">
          <span className={lastScanStatus?.isError ? 'status-err' : 'status-ok'}>
            {lastScanStatus?.text ??
              (autoVision
                ? `핸즈프리 자동 인식 활성 (${autoStatusText})`
                : '카드를 카메라에 비추고 [AI 카드 인식] 또는 QR 스캔')}
          </span>
          {lastDecodeMs !== null && <span className="decode-ms">{lastDecodeMs}ms</span>}
        </div>
      </div>
    </div>
  );
}
