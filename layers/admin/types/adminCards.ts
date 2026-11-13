import type { Component } from 'vue';

/** One entry of the `adminCards` nav menu, a link card on the `/admin` landing page. */
export interface AdminCardRecord {
  id: string;
  order: number;
  title: string;
  description: string;
  to: string;
  icon: Component;
  /** Tailwind classes for the icon tile, e.g. 'bg-blue-500/10' and 'text-blue-500'. */
  bgColor: string;
  textColor: string;
}
