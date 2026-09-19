'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, Download, MoreVerticalIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { AudioPlayer } from '@/components/audio-player';
import { toast } from '@/components/services/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadUrl } from '@/lib/download';
import type { AudioFileAndVoicesRes } from '@/lib/supabase/queries.client';
import { formatDate } from '@/lib/utils';
import { DeleteButton } from './delete-button';

const downloadFile = async (url: string, errorMessage: string) => {
  if (!url) return;

  try {
    await downloadUrl(url, document.createElement('a'));
  } catch {
    toast.error(errorMessage);
  }
};

const COLOR_PAIRS = [
  { bg: 'bg-red-100', text: 'text-red-900' },
  { bg: 'bg-orange-100', text: 'text-orange-900' },
  { bg: 'bg-yellow-100', text: 'text-yellow-900' },
  { bg: 'bg-green-100', text: 'text-green-900' },
  { bg: 'bg-blue-100', text: 'text-blue-900' },
  { bg: 'bg-indigo-100', text: 'text-indigo-900' },
  { bg: 'bg-purple-100', text: 'text-purple-900' },
  { bg: 'bg-pink-100', text: 'text-pink-900' },
];

const getBadgeClasses = (name: string) => {
  const index = name.charCodeAt(0) % COLOR_PAIRS.length;
  return `${COLOR_PAIRS[index].bg} ${COLOR_PAIRS[index].text}`;
};

function ActionsCell({ file }: { file: AudioFileAndVoicesRes }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleCloseDropdown = () => {
    setIsOpen(false);
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu onOpenChange={setIsOpen} open={isOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
            size="icon"
            variant="ghost"
          >
            <MoreVerticalIcon />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DeleteButton
            handleCloseDropdown={handleCloseDropdown}
            id={file.id}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function DateTimeCell({ value }: { value: string }) {
  return (
    <time dateTime={value} suppressHydrationWarning>
      {formatDate(value, { withTime: true })}
    </time>
  );
}

interface AudioUsageData {
  apiKeyId?: string;
  dollarAmount?: number;
  sourceType?: string;
}

function getUsageData(value: unknown): AudioUsageData | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as AudioUsageData;
}

export function useColumns({
  showApiColumns,
}: {
  showApiColumns: boolean;
}): ColumnDef<AudioFileAndVoicesRes>[] {
  const t = useTranslations('history');

  return useMemo(() => {
    const baseColumns: ColumnDef<AudioFileAndVoicesRes>[] = [
      {
        accessorKey: 'storage_key',
        cell: ({ row }) =>
          row.original.storage_key.replace('audio/', '') || 'Unknown',
        header: 'File Name',
        id: 'file name',
      },
      {
        accessorKey: 'voices.name',
        cell: ({ row }) => {
          const voiceName = row.original.voices?.name || 'Unknown';

          return (
            <div className="w-full lg:w-32">
              <Badge
                className={`rounded-lg px-1.5 sm:rounded-full ${getBadgeClasses(voiceName)}`}
                variant="outline"
              >
                {voiceName.charAt(0).toUpperCase() + voiceName.slice(1)}
              </Badge>
            </div>
          );
        },
        header: 'Voice',
        id: 'voice',
      },
      {
        accessorKey: 'text_content',
        cell: ({ row }) => (
          <div className="flex max-w-[300px] items-center gap-2">
            <span
              className="truncate text-muted-foreground text-sm"
              title={row.original.text_content}
            >
              {row.original.text_content}
            </span>
          </div>
        ),
        header: 'Text',
        id: 'text',
      },
      {
        accessorKey: 'created_at',
        cell: ({ row }) => <DateTimeCell value={row.original.created_at!} />,
        header: ({ column }) => (
          <Button
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            variant="ghost"
          >
            Created At
            <ArrowUpDown className="ml-2 size-4" />
          </Button>
        ),
        id: 'created at',
      },
      {
        cell: ({ row }) => (
          <div className="flex justify-center gap-2">
            <AudioPlayer url={row.original.url} />
          </div>
        ),
        header: 'Preview',
        id: 'Preview',
      },
      {
        cell: ({ row }) => (
          <Button
            className="ml-2"
            onClick={() => downloadFile(row.original.url, t('downloadError'))}
            size="icon"
            title="Download"
            variant="outline"
          >
            <Download className="size-4" />
          </Button>
        ),
        header: 'Download',
        id: 'Download',
      },
      {
        accessorKey: 'credits_used',
        header: 'Credits',
        id: 'Credits',
      },
    ];

    if (!showApiColumns) {
      return [
        ...baseColumns,
        {
          cell: ({ row }) => <ActionsCell file={row.original} />,
          header: 'Actions',
          id: 'actions',
        },
      ];
    }

    const apiColumns: ColumnDef<AudioFileAndVoicesRes>[] = [
      {
        accessorFn: (row) => getUsageData(row.usage)?.sourceType ?? null,
        cell: ({ row }) => {
          const usage = getUsageData(row.original.usage);
          const sourceType = usage?.sourceType;
          if (sourceType !== 'api_tts') {
            return <span className="text-muted-foreground">-</span>;
          }
          return <Badge variant="secondary">TTS</Badge>;
        },
        header: 'API Source',
        id: 'api source',
      },
      {
        accessorFn: (row) => getUsageData(row.usage)?.apiKeyId ?? null,
        cell: ({ row }) => {
          const usage = getUsageData(row.original.usage);
          const apiKeyId = usage?.apiKeyId;
          if (!apiKeyId || typeof apiKeyId !== 'string') {
            return <span className="text-muted-foreground">-</span>;
          }
          return (
            <code className="text-xs">
              {apiKeyId.slice(0, 8)}
              ...
            </code>
          );
        },
        header: 'API Key',
        id: 'api key',
      },
    ];

    return [
      ...baseColumns,
      ...apiColumns,
      {
        cell: ({ row }) => <ActionsCell file={row.original} />,
        header: 'Actions',
        id: 'actions',
      },
    ];
  }, [showApiColumns, t]);
}
