'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import type {
  UsageEvent,
  UsageSourceType,
  UsageUnitType,
} from '@/lib/supabase/usage-queries';

function formatDate(
  input: string | number | Date,
  { withTime = false }: { withTime?: boolean } = {},
): string {
  const date = new Date(input);
  return date.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    ...(withTime && {
      hour: '2-digit',
      minute: '2-digit',
    }),
  });
}

const SOURCE_TYPE_COLORS: Record<UsageSourceType, string> = {
  tts: 'bg-purple-100 text-purple-900 border-purple-200',
  voice_cloning: 'bg-blue-100 text-blue-900 border-blue-200',
  live_call: 'bg-green-100 text-green-900 border-green-200',
  audio_processing: 'bg-orange-100 text-orange-900 border-orange-200',
};

/**
 * Format quantity with appropriate unit
 */
function formatQuantity(
  quantity: number,
  unit: UsageUnitType,
  dict: (typeof langDict)['usage']['units'],
): string {
  const formattedNumber = quantity.toLocaleString();

  switch (unit) {
    case 'chars':
      return `${formattedNumber} ${dict.chars}`;
    case 'mins':
      return `${formattedNumber} ${dict.mins}`;
    case 'secs':
      return `${formattedNumber} ${dict.secs}`;
    case 'operation':
      return `${formattedNumber} ${dict.operation}`;
    default:
      return formattedNumber;
  }
}

/**
 * Details cell component with expandable metadata
 */
function DetailsCell({
  metadata,
}: {
  metadata: Tables<'usage_events'>['metadata'];
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!metadata || typeof metadata !== 'object') {
    return <span className="text-muted-foreground">-</span>;
  }

  const metadataObj = metadata as Record<string, unknown>;
  const voiceName = metadataObj.voiceName as string | undefined;
  const textPreview = metadataObj.textPreview as string | undefined;

  const hasDetails = voiceName || textPreview;

  if (!hasDetails) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        className="h-auto justify-start gap-1 p-0"
        onClick={() => setIsExpanded(!isExpanded)}
        variant="ghost"
      >
        {isExpanded ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
        <span className="text-sm">
          {voiceName ||
            (textPreview ? `${textPreview.slice(0, 30)}...` : 'View details')}
        </span>
      </Button>
      {isExpanded && (
        <div className="ml-5 space-y-1 text-muted-foreground text-xs">
          {voiceName && <div>Voice: {voiceName}</div>}
          {textPreview && (
            <div className="max-w-[200px] truncate" title={textPreview}>
              Text: {textPreview}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function createColumns(
  dict: (typeof langDict)['usage'],
): ColumnDef<UsageEvent>[] {
  return [
    {
      id: 'source_type',
      accessorKey: 'source_type',
      header: dict.table.sourceType,
      cell: ({ row }) => {
        const sourceType = row.original.source_type as UsageSourceType;
        const label = dict.summary.byType[sourceType] || sourceType;
        return (
          <Badge
            className={`${SOURCE_TYPE_COLORS[sourceType]} border`}
            variant="outline"
          >
            {label}
          </Badge>
        );
      },
    },
    {
      id: 'quantity',
      accessorKey: 'quantity',
      header: dict.table.quantity,
      cell: ({ row }) =>
        formatQuantity(
          row.original.quantity,
          row.original.unit as UsageUnitType,
          dict.units,
        ),
    },
    {
      id: 'credits_used',
      accessorKey: 'credits_used',
      header: dict.table.creditsUsed,
      cell: ({ row }) => row.original.credits_used.toLocaleString(),
    },
    {
      id: 'occurred_at',
      accessorKey: 'occurred_at',
      header: ({ column }) => (
        <Button
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          variant="ghost"
        >
          {dict.table.date}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) =>
        formatDate(new Date(row.original.occurred_at), { withTime: true }),
    },
    {
      id: 'details',
      accessorKey: 'metadata',
      header: dict.table.details,
      cell: ({ row }) => <DetailsCell metadata={row.original.metadata} />,
    },
  ];
}
