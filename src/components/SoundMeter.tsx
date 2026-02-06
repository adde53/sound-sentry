import { useState, useRef, useCallback, useEffect } from "react";

const MEASUREMENT_DURATION = 60; // seconds
const UPDATE_INTERVAL = 50; // ms

const SoundMeter = () => {
  const [currentDb, setCurrentDb] = useState<number | null>(null);
  const [maxDb, setMaxDb] = useState<number | null>(null);
  const [avgDb, setAvgDb] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(MEASUREMENT_DURATION);
  const [history, setHistory] = useState<number[]>([]);
  const [showGraph, setShowGraph] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const measurementsRef = useRef<number[]>([]);
  const startTimeRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const calculateDb = (dataArray: Uint8Array): number => {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    // Convert to decibels (approximate scale for display purposes)
    const db = 20 * Math.log10(Math.max(rms, 0.00001));
    // Normalize to a more readable range (0-100 dB approximate)
    return Math.max(0, Math.min(100, db + 100));
  };

  const startMeasurement = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      measurementsRef.current = [];
      startTimeRef.current = Date.now();
      setIsActive(true);
      setShowGraph(false);
      setHistory([]);
      setMaxDb(null);
      setAvgDb(null);
      setCurrentDb(null);
      setTimeLeft(MEASUREMENT_DURATION);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastHistoryUpdate = 0;

      const measure = () => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const remaining = Math.max(0, MEASUREMENT_DURATION - elapsed);
        setTimeLeft(Math.ceil(remaining));

        if (remaining <= 0) {
          // Measurement complete
          setIsActive(false);
          cleanup();
          
          const measurements = measurementsRef.current;
          if (measurements.length > 0) {
            const max = Math.max(...measurements);
            const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
            setMaxDb(Math.round(max));
            setAvgDb(Math.round(avg));
          }
          setShowGraph(true);
          return;
        }

        analyser.getByteTimeDomainData(dataArray);
        const db = calculateDb(dataArray);
        const roundedDb = Math.round(db);

        setCurrentDb(roundedDb);
        measurementsRef.current.push(db);

        // Update history for graph (sample every 500ms)
        if (elapsed - lastHistoryUpdate >= 0.5) {
          setHistory(prev => [...prev, db]);
          lastHistoryUpdate = elapsed;
        }

        // Update max and avg in real-time
        const measurements = measurementsRef.current;
        setMaxDb(Math.round(Math.max(...measurements)));
        setAvgDb(Math.round(measurements.reduce((a, b) => a + b, 0) / measurements.length));

        animationRef.current = requestAnimationFrame(measure);
      };

      animationRef.current = requestAnimationFrame(measure);
    } catch (error) {
      console.error("Kunde inte komma åt mikrofonen:", error);
      setIsActive(false);
    }
  };

  const formatValue = (value: number | null): string => {
    return value !== null ? `${value}` : "--";
  };

  // Generate SVG path for the graph
  const generatePath = (): string => {
    if (history.length < 2) return "";
    
    const width = 800;
    const height = 120;
    const padding = 10;
    
    const minDb = Math.min(...history);
    const maxDbVal = Math.max(...history);
    const range = maxDbVal - minDb || 1;
    
    const points = history.map((db, i) => {
      const x = padding + (i / (history.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((db - minDb) / range) * (height - 2 * padding);
      return `${x},${y}`;
    });
    
    return `M ${points.join(" L ")}`;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 py-12">
      {/* Main dB value */}
      <div className="text-center mb-12">
        <span className="text-[12rem] md:text-[16rem] lg:text-[20rem] font-bold leading-none tracking-tighter">
          {formatValue(currentDb)}
        </span>
        <span className="text-4xl md:text-5xl lg:text-6xl font-light ml-4 text-muted-foreground">
          dB
        </span>
      </div>

      {/* Max and Average values */}
      <div className="text-center space-y-2 mb-16">
        <p className="text-2xl md:text-3xl lg:text-4xl text-muted-foreground">
          Max: <span className="text-foreground font-medium">{formatValue(maxDb)}</span> dB
        </p>
        <p className="text-2xl md:text-3xl lg:text-4xl text-muted-foreground">
          Medel: <span className="text-foreground font-medium">{formatValue(avgDb)}</span> dB
        </p>
      </div>

      {/* Graph */}
      {showGraph && history.length > 1 && (
        <div className="w-full max-w-4xl mb-16">
          <svg
            viewBox="0 0 800 120"
            className="w-full h-auto"
            preserveAspectRatio="none"
          >
            <path
              d={generatePath()}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-foreground"
            />
          </svg>
        </div>
      )}

      {/* Timer during measurement */}
      {isActive && (
        <p className="text-xl md:text-2xl text-muted-foreground mb-8">
          {timeLeft}s
        </p>
      )}

      {/* Start button */}
      <button
        onClick={startMeasurement}
        disabled={isActive}
        className="px-8 py-4 text-xl md:text-2xl border border-foreground text-foreground bg-transparent hover:bg-foreground hover:text-background transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-foreground"
      >
        Starta mätning (60s)
      </button>
    </div>
  );
};

export default SoundMeter;
