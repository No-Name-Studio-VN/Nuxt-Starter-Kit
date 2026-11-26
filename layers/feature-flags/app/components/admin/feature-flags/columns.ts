import { h } from 'vue';
import type { ColumnDef, StockFeatures } from '@tanstack/vue-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ArrowUpDown, MoreHorizontal, Pencil, Power, PowerOff, Trash2 } from '@lucide/vue';
import type { DBFeatureFlag } from '#layers/feature-flags/types/featureFlags';

export function createColumns(
  t: (key: string, named?: Record<string, string>) => string,
  locale: string,
  formatPercent: (value: number) => string,
  onEdit: (flag: DBFeatureFlag) => void,
  onToggleEnabled: (flag: DBFeatureFlag) => void,
  onDelete: (flagKey: string) => void,
): ColumnDef<StockFeatures, DBFeatureFlag>[] {
  return [
    {
      accessorKey: 'key',
      header: ({ column }) => {
        return h(
          Button,
          {
            variant: 'ghost',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
          },
          () => [t('admin.flags.key'), h(ArrowUpDown, { class: 'ml-2 h-4 w-4' })],
        );
      },
      cell: ({ row }) => {
        const flag = row.original;
        return h('div', {}, [
          h('span', { class: 'font-semibold text-sm' }, flag.key),
          flag.description
            ? h(
                'span',
                { class: 'text-xs text-muted-foreground block mt-0.5 line-clamp-1' },
                flag.description,
              )
            : null,
        ]);
      },
    },
    {
      accessorKey: 'enabled',
      header: t('admin.flags.status'),
      cell: ({ row }) => {
        const flag = row.original;
        const status = getFlagStatus(flag);
        return h(Badge, { variant: status.variant }, () =>
          t(status.label, { percent: formatPercent(flag.rolloutPct) }),
        );
      },
    },
    {
      accessorKey: 'rolloutPct',
      header: t('admin.flags.rollout'),
      cell: ({ row }) => {
        const pct = row.original.rolloutPct;
        return h('div', { class: 'flex items-center gap-2' }, [
          h('div', { class: 'h-2 w-16 rounded-full bg-muted overflow-hidden' }, [
            h('div', {
              class: 'h-full rounded-full transition-all bg-primary',
              style: { width: `${pct}%` },
            }),
          ]),
          h('span', { class: 'text-xs text-muted-foreground tabular-nums' }, formatPercent(pct)),
        ]);
      },
    },
    {
      accessorKey: 'owner',
      header: t('admin.flags.owner'),
      cell: ({ row }) => {
        const owner = row.original.owner;
        return h('span', { class: 'text-sm' }, owner || '—');
      },
    },
    {
      accessorKey: 'expiresAt',
      header: ({ column }) => {
        return h(
          Button,
          {
            variant: 'ghost',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
          },
          () => [t('admin.flags.expires'), h(ArrowUpDown, { class: 'ml-2 h-4 w-4' })],
        );
      },
      cell: ({ row }) => {
        const expiresAt = row.original.expiresAt;
        if (!expiresAt)
          return h('span', { class: 'text-sm text-muted-foreground' }, t('admin.flags.never'));
        const date = new Date(expiresAt);
        const isExpired = date < new Date();
        return h(
          'span',
          {
            class: `text-sm ${isExpired ? 'text-destructive' : 'text-muted-foreground'}`,
          },
          date.toLocaleDateString(locale),
        );
      },
    },
    {
      id: 'actions',
      header: t('data_table.actions'),
      cell: ({ row }) => {
        const flag = row.original;
        return h(
          DropdownMenu,
          {},
          {
            default: () => [
              h(
                DropdownMenuTrigger,
                { asChild: true },
                {
                  default: () =>
                    h(
                      Button,
                      { variant: 'ghost', class: 'h-8 w-8 p-0' },
                      {
                        default: () => [
                          h('span', { class: 'sr-only' }, t('data_table.open_menu')),
                          h(MoreHorizontal, { class: 'h-4 w-4' }),
                        ],
                      },
                    ),
                },
              ),
              h(
                DropdownMenuContent,
                { align: 'end' },
                {
                  default: () => [
                    h(
                      DropdownMenuItem,
                      { onClick: () => onEdit(flag) },
                      {
                        default: () =>
                          h('div', { class: 'flex items-center gap-2' }, [
                            h(Pencil, { class: 'h-4 w-4' }),
                            h('span', {}, t('data_table.edit')),
                          ]),
                      },
                    ),
                    h(
                      DropdownMenuItem,
                      { onClick: () => onToggleEnabled(flag) },
                      {
                        default: () =>
                          h('div', { class: 'flex items-center gap-2' }, [
                            h(flag.enabled ? PowerOff : Power, { class: 'h-4 w-4' }),
                            h(
                              'span',
                              {},
                              t(flag.enabled ? 'admin.flags.disable' : 'admin.flags.enable'),
                            ),
                          ]),
                      },
                    ),
                    h(
                      DropdownMenuItem,
                      { asChild: true },
                      {
                        default: () =>
                          h(
                            AlertDialog,
                            {},
                            {
                              default: () => [
                                h(
                                  AlertDialogTrigger,
                                  { asChild: true },
                                  {
                                    default: () =>
                                      h(
                                        'div',
                                        {
                                          class:
                                            'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 text-destructive focus:text-destructive',
                                          role: 'menuitem',
                                        },
                                        [
                                          h('div', { class: 'flex items-center gap-2' }, [
                                            h(Trash2, { class: 'h-4 w-4' }),
                                            h('span', {}, t('common.delete')),
                                          ]),
                                        ],
                                      ),
                                  },
                                ),
                                h(
                                  AlertDialogContent,
                                  {},
                                  {
                                    default: () => [
                                      h(
                                        AlertDialogHeader,
                                        {},
                                        {
                                          default: () => [
                                            h(AlertDialogTitle, {}, () =>
                                              t('admin.flags.delete_title'),
                                            ),
                                            h(AlertDialogDescription, {}, () =>
                                              t('admin.flags.delete_description', {
                                                key: flag.key,
                                              }),
                                            ),
                                          ],
                                        },
                                      ),
                                      h(
                                        AlertDialogFooter,
                                        {},
                                        {
                                          default: () => [
                                            h(AlertDialogCancel, {}, () => t('common.cancel')),
                                            h(
                                              AlertDialogAction,
                                              { onClick: () => onDelete(flag.key) },
                                              () => t('common.delete'),
                                            ),
                                          ],
                                        },
                                      ),
                                    ],
                                  },
                                ),
                              ],
                            },
                          ),
                      },
                    ),
                  ],
                },
              ),
            ],
          },
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 60,
    },
  ];
}

function getFlagStatus(flag: DBFeatureFlag): {
  label: string;
  variant: 'default' | 'destructive' | 'secondary';
} {
  if (flag.expiresAt && new Date(flag.expiresAt) < new Date()) {
    return { label: 'admin.flags.expired', variant: 'destructive' };
  }
  if (!flag.enabled) {
    return { label: 'admin.flags.disabled', variant: 'secondary' };
  }
  if (flag.rolloutPct < 100) {
    return { label: 'admin.flags.rollout_status', variant: 'default' };
  }
  return { label: 'admin.flags.enabled', variant: 'default' };
}
