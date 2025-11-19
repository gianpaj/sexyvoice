'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, Download, MoreVerticalIcon } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDate } from '@/lib/utils';
import { AudioPlayer } from './audio-player';
import { DeleteButton } from './delete-button';

type AudioFile = {
  id: string;
  storage_key: string;
  created_at: string;
  text_content: string;
  url: string;
  user_id: string;
  voice_id: string;
  voices: {
    name: string;
  };
};

const downloadFile = (url: string) => {
  const link = document.createElement('a');
  link.href = url;
  link.download = 'generated_audio.mp3';
  // link.setAttribute('download', 'generated_audio.mp3');
  link.target = '_blank';
  // document.body.appendChild(link);
  link.click();
  // document.body.removeChild(link);
};

export const columns: ColumnDef<AudioFile>[] = [
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
    cell: ({ row }) => (
      <div className="w-full lg:w-32">
        <Badge variant="outline" className="px-1.5 text-muted-foreground">
          {row.original.voices?.name || 'Unknown'}
        </Badge>
      </div>
    ),
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
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Created At
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) =>
      formatDate(new Date(row.original.created_at), { withTime: true }),
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
        variant="outline"
        size="icon"
        title="Download"
        className="ml-2"
        onClick={() => downloadFile(row.original.url)}
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
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
                size="icon"
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
