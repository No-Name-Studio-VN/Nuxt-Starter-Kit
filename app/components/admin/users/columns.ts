import { h } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-vue-next'

export interface User {
  id: number
  username: string
  name: string
  isAdmin: boolean
  createdAt: Date | number | string
  lastLoginAt: Date | number | string
}

function formatDate(date: Date | number | string) {
  try {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  catch {
    return '-'
  }
}

export function createColumns(
  onEdit: (user: User) => void,
  onDelete: (userId: number) => void,
): ColumnDef<User>[] {
  return [
    {
      id: 'select',
      header: ({ table }) =>
        h(Checkbox, {
          'modelValue': table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate'),
          'onUpdate:modelValue': (value: boolean | string) =>
            table.toggleAllPageRowsSelected(!!value),
          'ariaLabel': 'Select all',
        }),
      cell: ({ row }) =>
        h(Checkbox, {
          'modelValue': row.getIsSelected(),
          'onUpdate:modelValue': (value: boolean | string) => row.toggleSelected(!!value),
          'ariaLabel': 'Select row',
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
      header: 'Username',
      cell: ({ row }) =>
        h('div', { class: 'font-medium' }, row.getValue('username')),
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) =>
        h('div', { class: 'text-sm' }, row.getValue('name')),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) =>
        h('div', { class: 'text-sm text-muted-foreground whitespace-nowrap' }, formatDate(row.getValue('createdAt'))),
    },
    {
      accessorKey: 'lastLoginAt',
      header: 'Last Login',
      cell: ({ row }) =>
        h('div', { class: 'text-sm text-muted-foreground whitespace-nowrap' }, formatDate(row.getValue('lastLoginAt'))),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const user = row.original
        return h(
          DropdownMenu,
          {},
          {
            default: () => [
              h(
                DropdownMenuTrigger,
                { asChild: true },
                {
                  default: () => h(
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
                      {
                        onClick: () => onEdit(user),
                      },
                      {
                        default: () => h('div', { class: 'flex items-center gap-2' }, [
                          h(Pencil, { class: 'h-4 w-4' }),
                          h('span', {}, 'Edit'),
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
                        default: () => h('div', { class: 'flex items-center gap-2' }, [
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
        )
      },
      enableSorting: false,
      enableHiding: false,
      size: 60,
    },
  ]
}
