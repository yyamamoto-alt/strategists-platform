"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, Pause, Square, Play } from "lucide-react";

interface TextToSpeechProps {
  contentRef: React.RefObject<HTMLDivElement | null>;
}

export function TextToSpeech({ contentRef }: TextToSpeechProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [rate, setRate] = useState(1.0);
  const [showToolbar, setShowToolbar] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const isMountedRef = useRef(true);

  // Check browser support
  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (isSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isSupported]);

  const getJapaneseVoice = useCallback((): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices();
    const jaVoice = voices.find((v) => v.lang.startsWith("ja"));
    return jaVoice ?? voices[0] ?? null;
  }, []);

  const handlePlay = useCallback(() => {
    if (!isSupported) return;

    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    const text = contentRef.current?.innerText;
    if (!text) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getJapaneseVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "ja-JP";
    }
    utterance.rate = rate;

    utterance.onend = () => {
      if (isMountedRef.current) {
        setIsPlaying(false);
        setIsPaused(false);
        setShowToolbar(false);
      }
    };

    utterance.onerror = () => {
      if (isMountedRef.current) {
        setIsPlaying(false);
        setIsPaused(false);
        setShowToolbar(false);
      }
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
    setIsPaused(false);
    setShowToolbar(true);
  }, [isSupported, isPaused, contentRef, getJapaneseVoice, rate]);

  const handlePause = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.pause();
    setIsPlaying(false);
    setIsPaused(true);
  }, [isSupported]);

  const handleStop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setIsPlaying(false);
    setIsPaused(false);
    setShowToolbar(false);
  }, [isSupported]);

  const handleRateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newRate = parseFloat(e.target.value);
      setRate(newRate);

      // If currently speaking, restart with new rate
      if (isPlaying && !isPaused) {
        window.speechSynthesis.cancel();
        const text = contentRef.current?.innerText;
        if (!text) return;

        const utterance = new SpeechSynthesisUtterance(text);
        const voice = getJapaneseVoice();
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        } else {
          utterance.lang = "ja-JP";
        }
        utterance.rate = newRate;

        utterance.onend = () => {
          if (isMountedRef.current) {
            setIsPlaying(false);
            setIsPaused(false);
            setShowToolbar(false);
          }
        };

        utterance.onerror = () => {
          if (isMountedRef.current) {
            setIsPlaying(false);
            setIsPaused(false);
            setShowToolbar(false);
          }
        };

        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      }
    },
    [isPlaying, isPaused, contentRef, getJapaneseVoice]
  );

  if (!isSupported) {
    return null;
  }

  if (!showToolbar) {
    return (
      <button
        onClick={handlePlay}
        className="text-gray-400 hover:text-white transition-colors"
        aria-label="読み上げ"
        title="読み上げ"
      >
        <Volume2 size={18} />
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 bg-surface-elevated border border-white/10 rounded-lg px-3 py-1.5">
      {isPlaying ? (
        <button
          onClick={handlePause}
          className="text-gray-400 hover:text-white transition-colors"
          aria-label="一時停止"
          title="一時停止"
        >
          <Pause size={16} />
        </button>
      ) : (
        <button
          onClick={handlePlay}
          className="text-gray-400 hover:text-white transition-colors"
          aria-label="再生"
          title="再生"
        >
          <Play size={16} />
        </button>
      )}

      <button
        onClick={handleStop}
        className="text-gray-400 hover:text-white transition-colors"
        aria-label="停止"
        title="停止"
      >
        <Square size={16} />
      </button>

      <span className="text-xs text-gray-500">{rate.toFixed(1)}x</span>
      <input
        type="range"
        min="0.5"
        max="2.0"
        step="0.1"
        value={rate}
        onChange={handleRateChange}
        className="w-16 h-1"
        style={{ accentColor: "var(--color-brand, #6366f1)" }}
        aria-label="速度"
        title="速度"
      />
    </div>
  );
}
