import type { Component } from 'vue';
import type { NavGuard } from '~~/types/extensions';

export interface UserMenuRecord {
  id: string;
  order: number;
  title: string;
  to: string;
  icon: Component;
  guard?: NavGuard;
}
