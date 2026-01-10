"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EMOTIONS, type Emotion } from "@/lib/emotions";
import { useIsMobile } from "@/lib/useIsMobile";

interface EmotionPickerProps {
  onSelect: (emotion: Emotion) => void;
  disabled?: boolean;
  visible?: boolean;
  rateLimitSeconds?: number;
}

// Poetic messages for when the user is rate limited (main message)
const RATE_LIMIT_MESSAGES = [
  "your feeling drifts through",
  "your feeling wanders on",
  "your feeling floats gently",
  "your heart echoes softly",
  "your emotion ripples outward",
  "your feeling breathes here",
  "your spirit lingers still",
  "your feeling glows within",
  "your soul hums quietly",
  "your heart speaks softly",
  "your essence trails behind",
  "your feeling finds its way",
  "your warmth spreads slowly",
  "your light carries forward",
  "your presence remains",
  "your feeling takes root",
  "your heart leaves traces",
  "your emotion settles in",
  "your spirit flows onward",
  "your feeling blooms here",
];

// Poetic countdown messages (prefix before time)
const COUNTDOWN_MESSAGES = [
  "feel again in",
  "return in",
  "breathe again in",
  "the river awaits in",
  "flow once more in",
  "share again in",
  "drift back in",
  "reconnect in",
  "release again in",
  "express anew in",
  "let go again in",
  "the current returns in",
  "find stillness, then in",
  "patience, then in",
  "rest, then return in",
  "be still, then in",
  "wait gently for",
  "the moment comes in",
  "softly, in",
  "soon, in",
];

// Words that map to emotion colors (includes synonyms)
const EMOTION_WORDS: Record<string, string> = {
  // Joy - golden yellow
  joy: "joy", joyful: "joy", happy: "joy", happiness: "joy", golden: "joy", bright: "joy", light: "joy", radiant: "joy", sunny: "joy", brightens: "joy",
  // Calm - soft blue
  calm: "calm", peace: "calm", peaceful: "calm", serene: "calm", still: "calm", stillness: "calm", quiet: "calm", tranquil: "calm", blue: "calm", shores: "calm",
  // Love - soft pink
  love: "love", loving: "love", tender: "love", tenderness: "love", warm: "love", warmth: "love", gentle: "love", affection: "love", rose: "love", "rose-tinted": "love", warms: "love", softens: "love",
  // Hope - lavender
  hope: "hope", hopeful: "hope", dreams: "hope", dream: "hope", violet: "hope", wonder: "hope", wishing: "hope", longing: "hope", aspire: "hope", blooms: "hope",
  // Melancholy - deep indigo
  melancholy: "melancholy", sorrow: "melancholy", sadness: "melancholy", sad: "melancholy", wistful: "melancholy", indigo: "melancholy", deep: "melancholy",
  // Anxious - warm orange
  anxious: "anxious", worry: "anxious", restless: "anxious", uneasy: "anxious", nervous: "anxious", racing: "anxious", flutter: "anxious", orange: "anxious", chaos: "anxious", waves: "anxious",
};

// Poetic phrases grouped by emotion - we cycle through emotions before repeating
const LEGEND_PHRASES_BY_EMOTION: Record<string, string[]> = {
  joy: [
    "joy is golden, fleeting, bright",
    "sometimes joy arrives unannounced",
    "joy hums beneath the surface",
    "even small joys leave light behind",
    "joy needs no reason",
  ],
  calm: [
    "calm settles like dust after rain",
    "in stillness, we find ourselves",
    "peace is not the absence of noise",
    "calm waters run deep",
    "stillness speaks its own language",
  ],
  love: [
    "love asks for nothing in return",
    "we carry warmth we cannot name",
    "tenderness is its own kind of strength",
    "love lingers long after words fade",
    "some warmth never leaves us",
  ],
  hope: [
    "hope is a violet thread in the dark",
    "we dream because we must",
    "longing keeps us reaching forward",
    "even now, something blooms",
    "wonder lives in small moments",
  ],
  melancholy: [
    "melancholy has its own beauty",
    "sorrow too deserves a place here",
    "some sadness is just love with nowhere to go",
    "the deep places hold us too",
    "even grief is a kind of holding on",
  ],
  anxious: [
    "restless minds still belong",
    "worry is just love turned inward",
    "the anxious heart beats loudest",
    "racing thoughts eventually slow",
    "even chaos finds its rhythm",
  ],
};

