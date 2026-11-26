import type { ClassValue } from 'clsx';
import type { Updater } from '@tanstack/vue-table';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { DateTime } from 'luxon';
import type { Ref } from 'vue';
import type { FormatDateInput, FormatDateOptions } from '~~/types/common';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function valueUpdater<T extends Updater<unknown>>(updaterOrValue: T, ref: Ref) {
  ref.value = typeof updaterOrValue === 'function' ? updaterOrValue(ref.value) : updaterOrValue;
}

export function formatNumber(
  value: number,
  locale: string,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatPercent(
  value: number,
  locale: string,
  options: Intl.NumberFormatOptions = {},
): string {
  return formatNumber(value, locale, {
    style: 'percent',
    maximumFractionDigits: 0,
    ...options,
  });
}

export function formatDate(
  value: FormatDateInput | null | undefined,
  locale: string,
  options: FormatDateOptions = {},
): string {
  const optionsWithDefaults: FormatDateOptions = hasDateFormatOptions(options)
    ? options
    : {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        ...options,
      };

  return formatDateValue(value, locale, optionsWithDefaults, 'date');
}

export function formatTime(
  value: FormatDateInput | null | undefined,
  locale: string,
  options: FormatDateOptions = {},
): string {
  const optionsWithDefaults: FormatDateOptions = hasDateFormatOptions(options)
    ? options
    : {
        hour: 'numeric',
        minute: '2-digit',
        ...options,
      };

  return formatDateValue(value, locale, optionsWithDefaults, 'time');
}

export function formatDateTime(
  value: FormatDateInput | null | undefined,
  locale: string,
  options: FormatDateOptions = {},
): string {
  const optionsWithDefaults: FormatDateOptions = hasDateFormatOptions(options)
    ? options
    : {
        dateStyle: 'medium',
        timeStyle: 'short',
        ...options,
      };

  return formatDateValue(value, locale, optionsWithDefaults, 'dateTime');
}

function hasDateFormatOptions(options: FormatDateOptions): boolean {
  return Object.keys(options).some((key) => key !== 'fallback');
}

function formatDateValue(
  value: FormatDateInput | null | undefined,
  locale: string,
  options: FormatDateOptions,
  formatter: 'date' | 'time' | 'dateTime',
): string {
  const { fallback = '', ...dateOptions } = options;
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  if (formatter === 'date') {
    return date.toLocaleDateString(locale, dateOptions);
  }

  if (formatter === 'time') {
    return date.toLocaleTimeString(locale, dateOptions);
  }

  return date.toLocaleString(locale, dateOptions);
}

/** Format dates in the active locale, using relative time within the given threshold. */
export function formatRelativeTime(
  date: Date | number | string,
  options: {
    /** Maximum time in days to show relative time (default: 7) */
    relativeDaysThreshold?: number;
    /** Locale for date formatting (defaults to the environment locale). */
    locale?: string;
    justNow?: string;
    inAMoment?: string;
  } = {},
): string {
  const { relativeDaysThreshold = 7, locale, justNow, inAMoment } = options;

  const dt = toDateTime(date);
  const localized = locale ? dt.setLocale(locale) : dt;
  const now = DateTime.now();
  const diffMillis = now.diff(dt).toMillis();
  const isFuture = diffMillis < 0;

  // Calculate diff in the correct direction
  const diff = isFuture
    ? dt.diff(now, ['days', 'hours', 'minutes', 'seconds'])
    : now.diff(dt, ['days', 'hours', 'minutes', 'seconds']);

  const { days, hours, minutes } = diff.toObject();

  // Within relative threshold
  if ((days ?? 0) < relativeDaysThreshold) {
    if ((minutes ?? 0) < 1 && (hours ?? 0) === 0 && (days ?? 0) === 0) {
      const label = isFuture ? inAMoment : justNow;
      if (label) return label;
    }
    if ((days ?? 0) === 0) return localized.toRelative({ base: now }) ?? '';
    return localized.toRelativeCalendar({ base: now }) ?? '';
  }

  return localized.toLocaleString(DateTime.DATE_MED);
}

/**
 * Convert various date inputs to Luxon DateTime
 */
function toDateTime(date: Date | number | string): DateTime {
  if (date instanceof Date) {
    return DateTime.fromJSDate(date);
  }
  if (typeof date === 'number') {
    return DateTime.fromMillis(date);
  }
  return DateTime.fromISO(date);
}
