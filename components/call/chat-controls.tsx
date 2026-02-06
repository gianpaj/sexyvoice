import { AudioLines, Edit } from 'lucide-react';

import { MessageSquareQuote } from "lucide-react";

import { Button } from '@/components/ui/button';
import { TranscriptDrawer } from "@/components/call/transcript-drawer";

interface ChatControlsProps {
  showEditButton: boolean;
  isEditingInstructions: boolean;
  onToggleEdit: () => void;
}

export function ChatControls({
  showEditButton,
  isEditingInstructions,
  onToggleEdit,
}: ChatControlsProps) {
  return (
    <div className="absolute top-2 right-2 left-2 flex justify-between">
      {/*<div className="flex gap-2">
        <ConfigurationFormDrawer>
          <Button className="md:hidden" size="icon" variant="outline">
            <Settings className="h-4 w-4" />
          </Button>
        </ConfigurationFormDrawer>
      </div>*/}
      <div className="flex gap-2">
        {showEditButton && (
          <Button onClick={onToggleEdit} size="icon" variant="outline">
            {isEditingInstructions ? (
              <AudioLines className="h-4 w-4" />
            ) : (
              <Edit className="h-4 w-4" />
            )}
          </Button>
        )}
        <TranscriptDrawer>
          <Button variant="outline" size="icon" className="md:hidden">
            <MessageSquareQuote className="h-4 w-4" />
          </Button>
        </TranscriptDrawer>
      </div>
    </div>
  );
}
