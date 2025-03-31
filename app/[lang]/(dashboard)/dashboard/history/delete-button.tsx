import { useRouter } from 'next/navigation';

import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { handleDeleteAction } from './actions';

export function DeleteButton({ id }: { id: string }) {
  const router = useRouter();

  const handleDelete = async () => {
    await handleDeleteAction(id);
    router.refresh();
  };

  return <DropdownMenuItem onClick={handleDelete}>Delete</DropdownMenuItem>;
}
