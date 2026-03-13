interface BrandMarkProps {
  size?: "sm" | "md" | "lg"
  showWordmark?: boolean
}

const sizeClasses = {
  sm: {
    box: "w-8 h-8 rounded-lg",
    text: "text-sm",
    label: "text-base"
  },
  md: {
    box: "w-9 h-9 rounded-xl",
    text: "text-base",
    label: "text-lg"
  },
  lg: {
    box: "w-10 h-10 rounded-xl",
    text: "text-base",
    label: "text-xl"
  }
} as const

export default function BrandMark({
  size = "sm",
  showWordmark = true
}: BrandMarkProps) {
  const classes = sizeClasses[size]

  return (
    <div className="flex items-center gap-2.5">
      <div className={`${classes.box} bg-primary flex items-center justify-center shadow-sm`}>
        <span className={`text-white font-bold tracking-tight ${classes.text}`}>IW</span>
      </div>
      {showWordmark ? (
        <span className={`font-bold text-primary tracking-tight ${classes.label}`}>IWantJob</span>
      ) : null}
    </div>
  )
}
