import { h } from 'vue';
import type { ColumnDef, StockFeatures } from '@tanstack/vue-table';
import prettyBytes from 'pretty-bytes';
import { AlertTriangle, ArrowUpDown, MoreHorizontal, Pencil, Trash2 } from '@lucide/vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AdminKvTableRow } from './types';

export function createColumns(
  t: (key: string, named?: Record<string, string>) => string,
  locale: string,
  onEdit: (row: AdminKvTableRow) => void,
  onDelete: (row: AdminKvTableRow) => void,
): ColumnDef<StockFeatures, AdminKvTableRow>[] {
  return [
    {
      id: 'select',
      header: ({ table }) =>
        h(Checkbox, {
          modelValue:
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() &&
              !table.getIsAllPageRowsSelected() &&
              'indeterminate'),
          'onUpdate:modelValue': (value: boolean | string) =>
            table.toggleAllPageRowsSelected(!!value),
          ariaLabel: t('admin.kv.select_all'),
        }),
      cell: ({ row }) =>
        h(Checkbox, {
          modelValue: row.getIsSelected(),
          'onUpdate:modelValue': (value: boolean | string) => row.toggleSelected(!!value),
          ariaLabel: t('admin.kv.select_one', { key: row.original.key }),
        }),
      enableSorting: false,
      enableHiding: false,
      size: 48,
    },
    {
      accessorKey: 'key',
      header: ({ column }) =>
        h(
          Button,
          {
            variant: 'ghost',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
          },
          () => [t('admin.kv.key'), h(ArrowUpDown, { 'data-icon': 'inline-end' })],
        ),
      cell: ({ row }) =>
        h('div', { class: 'flex min-w-[18rem] flex-col gap-1' }, [
          h('span', { class: 'break-all font-mono text-sm font-medium' }, row.original.key),
          row.original.isTemporary
            ? h('span', { class: 'flex items-center gap-1 text-xs text-muted-foreground' }, [
                h(AlertTriangle, { class: 'size-3' }),
                t('admin.kv.temporary_title'),
              ])
            : null,
        ]),
    },
    {
      accessorKey: 'prefix',
      header: t('admin.kv.prefix'),
      cell: ({ row }) => h(Badge, { variant: 'secondary' }, () => row.original.prefix),
    },
    {
      id: 'value',
      header: t('admin.kv.preview'),
      cell: ({ row }) => {
        if (!row.original.value) {
          return h(
            'span',
            { class: 'text-sm text-muted-foreground' },
            t('common.loading_ellipsis'),
          );
        }

        return h('div', { class: 'flex max-w-[26rem] flex-col gap-1' }, [
          h(
            'span',
            { class: 'line-clamp-2 break-all font-mono text-xs text-muted-foreground' },
            getValuePreview(row.original, t('admin.kv.empty_value')),
          ),
          h('div', { class: 'flex flex-wrap items-center gap-2' }, [
            h(
              Badge,
              { variant: row.original.value.mode === 'json' ? 'default' : 'secondary' },
              () =>
                t(row.original.value?.mode === 'json' ? 'admin.kv.mode_json' : 'admin.kv.mode_raw'),
            ),
            h(
              'span',
              { class: 'text-xs text-muted-foreground' },
              prettyBytes(row.original.value.valueBytes, { locale }),
            ),
          ]),
        ]);
      },
      enableSorting: false,
    },
    {
      id: 'temporary',
      header: t('admin.kv.warning'),
      cell: ({ row }) =>
        row.original.isTemporary
          ? h(Badge, { variant: 'destructive' }, () => t('admin.kv.sensitive'))
          : h('span', { class: 'text-sm text-muted-foreground' }, '—'),
    },
    {
      id: 'actions',
      header: t('data_table.actions'),
      cell: ({ row }) =>
        h(
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
                      { onClick: () => onEdit(row.original) },
                      {
                        default: () =>
                          h('div', { class: 'flex items-center gap-2' }, [
                            h(Pencil, { class: 'h-4 w-4' }),
                            h('span', {}, t('admin.kv.edit_value')),
                          ]),
                      },
                    ),
                    h(
                      DropdownMenuItem,
                      {
                        onClick: () => onDelete(row.original),
                        class: 'text-destructive focus:text-destructive',
                      },
                      {
                        default: () =>
                          h('div', { class: 'flex items-center gap-2' }, [
                            h(Trash2, { class: 'h-4 w-4' }),
                            h('span', {}, t('common.delete')),
                          ]),
                      },
                    ),
                  ],
                },
              ),
            ],
          },
        ),
      enableSorting: false,
      enableHiding: false,
      size: 60,
    },
  ];
}

function getValuePreview(row: AdminKvTableRow, emptyValue: string): string {
  if (!row.value) return '';

  const compactValue = row.value.value.replace(/\s+/g, ' ').trim();

  if (compactValue.length === 0) {
    return emptyValue;
  }

  return compactValue.length > 180 ? `${compactValue.slice(0, 180)}…` : compactValue;
}
