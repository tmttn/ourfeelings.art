"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/lib/useIsMobile";

interface AmbientInfoProps {
  feelingsCount: number;
  visible?: boolean;
}

// Moody, poetic time-of-day messages
const MOODY_MESSAGES: Record<string, string[]> = {
  lateNight: [
    "the world sleeps softly",
    "in the quiet hours",
    "when dreams drift by",
    "beneath the silent stars",
    "the night holds secrets",
    "stillness wraps around",
    "the hours stretch thin",
    "shadows rest easy",
    "between yesterday and tomorrow",
    "the clock forgets itself",
    "silence has weight here",
    "the void hums gently",
    "thoughts float untethered",
    "the darkness breathes slow",
    "everything waits",
    "the moon keeps watch",
    "time dissolves here",
    "whispers in the dark",
    "solitude feels warm",
    "the night understands",
    "nothing stirs but thoughts",
    "peace lives in shadows",
    "the hours pass unnoticed",
    "quiet holds everything",
    "secrets safe in darkness",
  ],
  earlyMorning: [
    "before the world wakes",
    "in the gentle dark",
    "as dawn approaches",
    "the sky begins to breathe",
    "stillness before light",
    "the first birds stir",
    "night loosens its grip",
    "the horizon softens",
    "a hush before beginning",
    "the air tastes new",
    "shadows start to fade",
    "promise in the dark",
    "the earth slowly turns",
    "quiet anticipation",
    "between sleep and wake",
    "the world holds its breath",
    "colors wait to bloom",
    "dawn prepares itself",
    "the sky remembers light",
    "possibility stirs",
    "silence before birdsong",
    "the edge of something new",
    "darkness yields gently",
    "morning approaches softly",
    "a fresh page turning",
  ],
  morning: [
    "the light is young",
    "a fresh beginning",
    "morning unfolds",
    "dew still glistens",
    "possibilities awaken",
    "the day stretches ahead",
    "golden light spills in",
    "everything feels possible",
    "the world wakes gently",
    "soft edges everywhere",
    "hope rises with sun",
    "newness in the air",
    "time moves kindly",
    "the sky opens up",
    "beginnings everywhere",
    "coffee steam rises",
    "the earth stretches awake",
    "light touches everything",
    "plans take shape",
    "gentle energy builds",
    "the day greets you",
    "freshness fills the air",
    "dreams meet reality",
    "warmth finds its way in",
    "optimism glows softly",
  ],
  midday: [
    "the sun holds high",
    "in the bright hours",
    "day at its fullest",
    "light everywhere",
    "the world is awake",
    "warmth fills the air",
    "shadows hide beneath",
    "energy hums around",
    "life in full motion",
    "the sky blazes blue",
    "moments feel endless",
    "clarity in the light",
    "the day peaks softly",
    "everything visible",
    "presence feels easy",
    "the sun pauses above",
    "brightness surrounds",
    "time stands still briefly",
    "the world at full volume",
    "heat shimmers gently",
    "noon holds steady",
    "shadows retreat",
    "the day at its peak",
    "light fills every corner",
    "vitality pulses through",
  ],
  afternoon: [
    "the day softens",
    "golden hours approach",
    "afternoon lingers",
    "shadows grow longer",
    "time slows gently",
    "warmth begins to fade",
    "the light turns amber",
    "a gentle winding down",
    "peace settles slowly",
    "the rush subsides",
    "quiet productivity",
    "hours drift past",
    "contentment arrives",
    "the world exhales",
    "softness everywhere",
    "tasks find completion",
    "light mellows kindly",
    "the pace eases",
    "gentle satisfaction",
    "stillness approaches",
    "the day reflects",
    "amber light spills",
    "thoughts settle down",
    "comfort in routine",
    "evening beckons softly",
  ],
  evening: [
    "the sky turns gentle",
    "day releases its hold",
    "twilight whispers",
    "colors fade to soft",
    "peace settles in",
    "the light says goodbye",
    "purple hues emerge",
    "a tender transition",
    "rest approaches",
    "the day remembers itself",
    "everything slows",
    "gratitude lingers",
    "the world grows tender",
    "soft endings arrive",
    "comfort in the dusk",
    "the sky paints itself",
    "day surrenders gently",
    "shadows lengthen kindly",
    "warmth fades to cool",
    "evening wraps around",
    "the pace becomes still",
    "reflection time arrives",
    "gold turns to purple",
    "the day lets go",
    "quietude descends",
  ],
  night: [
    "darkness embraces",
    "the stars appear",
    "night has arrived",
    "the world grows quiet",
    "moon watches over",
    "the sky deepens",
    "stillness settles",
    "dreams begin to form",
    "the night unfolds",
    "peace in the dark",
    "stars tell stories",
    "the universe expands",
    "quiet contemplation",
    "the night holds you",
    "infinity above",
    "darkness comforts",
    "the cosmos awakens",
    "rest beckons softly",
    "night creatures stir",
    "the world turns inward",
    "shadows become friends",
    "starlight guides thoughts",
    "the night breathes deep",
    "mystery surrounds",
    "peace in the vastness",
  ],
};

