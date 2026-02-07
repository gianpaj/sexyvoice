'use client';

import { useQuery } from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import type {
  MonthlyUsageSummary,
  PaginatedUsageEventsResponse,
} from '@/lib/supabase/usage-queries';
import { createColumns } from './columns';

interface DataTableProps {
  dict: (typeof langDict)['usage'];
}

interface UsageEventsApiResponse extends PaginatedUsageEventsResponse {
  monthlySummary?: MonthlyUsageSummary;
  allTimeSummary?: MonthlyUsageSummary;
}

async function fetchUsageEvents(
  page: number,
  pageSize: number,
  sourceType?: string,
  includeSummary = false,
): Promise<UsageEventsApiResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    pageSize: pageSize.toString(),
  });

  if (sourceType && sourceType !== 'all') {
    params.set('sourceType', sourceType);
  }

  if (includeSummary) {
    params.set('includeSummary', 'true');
  }

  const response = await fetch(`/api/usage-events?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Failed to fetch usage events');
  }

  return response.json();
}

export function DataTable({ dict }: DataTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Parse URL params
  const currentPage = Number.parseInt(searchParams.get('page') ?? '1', 10);
  const currentPageSize = Number.parseInt(
    searchParams.get('pageSize') ?? '20',
    10,
  );
  const currentSourceType = searchParams.get('sourceType') ?? 'all';

  const [sorting, setSorting] = useState<SortingState>([]);

  // Update URL with new params
  const updateParams = useCallback(
    (updates: Record<string, string | number>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === 'all' || value === '') {
          params.delete(key);
        } else {
          params.set(key, value.toString());
        }
      }
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Fetch data with react-query
  const { data, isLoading, error } = useQuery({
    queryKey: ['usage_events', currentPage, currentPageSize, currentSourceType],
    queryFn: () =>
      fetchUsageEvents(
        currentPage,
        currentPageSize,
        currentSourceType,
        currentPage === 1, // Include summary only on first page
      ),
  });

  // Memoize columns
  const columns = useMemo(() => createColumns(dict), [dict]);

  const table = useReactTable({
    data: data?.data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    manualPagination: true,
    pageCount: data?.totalPages ?? 0,
    state: {
      sorting,
      pagination: {
        pageIndex: currentPage - 1,
        pageSize: currentPageSize,
      },
    },
  });

  // Handle page change
  const handlePageChange = (newPage: number) => {
    updateParams({ page: newPage });
  };

  // Handle page size change
  const handlePageSizeChange = (newPageSize: string) => {
    updateParams({ page: 1, pageSize: newPageSize });
  };

  // Handle source type filter change
  const handleSourceTypeChange = (newSourceType: string) => {
    updateParams({ page: 1, sourceType: newSourceType });
  };

  // Render table content based on state
  const renderTableContent = () => {
    if (isLoading) {
      return Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {columns.map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-6 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ));
    }

    if (table.getRowModel().rows?.length) {
      return table.getRowModel().rows.map((row) => (
        <TableRow data-state={row.getIsSelected() && 'selected'} key={row.id}>
          {row.getVisibleCells().map((cell) => (
            <TableCell key={cell.id}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          ))}
        </TableRow>
      ));
    }

    return (
      <TableRow>
        <TableCell className="h-24 text-center" colSpan={columns.length}>
          {dict.empty}
        </TableCell>
      </TableRow>
    );
  };

  if (error) {
    return (
      <div className="rounded-md border p-8 text-center">
        <p className="text-destructive">Failed to load usage data</p>
      </div>
    );
  }

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">
            {dict.ui.filterByType}:
          </span>
          <Select
            onValueChange={handleSourceTypeChange}
            value={currentSourceType}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={dict.ui.allTypes} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{dict.ui.allTypes}</SelectItem>
              <SelectItem value="tts">{dict.summary.byType.tts}</SelectItem>
              <SelectItem value="voice_cloning">
                {dict.summary.byType.voice_cloning}
              </SelectItem>
              <SelectItem value="live_call">
                {dict.summary.byType.live_call}
              </SelectItem>
              <SelectItem value="audio_processing">
                {dict.summary.byType.audio_processing}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">
            {dict.ui.showing}:
          </span>
          <Select
            onValueChange={handlePageSizeChange}
            value={currentPageSize.toString()}
          >
            <SelectTrigger className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-sm">
            {dict.ui.results}
          </span>
        </div>
      </div>

      {/* Table */}
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
          <TableBody>{renderTableContent()}</TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between py-4">
        <div className="text-muted-foreground text-sm">
          {data && (
            <>
              {dict.ui.page} {currentPage} {dict.ui.of} {data.totalPages || 1}
              {' - '}
              {data.totalCount} {dict.ui.results}
            </>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            disabled={currentPage <= 1 || isLoading}
            onClick={() => handlePageChange(currentPage - 1)}
            size="sm"
            variant="outline"
          >
            {dict.ui.previous}
          </Button>
          <Button
            disabled={currentPage >= (data?.totalPages ?? 1) || isLoading}
            onClick={() => handlePageChange(currentPage + 1)}
            size="sm"
            variant="outline"
          >
            {dict.ui.next}
          </Button>
        </div>
      </div>
    </>
  );
}
