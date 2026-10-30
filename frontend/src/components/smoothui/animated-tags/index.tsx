"use client";

import { CircleX, Plus } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type React from "react";
import { useState } from "react";

// SLATE·SPACE addition: `compact` renders only the selected tags inline (active-filter chips), with `labels` for display text.
export interface AnimatedTagsProps {
  className?: string;
  compact?: boolean;
  labels?: Record<string, React.ReactNode>;
  initialTags?: string[];
  onChange?: (selected: string[]) => void;
  selectedTags?: string[];
}

export default function AnimatedTags({
  initialTags = ["react", "tailwindcss", "javascript"],
  selectedTags: controlledSelectedTags,
  onChange,
  className = "",
  compact = false,
  labels,
}: AnimatedTagsProps) {
  const [internalSelected, setInternalSelected] = useState<string[]>([]);
  const shouldReduceMotion = useReducedMotion();

  const selectedTag = controlledSelectedTags ?? internalSelected;
  const tags = initialTags.filter((tag) => !selectedTag.includes(tag));

  const handleTagClick = (tag: string) => {
    const newSelected = [...selectedTag, tag];
    if (onChange) {
      onChange(newSelected);
    } else {
      setInternalSelected(newSelected);
    }
  };
  const handleDeleteTag = (tag: string) => {
    const newSelectedTag = selectedTag.filter((selected) => selected !== tag);
    if (onChange) {
      onChange(newSelectedTag);
    } else {
      setInternalSelected(newSelectedTag);
    }
  };
  const enter = shouldReduceMotion ? { opacity: 1 } : { filter: "blur(0px)", opacity: 1, y: 0 };
  const from = shouldReduceMotion ? { opacity: 1 } : { filter: "blur(4px)", opacity: 0, y: 20 };
  const leave = shouldReduceMotion ? { opacity: 0, transition: { duration: 0 } } : { filter: "blur(4px)", opacity: 0, y: 20 };
  if (compact) {
    return (
      <div className={`flex flex-wrap items-center gap-1 ${className}`}>
        <AnimatePresence initial={false} mode="popLayout">
          {selectedTag.map((tag) => (
            <motion.button
              animate={enter}
              aria-label={`Remove filter ${typeof labels?.[tag] === "string" ? labels[tag] : tag}`}
              className="group flex cursor-pointer flex-row items-center justify-center gap-2 rounded-md border bg-primary px-2 py-1 text-primary-foreground"
              exit={leave}
              initial={from}
              key={tag}
              layout
              onClick={() => handleDeleteTag(tag)}
              transition={shouldReduceMotion ? { duration: 0 } : { bounce: 0, duration: 0.25, type: "spring" as const }}
              type="button"
            >
              {labels?.[tag] ?? tag}
              <CircleX className="ease flex items-center justify-center rounded-full transition-all duration-200" size={14} />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    );
  }
  return (
    <div className={`flex w-[300px] flex-col gap-4 p-4 ${className}`}>
      <div className="flex flex-col items-start justify-center gap-1">
        <p>Selected Tags</p>
        <AnimatePresence>
          <div className="flex min-h-12 w-full flex-wrap items-center gap-1 rounded-xl border bg-background p-2">
            {selectedTag?.map((tag) => (
              <motion.div
                animate={
                  shouldReduceMotion
                    ? { opacity: 1 }
                    : {
                        filter: "blur(0px)",
                        opacity: 1,
                        y: 0,
                      }
                }
                className="group flex cursor-pointer flex-row items-center justify-center gap-2 rounded-md border bg-primary px-2 py-1 text-primary-foreground group-hover:bg-primary group-hover:text-foreground"
                exit={
                  shouldReduceMotion
                    ? { opacity: 0, transition: { duration: 0 } }
                    : { filter: "blur(4px)", opacity: 0, y: 20 }
                }
                initial={
                  shouldReduceMotion
                    ? { opacity: 1 }
                    : { filter: "blur(4px)", opacity: 0, y: 20 }
                }
                key={tag}
                layout
                onClick={() => handleDeleteTag(tag)}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { bounce: 0, duration: 0.25, type: "spring" as const }
                }
              >
                {tag}{" "}
                <CircleX
                  className="ease flex items-center justify-center rounded-full transition-all duration-200"
                  size={16}
                />
              </motion.div>
            ))}
          </div>
        </AnimatePresence>
      </div>
      <AnimatePresence>
        <div className="flex flex-wrap items-center gap-1">
          {tags.map((tag) => (
            <motion.div
              animate={
                shouldReduceMotion
                  ? { opacity: 1 }
                  : {
                      filter: "blur(0px)",
                      opacity: 1,
                      y: 0,
                    }
              }
              className="group flex cursor-pointer flex-row items-center justify-center gap-2 rounded-md border bg-background px-2 py-1 text-primary-foreground"
              exit={
                shouldReduceMotion
                  ? { opacity: 0, transition: { duration: 0 } }
                  : { filter: "blur(4px)", opacity: 0, y: -20 }
              }
              initial={
                shouldReduceMotion
                  ? { opacity: 1 }
                  : { filter: "blur(4px)", opacity: 0, y: -20 }
              }
              key={tag}
              layout
              onClick={() => handleTagClick(tag)}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { bounce: 0, duration: 0.25, type: "spring" as const }
              }
            >
              {tag}{" "}
              <Plus
                className="ease @media (hover: hover) and (pointer: flex items-center justify-center rounded-full transition-all duration-200 fine):hover:bg-primary group-hover:text-foreground"
                size={16}
              />
            </motion.div>
          ))}
        </div>
      </AnimatePresence>
    </div>
  );
}