// Poetic suffixes for feelings count
const FEELINGS_SUFFIXES = [
  "flowing",
  "drifting",
  "wandering",
  "floating",
  "glowing",
  "breathing",
  "passing through",
  "in the current",
  "in motion",
  "adrift",
  "in the stream",
  "in the river",
  "finding their way",
  "carried along",
  "moving softly",
  "traveling on",
  "on the wind",
  "in the ether",
  "present here",
  "among us",
];

function getMoodyMessage(): string {
  const hour = new Date().getHours();
  let period: string;

  if (hour >= 0 && hour < 4) period = "lateNight";
  else if (hour >= 4 && hour < 6) period = "earlyMorning";
  else if (hour >= 6 && hour < 11) period = "morning";
  else if (hour >= 11 && hour < 14) period = "midday";
  else if (hour >= 14 && hour < 17) period = "afternoon";
  else if (hour >= 17 && hour < 21) period = "evening";
  else period = "night";

  const messages = MOODY_MESSAGES[period];
  // Use minutes to pick a message that changes every ~4 minutes
  const index = Math.floor(new Date().getMinutes() / 4) % messages.length;
  return messages[index];
}

function getFeelingSuffix(): string {
  // Use a different offset so it doesn't change at the same time as moody message
  const index = Math.floor((Date.now() + 120000) / 300000) % FEELINGS_SUFFIXES.length;
  return FEELINGS_SUFFIXES[index];
}

function formatTime(): string {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes}${ampm}`;
}

// Smooth fade transition for text changes
const textTransition = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 1.5, ease: "easeInOut" as const },
};

export default function AmbientInfo({ feelingsCount, visible = true }: AmbientInfoProps) {
  const isMobile = useIsMobile();
  const [moodyMessage, setMoodyMessage] = useState(getMoodyMessage());
  const [feelingSuffix, setFeelingSuffix] = useState(getFeelingSuffix());
  const [time, setTime] = useState(formatTime());

  // Update messages periodically with smooth transitions
  useEffect(() => {
    const interval = setInterval(() => {
      const newMoody = getMoodyMessage();
      const newSuffix = getFeelingSuffix();
      const newTime = formatTime();

      if (newMoody !== moodyMessage) setMoodyMessage(newMoody);
      if (newSuffix !== feelingSuffix) setFeelingSuffix(newSuffix);
      if (newTime !== time) setTime(newTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [moodyMessage, feelingSuffix, time]);

  // Mobile: single compact element in top-left
  if (isMobile) {
    return (
      <motion.div
        className="fixed top-4 left-4 pointer-events-none select-none"
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: 0.8 }}
      >
        <div className="text-white/40 text-sm tracking-wide font-light">
          <span className="tabular-nums text-white/50">{feelingsCount}</span>
          <span className="text-white/30"> feelings</span>
        </div>
      </motion.div>
    );
  }

  // Desktop: full layout with feelings count (bottom-left) and time/mood (bottom-right)
  return (
    <>
      {/* Feelings count - bottom left */}
      <motion.div
        className="fixed bottom-10 left-10 pointer-events-none select-none"
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: 0.8 }}
      >
        <div className="text-white/40 text-xl tracking-wide font-light flex items-baseline">
          <span className="tabular-nums text-white/60">{feelingsCount}&nbsp;</span>
          <span>{feelingsCount === 1 ? "feeling" : "feelings"}&nbsp;</span>
          <AnimatePresence mode="wait">
            <motion.span
              key={feelingSuffix}
              {...textTransition}
            >
              {feelingSuffix}
            </motion.span>
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Time and mood - bottom right */}
      <motion.div
        className="fixed bottom-10 right-10 pointer-events-none select-none text-right"
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: 0.8 }}
      >
        <div className="text-white/40 text-xl tracking-wide font-light flex items-baseline justify-end">
          <AnimatePresence mode="wait">
            <motion.span
              key={time}
              className="tabular-nums text-white/60"
              {...textTransition}
            >
              {time}
            </motion.span>
          </AnimatePresence>
          <span className="text-white/20">&nbsp;/&nbsp;</span>
          <AnimatePresence mode="wait">
            <motion.span
              key={moodyMessage}
              className="italic text-white/50"
              {...textTransition}
            >
              {moodyMessage}
            </motion.span>
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}
