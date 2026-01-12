"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/lib/useIsMobile";

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InfoModal({ isOpen, onClose }: InfoModalProps) {
  const isMobile = useIsMobile();

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[100] bg-[#0a0a12]/90 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className={`fixed z-[101] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${
              isMobile ? "w-[90vw] max-h-[85vh]" : "w-[560px] max-h-[80vh]"
            } overflow-y-auto rounded-2xl`}
            style={{
              background: "linear-gradient(135deg, rgba(20,20,30,0.95) 0%, rgba(15,15,25,0.98) 100%)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            {/* Top highlight */}
            <div
              className="absolute inset-x-0 top-0 h-px rounded-t-2xl"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)",
              }}
            />

            {/* Close button */}
            <button
              onClick={onClose}
              className={`absolute ${isMobile ? "top-4 right-4" : "top-6 right-6"} p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-all duration-200`}
              aria-label="Close"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Content */}
            <div className={isMobile ? "!p-6 !pt-14" : "!p-10 !pt-12"}>
              {/* Title */}
              <h2 className={`${isMobile ? "!text-2xl" : "!text-3xl"} !font-light !text-white/90 !tracking-wide !mb-2`}>
                ourfeelings.art
              </h2>
              <p className="!text-white/40 !text-sm !font-light !italic !mb-8">
                a river of collective emotion
              </p>

              {/* Section: Social Artwork */}
              <section className="!mb-8">
                <h3 className="!text-white/70 !text-sm !font-medium !tracking-wide !uppercase !mb-3">
                  Social Artwork
                </h3>
                <p className="!text-white/50 !text-sm !leading-relaxed !font-light">
                  Each ribbon flowing across your screen represents a feeling shared by someone, somewhere in the world.
                  Together, they form a living canvas of human emotion that breathes and shifts as people contribute
                  their feelings throughout the day.
                </p>
              </section>

              {/* Section: Vitality System */}
              <section className="!mb-8">
                <h3 className="!text-white/70 !text-sm !font-medium !tracking-wide !uppercase !mb-3">
                  Vitality & Impact
                </h3>
                <p className="!text-white/50 !text-sm !leading-relaxed !font-light !mb-4">
                  Fresh feelings enter the river bold and bright, flowing with energy. As they age,
                  their vitality gradually fades&mdash;ribbons grow thinner, softer, slower&mdash;until
                  they become gentle whispers before drifting away.
                </p>
                <div
                  className="!rounded-xl !p-4"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="!grid !grid-cols-2 !gap-3 !text-xs">
                    <div className="!text-white/40">
                      <span className="!text-white/60 !font-medium">New feelings:</span>
                      <br />bright, thick, fast-flowing
                    </div>
                    <div className="!text-white/40">
                      <span className="!text-white/60 !font-medium">Aged feelings:</span>
                      <br />faded, thin, slow-drifting
                    </div>
                  </div>
                </div>
              </section>

              {/* Section: Lifecycle */}
              <section className="!mb-8">
                <h3 className="!text-white/70 !text-sm !font-medium !tracking-wide !uppercase !mb-3">
                  Lifecycle of a Ribbon
                </h3>
                <div className="!space-y-3">
                  <div className="!flex !gap-3 !items-start">
                    <span className="!text-white/30 !text-xs !font-medium !w-12 !shrink-0 !tabular-nums">0h</span>
                    <p className="!text-white/50 !text-sm !font-light">
                      A feeling is shared and fades into the river over 3 seconds
                    </p>
                  </div>
                  <div className="!flex !gap-3 !items-start">
                    <span className="!text-white/30 !text-xs !font-medium !w-12 !shrink-0 !tabular-nums">1h</span>
                    <p className="!text-white/50 !text-sm !font-light">
                      After an hour, you can update your feeling to a new emotion
                    </p>
                  </div>
                  <div className="!flex !gap-3 !items-start">
                    <span className="!text-white/30 !text-xs !font-medium !w-12 !shrink-0 !tabular-nums">7 days</span>
                    <p className="!text-white/50 !text-sm !font-light">
                      The ribbon completes its journey, fading away completely
                    </p>
                  </div>
                </div>
              </section>

              {/* Footer */}
              <div
                className="!mt-8 !pt-6"
                style={{
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div className="!flex !flex-col !items-center !gap-3">
                  <p className="!text-white/30 !text-xs !font-light !text-center">
                    created by{" "}
                    <a
                      href="https://github.com/tmttn"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="!text-white/50 hover:!text-white/70 !transition-colors !duration-200"
                    >
                      Tom Metten
                    </a>
                  </p>
                  {!isMobile && (
                    <p className="!text-white/20 !text-xs !font-light">
                      press <kbd className="!px-1.5 !py-0.5 !rounded !bg-white/5 !text-white/40 !font-mono !text-[10px]">esc</kbd> to close
                    </p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
