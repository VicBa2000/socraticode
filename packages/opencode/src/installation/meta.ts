declare global {
  const SOCRATICODE_VERSION: string
  const SOCRATICODE_CHANNEL: string
}

export const VERSION = typeof SOCRATICODE_VERSION === "string" ? SOCRATICODE_VERSION : "local"
export const CHANNEL = typeof SOCRATICODE_CHANNEL === "string" ? SOCRATICODE_CHANNEL : "local"
