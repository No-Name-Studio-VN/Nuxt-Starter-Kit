import { h } from 'vue';
import type { ColumnDef, StockFeatures } from '@tanstack/vue-table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowUpDown, MoreHorizontal, Pencil, Trash2 } from '@lucide/vue';
import type { SafeUser } from '#layers/auth/types/auth';
import { formatRelativeTime } from '@/lib/utils';

export function createColumns(
  t: (key: string) => string,
  locale: string,
  onEdit: (user: SafeUser) => void,
  onDelete: (userId: number) => void,
): ColumnDef<StockFeatures, SafeUser>[] {
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
          ariaLabel: t('data_table.select_all'),
        }),
      cell: ({ row }) =>
        h(Checkbox, {
          modelValue: row.getIsSelected(),
          'onUpdate:modelValue': (value: boolean | string) => row.toggleSelected(!!value),
          ariaLabel: t('data_table.select_row'),
        }),
      enableSorting: false,
      enableHiding: false,
      size: 50,
    },
    {
      accessorKey: 'id',
      header: 'ID',
      cell: ({ row }) =>
        h('div', { class: 'font-mono text-sm text-muted-foreground' }, row.getValue('id')),
      size: 60,
    },
    {
      accessorKey: 'username',
      header: ({ column }) => {
        return h(
          Button,
          {
            variant: 'ghost',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
          },
          () => [t('account_page.username'), h(ArrowUpDown, { 'data-icon': 'inline-end' })],
        );
      },
      cell: ({ row }) => h('div', { class: 'font-medium' }, row.getValue('username')),
    },
    {
      accessorKey: 'name',
      header: ({ column }) => {
        return h(
          Button,
          {
            variant: 'ghost',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
          },
          () => [t('account_page.full_name'), h(ArrowUpDown, { 'data-icon': 'inline-end' })],
        );
      },
      cell: ({ row }) => h('div', { class: 'text-sm' }, row.getValue('name')),
    },
    {
      accessorKey: 'email',
      header: ({ column }) => {
        return h(
          Button,
          {
            variant: 'ghost',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
          },
          () => [t('common.email'), h(ArrowUpDown, { 'data-icon': 'inline-end' })],
        );
      },
      cell: ({ row }) =>
        h('div', { class: 'text-sm text-muted-foreground' }, row.getValue('email')),
    },
    {
      accessorKey: 'isAdmin',
      header: t('admin.users.roles'),
      cell: ({ row }) => {
        const user = row.original;
        return h('div', { class: 'flex gap-2' }, [
          user.isAdmin &&
            h(Badge, { variant: 'destructive', class: 'text-xs' }, () =>
              t('admin.users.administrator'),
            ),
        ]);
      },
    },
    {
      accessorKey: 'emailVerified',
      header: t('admin.users.email_verification'),
      cell: ({ row }) => {
        const isEmailVerified = row.original.emailVerified;
        return h(
          Badge,
          { variant: isEmailVerified ? 'default' : 'secondary', class: 'text-xs' },
          () => (isEmailVerified ? t('admin.users.verified') : t('admin.users.unverified')),
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) => {
        return h(
          Button,
          {
            variant: 'ghost',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
          },
          () => [t('admin.users.created_at'), h(ArrowUpDown, { 'data-icon': 'inline-end' })],
        );
      },
      cell: ({ row }) =>
        h(
          'div',
          { class: 'text-sm text-muted-foreground whitespace-nowrap' },
          formatRelativeTime(row.getValue('createdAt'), {
            locale,
            justNow: t('admin.users.just_now'),
            inAMoment: t('admin.users.in_a_moment'),
          }),
        ),
    },
    {
      accessorKey: 'lastLoginAt',
      header: ({ column }) => {
        return h(
          Button,
          {
            variant: 'ghost',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
          },
          () => [t('admin.users.last_login'), h(ArrowUpDown, { 'data-icon': 'inline-end' })],
        );
      },
      cell: ({ row }) =>
        h(
          'div',
          { class: 'text-sm text-muted-foreground whitespace-nowrap' },
          formatRelativeTime(row.getValue('lastLoginAt'), {
            locale,
            justNow: t('admin.users.just_now'),
            inAMoment: t('admin.users.in_a_moment'),
          }),
        ),
    },
    {
      id: 'actions',
      header: t('data_table.actions'),
      cell: ({ row }) => {
        const user = row.original;
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
                      {
                        onClick: () => onEdit(user),
                      },
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
                      {
                        onClick: () => onDelete(user.id),
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
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 60,
    },
  ];
}
