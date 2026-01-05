'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, Download, MoreVerticalIcon } from 'lucide-react';
import { useState } from 'react';

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

const downloadFile = async (url: string) => {
  const anchorElement = document.createElement('a');
  anchorElement.href = url;
  const filename = url.split('/').pop()?.split('?')[0];
  anchorElement.download = filename || 'generated_audio.mp3';
  anchorElement.target = '_blank';
  if (!url) return;

  try {
    await downloadUrl(url, anchorElement);
  } catch {
    toast.error('errorCloning'); // TODO: translate - passing
  }
};

const getBadgeClasses = (name: string) => {
  const colorPairs = [
    { bg: 'bg-red-100', text: 'text-red-900' },
    { bg: 'bg-orange-100', text: 'text-orange-900' },
    { bg: 'bg-yellow-100', text: 'text-yellow-900' },
    { bg: 'bg-green-100', text: 'text-green-900' },
    { bg: 'bg-blue-100', text: 'text-blue-900' },
    { bg: 'bg-indigo-100', text: 'text-indigo-900' },
    { bg: 'bg-purple-100', text: 'text-purple-900' },
    { bg: 'bg-pink-100', text: 'text-pink-900' },
  ];
  const index = name.charCodeAt(0) % colorPairs.length;
  return `${colorPairs[index].bg} ${colorPairs[index].text}`;
};

export const columns: ColumnDef<AudioFileAndVoicesRes>[] = [
  {
    id: 'file name',
    accessorKey: 'storage_key',
    header: 'File Name',
    cell: ({ row }) =>
      row.original.storage_key.replace('audio/', '') || 'Unknown',
  },
  {
    id: 'voice',
    accessorKey: 'voices.name',
    header: 'Voice',
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
  },
  {
    id: 'text',
    accessorKey: 'text_content',
    header: 'Text',
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
  },
  {
    id: 'created at',
    accessorKey: 'created_at',
    header: ({ column }) => (
      <Button
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        variant="ghost"
      >
        Created At
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) =>
      formatDate(new Date(row.original.created_at!), { withTime: true }),
  },
  {
    id: 'Preview',
    header: 'Preview',
    cell: ({ row }) => (
      <div className="flex justify-center gap-2">
        <AudioPlayer url={row.original.url} />
      </div>
    ),
  },
  {
    id: 'Download',
    header: 'Download',
    cell: ({ row }) => (
      <Button
        className="ml-2"
        onClick={() => downloadFile(row.original.url)}
        size="icon"
        title="Download"
        variant="outline"
      >
        <Download className="size-4" />
      </Button>
    ),
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => {
      const file = row.original;

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
    },
  },
];
