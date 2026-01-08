'use client';

import { useQuery } from '@tanstack/react-query';
import {
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { ChevronDownIcon, ColumnsIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import useSupabaseBrowser from '@/lib/supabase/client';
import {
  type AudioFileAndVoicesRes,
  getMyAudioFiles,
} from '@/lib/supabase/queries.client';
import { columns } from './columns';

interface DataTableProps {
  userId: string;
  dict: (typeof langDict)['history'];
}

export function DataTable({ userId, dict }: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const supabase = useSupabaseBrowser();
  const { data } = useQuery({
    queryKey: ['audio_files', userId],
    queryFn: () => getMyAudioFiles(supabase, userId),
    enabled: !!userId,
  });

  const table = useReactTable<AudioFileAndVoicesRes>({
    data: (data as AudioFileAndVoicesRes[]) ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnVisibility,
      columnFilters,
    },
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <>
      <div className="flex items-start justify-between gap-2 py-4 sm:items-center">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            autoComplete="off"
            className="max-w-sm"
            onChange={(event) =>
              table.getColumn('text')?.setFilterValue(event.target.value)
            }
            placeholder={dict.ui.filterText}
            value={(table.getColumn('text')?.getFilterValue() as string) ?? ''}
          />
          <p className="text-left text-muted-foreground text-sm">
            {table.getFilteredRowModel().rows.length} audio files
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <ColumnsIcon />
                <span className="hidden lg:inline">
                  {dict.ui.customizeColumns}
                </span>
                <span className="lg:hidden">{dict.ui.columns}</span>
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {table
                .getAllColumns()
                .filter(
                  (column) =>
                    typeof column.accessorFn !== 'undefined' &&
                    column.getCanHide(),
                )
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    checked={column.getIsVisible()}
                    className="capitalize"
                    key={column.id}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  data-state={row.getIsSelected() && 'selected'}
                  key={row.id}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="h-24 text-center"
                  colSpan={columns.length}
                >
                  {dict.empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
          size="sm"
          variant="outline"
        >
          {dict.ui.previous}
        </Button>
        <Button
          disabled={!table.getCanNextPage()}
          onClick={() => table.nextPage()}
          size="sm"
          variant="outline"
        >
          {dict.ui.next}
        </Button>
      </div>
    </>
  );
}
