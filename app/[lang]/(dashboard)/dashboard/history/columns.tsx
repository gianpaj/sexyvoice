'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, MoreVerticalIcon } from 'lucide-react';
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

export type AudioFile = {
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

export const columns: ColumnDef<AudioFile>[] = [
  {
    id: 'file name',
    accessorKey: 'storage_key',
    header: 'File Name',
    cell: ({ row }) => row.original.storage_key.replace('audio/', ''),
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
    cell: ({ row }) => {
      return (
        <div className="flex items-center gap-2 max-w-[300px]">
          <span
            className="text-sm text-muted-foreground truncate"
            title={row.original.text_content}
          >
            {row.original.text_content}
          </span>
        </div>
      );
    },
  },
  {
    id: 'created at',
    accessorKey: 'created_at',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Created At
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) =>
      formatDate(new Date(row.original.created_at), { withTime: true }),
  },
  {
    id: 'Preview',
    header: 'Preview',
    cell: ({ row }) => {
      const file = row.original;

      return (
        <div className="flex justify-center gap-2">
          <AudioPlayer url={file.url} />
        </div>
      );
    },
  },
  // {
  //   id: 'actions',
  //   cell: ({ row }) => {
  //     const file = row.original;

  //     return (
  //       <div className="flex items-center gap-2">
  //         <DropdownMenu>
  //           <DropdownMenuTrigger asChild>
  //             <Button
  //               variant="ghost"
  //               className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
  //               size="icon"
  //             >
  //               <MoreVerticalIcon />
  //               <span className="sr-only">Open menu</span>
  //             </Button>
  //           </DropdownMenuTrigger>
  //           <DropdownMenuContent align="end" className="w-32">
  //             <DeleteButton id={file.id} />
  //           </DropdownMenuContent>
  //         </DropdownMenu>
  //       </div>
  //     );
  //   },
  // },
];
