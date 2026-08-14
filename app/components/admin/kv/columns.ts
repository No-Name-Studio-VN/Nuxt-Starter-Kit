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
          ariaLabel: 'Select all KV keys on this page',
        }),
      cell: ({ row }) =>
        h(Checkbox, {
          modelValue: row.getIsSelected(),
          'onUpdate:modelValue': (value: boolean | string) => row.toggleSelected(!!value),
          ariaLabel: `Select KV key ${row.original.key}`,
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
          () => ['Key', h(ArrowUpDown, { 'data-icon': 'inline-end' })],
        ),
      cell: ({ row }) =>
        h('div', { class: 'flex min-w-[18rem] flex-col gap-1' }, [
          h('span', { class: 'break-all font-mono text-sm font-medium' }, row.original.key),
          row.original.isTemporary
            ? h('span', { class: 'flex items-center gap-1 text-xs text-muted-foreground' }, [
                h(AlertTriangle, { class: 'size-3' }),
                'Temporary or cache-sensitive key',
              ])
            : null,
        ]),
    },
    {
      accessorKey: 'prefix',
      header: 'Prefix',
      cell: ({ row }) => h(Badge, { variant: 'secondary' }, () => row.original.prefix),
    },
    {
      id: 'value',
      header: 'Value preview',
      cell: ({ row }) => {
        if (!row.original.value) {
          return h('span', { class: 'text-sm text-muted-foreground' }, 'Loading on page…');
        }

        return h('div', { class: 'flex max-w-[26rem] flex-col gap-1' }, [
          h(
            'span',
            { class: 'line-clamp-2 break-all font-mono text-xs text-muted-foreground' },
            getValuePreview(row.original),
          ),
          h('div', { class: 'flex flex-wrap items-center gap-2' }, [
            h(
              Badge,
              { variant: row.original.value.mode === 'json' ? 'default' : 'secondary' },
              () => row.original.value?.mode.toUpperCase() ?? 'RAW',
            ),
            h(
              'span',
              { class: 'text-xs text-muted-foreground' },
              prettyBytes(row.original.value.valueBytes),
            ),
          ]),
        ]);
      },
      enableSorting: false,
    },
    {
      id: 'temporary',
      header: 'Warning',
      cell: ({ row }) =>
        row.original.isTemporary
          ? h(Badge, { variant: 'destructive' }, () => 'Sensitive')
          : h('span', { class: 'text-sm text-muted-foreground' }, '—'),
    },
    {
      id: 'actions',
      header: 'Actions',
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
                          h('span', { class: 'sr-only' }, 'Open menu'),
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
                            h('span', {}, 'Edit value'),
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
                            h('span', {}, 'Delete'),
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

function getValuePreview(row: AdminKvTableRow): string {
  if (!row.value) return '';

  const compactValue = row.value.value.replace(/\s+/g, ' ').trim();

  if (compactValue.length === 0) {
    return 'Empty value';
  }

  return compactValue.length > 180 ? `${compactValue.slice(0, 180)}…` : compactValue;
}
