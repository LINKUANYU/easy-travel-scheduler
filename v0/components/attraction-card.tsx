"use client"

import { useState } from "react"
import { Check, Plus } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { ImageCarousel } from "@/components/image-carousel"
import type { Attraction } from "@/lib/attractions-data"

interface AttractionCardProps {
  attraction: Attraction
}

export function AttractionCard({ attraction }: AttractionCardProps) {
  const [isAdded, setIsAdded] = useState(false)

  const tags = attraction.geo_tags.split(",").map((tag) => tag.trim())

  return (
    <motion.article
      whileHover={{ y: -6, boxShadow: "0 20px 40px -12px rgba(0,0,0,0.12)" }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="group relative flex-shrink-0 w-[320px] md:w-[360px] rounded-2xl bg-card shadow-md overflow-hidden cursor-pointer border border-border/50"
    >
      <div className="relative">
        <ImageCarousel images={attraction.images} alt={attraction.attraction} />

        <div className="absolute top-3 right-3 z-20">
          <motion.button
            onClick={() => setIsAdded(!isAdded)}
            whileTap={{ scale: 0.9 }}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium backdrop-blur-xl transition-colors duration-300 ${
              isAdded
                ? "bg-accent text-accent-foreground shadow-lg"
                : "bg-card/30 text-primary-foreground border border-primary-foreground/20 hover:bg-card/50"
            }`}
            aria-label={isAdded ? "Remove from trip" : "Add to trip"}
          >
            <AnimatePresence mode="wait">
              {isAdded ? (
                <motion.span
                  key="check"
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 180 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-1.5"
                >
                  <Check className="h-4 w-4" />
                  <span>{"已加入"}</span>
                </motion.span>
              ) : (
                <motion.span
                  key="plus"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  <span>{"加入行程"}</span>
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-5">
        <div>
          <h3 className="text-lg font-bold text-card-foreground leading-tight">
            {attraction.attraction}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground font-medium">
            {attraction.city}
          </p>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          {attraction.description}
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </motion.article>
  )
}