// Emotion order for cycling - ensures all 6 emotions shown before repeating
const EMOTION_ORDER = ["joy", "calm", "love", "hope", "melancholy", "anxious"];

// Get legend phrase - cycles through all emotions before repeating any
// Changes every 8 seconds (faster than other messages)
function getRandomLegendPhrase(): string {
  const cycleTime = 8000; // 8 seconds per phrase
  const now = Date.now();
  const emotionIndex = Math.floor(now / cycleTime) % EMOTION_ORDER.length;
  const emotionId = EMOTION_ORDER[emotionIndex];
  const phrases = LEGEND_PHRASES_BY_EMOTION[emotionId];
  // Pick a phrase within this emotion based on a longer cycle
  const phraseIndex = Math.floor(now / (cycleTime * EMOTION_ORDER.length)) % phrases.length;
  return phrases[phraseIndex];
}

// Get a consistent random message based on timestamp (changes every few minutes)
function getRandomMessage(messages: string[], offsetMinutes: number = 0): string {
  const index = Math.floor((Date.now() + offsetMinutes * 60000) / 180000) % messages.length;
  return messages[index];
}

// Format seconds into a poetic time string
function formatTimeRemaining(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    if (minutes > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${hours} hour${hours > 1 ? "s" : ""}`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  }
  return `${seconds} second${seconds > 1 ? "s" : ""}`;
}

// Smooth fade transition for text changes
const textTransition = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 1.5, ease: "easeInOut" as const },
};

export default function EmotionPicker({
  onSelect,
  disabled,
  visible = true,
  rateLimitSeconds = 0,
}: EmotionPickerProps) {
  const isMobile = useIsMobile();
  const [hoveredEmotion, setHoveredEmotion] = useState<Emotion | null>(null);
  const [selectedEmotion, setSelectedEmotion] = useState<Emotion | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [rateLimitMessage, setRateLimitMessage] = useState(getRandomMessage(RATE_LIMIT_MESSAGES));
  const [countdownMessage, setCountdownMessage] = useState(getRandomMessage(COUNTDOWN_MESSAGES, 7));
  const [legendPhrase, setLegendPhrase] = useState(getRandomLegendPhrase());

  // Clear confirmation when rate limit kicks in
  useEffect(() => {
    if (rateLimitSeconds > 0) {
      setShowConfirmation(false);
      setSelectedEmotion(null);
    }
  }, [rateLimitSeconds]);

  // Update rate limit messages periodically with smooth transitions
  useEffect(() => {
    if (rateLimitSeconds <= 0) return;

    const interval = setInterval(() => {
      const newRateLimit = getRandomMessage(RATE_LIMIT_MESSAGES);
      const newCountdown = getRandomMessage(COUNTDOWN_MESSAGES, 7);
      const newLegend = getRandomLegendPhrase();

      if (newRateLimit !== rateLimitMessage) setRateLimitMessage(newRateLimit);
      if (newCountdown !== countdownMessage) setCountdownMessage(newCountdown);
      if (newLegend !== legendPhrase) setLegendPhrase(newLegend);
    }, 1000);

    return () => clearInterval(interval);
  }, [rateLimitSeconds, rateLimitMessage, countdownMessage, legendPhrase]);

  const handleSelect = (emotion: Emotion) => {
    setSelectedEmotion(emotion);
    setShowConfirmation(true);
    onSelect(emotion);

    // Note: Don't reset state here - let the useEffect handle it when rateLimitSeconds kicks in
    // This prevents the picker from briefly showing again before rate-limit message appears
  };

  const isHovered = (emotion: Emotion) => hoveredEmotion?.id === emotion.id;

  // Calculate arch positions for 6 dots (desktop) or grid positions (mobile)
  const getArchPosition = (index: number, total: number) => {
    if (isMobile) {
      // 2x3 grid layout for mobile with labels
      const col = index % 3;
      const row = Math.floor(index / 3);
      const spacingX = 80; // Horizontal spacing
      const spacingY = 100; // Vertical spacing (extra room for labels)
      const x = (col - 1) * spacingX; // -80, 0, 80
      const y = row * spacingY; // 0, 100
      return { x, y };
    }

    // Desktop: Rainbow arc - center higher (smaller y), edges lower (larger y)
    const totalWidth = 400;
    const arcHeight = 20;
    const x = (index / (total - 1)) * totalWidth - totalWidth / 2;
    const normalizedX = x / (totalWidth / 2);
    const y = arcHeight * normalizedX * normalizedX;
    return { x, y };
  };

  // Layout dimensions based on device
  // Mobile: taller to accommodate labels below dots (2 rows * 100px spacing + button height ~84px)
  const layout = isMobile
    ? { width: 280, height: 200, labelTop: 160, centerX: 140 }
    : { width: 480, height: 140, labelTop: 85, centerX: 240 };

  // Dot sizes based on device
  const dotSize = isMobile ? 44 : 36;
  const dotSizeHovered = isMobile ? 52 : 48;
  const buttonSize = isMobile ? 56 : 64;

  return (
    <motion.div
      className={`fixed left-1/2 -translate-x-1/2 z-10 ${isMobile ? "bottom-6" : "bottom-8"}`}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.8 }}
    >
      <AnimatePresence mode="wait">
        {rateLimitSeconds > 0 ? (
          <motion.div
            key="rate-limit"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`text-center ${isMobile ? "px-6 max-w-[300px]" : ""}`}
          >
            <div className={`flex items-center justify-center ${isMobile ? "min-h-[48px]" : "h-8"}`}>
              <AnimatePresence mode="wait">
                <motion.p
                  key={rateLimitMessage}
                  className={`tracking-widest font-light text-white/40 ${isMobile ? "text-base leading-relaxed" : "text-2xl"}`}
                  {...textTransition}
                >
                  {rateLimitMessage}
                </motion.p>
              </AnimatePresence>
            </div>
            <div className={`flex items-center justify-center ${isMobile ? "flex-col mt-2 space-y-1" : "h-7 mt-3"}`}>
              <AnimatePresence mode="wait">
                <motion.span
                  key={countdownMessage}
                  className={`text-white/30 tracking-wide font-light ${isMobile ? "text-sm" : "text-lg"}`}
                  {...textTransition}
                >
                  {countdownMessage}
                </motion.span>
              </AnimatePresence>
              <span className={`text-white/30 tracking-wide font-light ${isMobile ? "text-sm" : "text-lg"}`}>
                {isMobile ? "" : "\u00A0"}{formatTimeRemaining(rateLimitSeconds)}
              </span>
            </div>
            {/* Color legend - poetic phrase with emotion words in their colors */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className={`text-center ${isMobile ? "mt-4 px-4" : "mt-5"}`}
            >
              <AnimatePresence mode="wait">
                <motion.p
                  key={legendPhrase}
                  className={`font-light italic tracking-wide ${isMobile ? "text-base" : "text-xl"}`}
                  {...textTransition}
                >
                  {legendPhrase.split(/(\s+|,|—)/).map((word, index) => {
                    const cleanWord = word.toLowerCase().trim();
                    const emotionId = EMOTION_WORDS[cleanWord];
                    const emotion = emotionId ? EMOTIONS.find(e => e.id === emotionId) : null;
                    return (
                      <span
                        key={index}
                        style={{ color: emotion ? `${emotion.color}cc` : 'rgba(255,255,255,0.5)' }}
                      >
                        {word}
                      </span>
                    );
                  })}
                </motion.p>
              </AnimatePresence>
            </motion.div>
          </motion.div>
        ) : showConfirmation && selectedEmotion ? (
          <motion.p
            key="confirmation"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`tracking-widest text-center font-light ${isMobile ? "text-xl" : "text-2xl"}`}
            style={{ color: selectedEmotion.color }}
          >
            {selectedEmotion.label}
          </motion.p>
        ) : (
          <motion.div
            key="picker"
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative"
            style={{ width: layout.width, height: layout.height }}
          >
            {/* Label - centered below the dots (desktop only, mobile shows labels under each dot) */}
            {!isMobile && (
              <motion.div
                className="absolute left-1/2 -translate-x-1/2 text-center pointer-events-none"
                style={{ top: layout.labelTop }}
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  visible: { opacity: 1, y: 0, transition: { delay: 0.2, duration: 0.3 } },
                  exit: { opacity: 0, y: 10, transition: { duration: 0.2 } },
                }}
              >
                <AnimatePresence mode="wait">
                  <motion.p
                    key={hoveredEmotion?.id || "default"}
                    className="tracking-widest whitespace-nowrap font-light text-2xl"
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: 1,
                      color: hoveredEmotion ? hoveredEmotion.color : "rgba(255,255,255,0.3)",
                    }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    {hoveredEmotion ? hoveredEmotion.label : "how do you feel?"}
                  </motion.p>
                </AnimatePresence>
              </motion.div>
            )}

            {/* Dots - arch on desktop, 2x3 grid on mobile */}
            {EMOTIONS.map((emotion, index) => {
              const pos = getArchPosition(index, EMOTIONS.length);
              const centerIndex = (EMOTIONS.length - 1) / 2;
              const distanceFromCenter = Math.abs(index - centerIndex);
              const exitDelay = (centerIndex - distanceFromCenter) * 0.04;

              return (
                <motion.button
                  key={emotion.id}
                  onClick={() => handleSelect(emotion)}
                  onMouseEnter={() => !isMobile && setHoveredEmotion(emotion)}
                  onMouseLeave={() => !isMobile && setHoveredEmotion(null)}
                  disabled={disabled}
                  className={`absolute flex ${isMobile ? "flex-col" : ""} items-center justify-center`}
                  style={{
                    left: layout.centerX + pos.x - buttonSize / 2,
                    top: pos.y,
                    width: buttonSize,
                    height: isMobile ? buttonSize + 28 : buttonSize, // Extra height for label on mobile
                  }}
                  variants={{
                    hidden: { opacity: 0, scale: 0 },
                    visible: {
                      opacity: 1,
                      scale: 1,
                      transition: {
                        delay: index * 0.06,
                        type: "spring",
                        stiffness: 300,
                        damping: 20,
                      },
                    },
                    exit: {
                      opacity: 0,
                      scale: 0,
                      transition: {
                        delay: exitDelay,
                        duration: 0.2,
                        ease: "easeIn",
                      },
                    },
                  }}
                >
                  {/* Dot with layered box-shadow glow */}
                  <motion.div
                    className="rounded-full"
                    style={{
                      backgroundColor: emotion.color,
                      boxShadow: isHovered(emotion)
                        ? `0 0 20px 8px ${emotion.color}, 0 0 40px 16px ${emotion.color}80, 0 0 60px 24px ${emotion.color}40`
                        : `0 0 15px 4px ${emotion.color}90`,
                    }}
                    initial={false}
                    animate={{
                      width: isHovered(emotion) ? dotSizeHovered : dotSize,
                      height: isHovered(emotion) ? dotSizeHovered : dotSize,
                    }}
                    transition={{ duration: 0.15 }}
                    whileTap={{ scale: 0.85 }}
                  />
                  {/* Label below dot on mobile */}
                  {isMobile && (
                    <span
                      className="text-sm mt-2 font-light tracking-wide whitespace-nowrap"
                      style={{ color: `${emotion.color}dd` }}
                    >
                      {emotion.label}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
