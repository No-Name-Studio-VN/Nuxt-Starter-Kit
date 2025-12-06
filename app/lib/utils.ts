import type { ClassValue } from 'clsx'
import type { Updater } from '@tanstack/vue-table'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { DateTime } from 'luxon'
import type { Ref } from 'vue'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function valueUpdater<T extends Updater<unknown>>(updaterOrValue: T, ref: Ref) {
  ref.value = typeof updaterOrValue === 'function'
    ? updaterOrValue(ref.value)
    : updaterOrValue
}

/**
 * Format a date/time in a Facebook-like relative format using Luxon
 *
 * - Just now (< 1 minute)
 * - X minutes ago (1-59 minutes)
 * - X hours ago (1-23 hours)
 * - Yesterday at HH:MM
 * - Day at HH:MM (within the last week)
 * - MMM D (within the same year)
 * - MMM D, YYYY (different year)
 *
 * @param date - The date to format (Date object, timestamp, or ISO string)
 * @param options - Configuration options
 * @returns Formatted relative time string
 */
export function formatRelativeTime(
  date: Date | number | string,
  options: {
    /** Maximum time in days to show relative time (default: 7) */
    relativeDaysThreshold?: number
    /** Locale for date formatting (default: 'en-US') */
    locale?: string
  } = {},
): string {
  const {
    relativeDaysThreshold = 7,
    locale = 'en-US',
  } = options

  const dt = toDateTime(date)
  const now = DateTime.now()
  const diff = now.diff(dt, ['days', 'hours', 'minutes', 'seconds'])

  // Future dates - show absolute time
  if (diff.toMillis() < 0) {
    return formatAbsoluteDate(dt, now, locale)
  }

  const { days, hours, minutes } = diff.toObject()

  // Within relative threshold
  if ((days ?? 0) < relativeDaysThreshold) {
    // Just now (< 1 minute)
    if ((minutes ?? 0) < 1 && (hours ?? 0) === 0 && (days ?? 0) === 0) {
      return 'Just now'
    }

    // Minutes ago (< 1 hour)
    if ((hours ?? 0) < 1 && (days ?? 0) === 0) {
      const m = Math.floor(minutes ?? 0)
      return dt.toRelative({ locale, unit: 'minutes' }) ?? `${m} minute${m === 1 ? '' : 's'} ago`
    }

    // Hours ago (< 24 hours)
    if ((days ?? 0) < 1) {
      const h = Math.floor(hours ?? 0)
      return dt.toRelative({ locale, unit: 'hours' }) ?? `${h} hour${h === 1 ? '' : 's'} ago`
    }

    // Yesterday
    if (dt.hasSame(now.minus({ days: 1 }), 'day')) {
      return `Yesterday at ${dt.toFormat('h:mm a', { locale })}`
    }

    // Within last week (show day name)
    if ((days ?? 0) < 7) {
      return `${dt.toFormat('cccc', { locale })} at ${dt.toFormat('h:mm a', { locale })}`
    }
  }

  // Beyond threshold - show absolute date
  return formatAbsoluteDate(dt, now, locale)
}

/**
 * Convert various date inputs to Luxon DateTime
 */
function toDateTime(date: Date | number | string): DateTime {
  if (date instanceof Date) {
    return DateTime.fromJSDate(date)
  }
  if (typeof date === 'number') {
    return DateTime.fromMillis(date)
  }
  return DateTime.fromISO(date)
}

/**
 * Format an absolute date in Facebook style using Luxon "MMM D, YYYY" (e.g., "Nov 26, 2024")
 */
function formatAbsoluteDate(dt: DateTime, now: DateTime, locale: string) {
  return dt.toFormat('LLL d, yyyy', { locale })
}
