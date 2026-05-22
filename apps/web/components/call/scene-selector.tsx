'use client';

import { useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { DynamicIcon } from 'lucide-react/dynamic';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { callScenes } from '@/data/call-scenes';
import { useConnection } from '@/hooks/use-connection';
import { usePlaygroundState } from '@/hooks/use-playground-state';

const NO_SCENE_VALUE = 'none';

interface SceneSelectorProps {
  isPaidUser?: boolean;
}

export function SceneSelector({ isPaidUser = false }: SceneSelectorProps) {
  const connectionState = useConnectionState();
  const isConnected = connectionState === ConnectionState.Connected;
  const { dict } = useConnection();
  const { pgState, dispatch } = usePlaygroundState();
  const selectedValue = pgState.selectedSceneId ?? NO_SCENE_VALUE;
  const hasEditableScene = isPaidUser && pgState.selectedSceneId;

  const handleSceneChange = (value: string) => {
    if (!isPaidUser || isConnected) return;

    dispatch({
      type: 'SET_SELECTED_SCENE_ID',
      payload: value === NO_SCENE_VALUE ? null : value,
    });
  };

  return (
    <div
      className="w-full border-separator1 border-b px-4 py-6 md:px-1"
      data-testid="call-scene-selector"
    >
      <div className="flex w-full items-center justify-between gap-4">
        <div className="font-semibold text-neutral-400 text-xs uppercase tracking-widest">
          {dict.sceneLabel}
        </div>
        <Select
          disabled={isConnected}
          onValueChange={handleSceneChange}
          value={selectedValue}
        >
          <SelectTrigger className="h-9 text-neutral-200">
            <SelectValue placeholder={dict.scenePlaceholder} />
          </SelectTrigger>
          <SelectContent className="max-h-72 overflow-y-auto text-neutral-100">
            <SelectItem disabled={!isPaidUser} value={NO_SCENE_VALUE}>
              {dict.sceneNone}
            </SelectItem>
            {callScenes.map((scene) => (
              <SelectItem
                disabled={!isPaidUser}
                key={scene.id}
                value={scene.id}
              >
                <DynamicIcon className="h-4 w-4" name={scene.icon} />
                {scene.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!isPaidUser && (
        <div className="mt-2 text-right text-muted-foreground text-xs">
          {dict.sceneUpgradeRequired}
        </div>
      )}

      {hasEditableScene && (
        <div className="mt-4 space-y-2">
          <div className="font-semibold text-neutral-400 text-xs uppercase tracking-widest">
            {dict.sceneTextLabel}
          </div>
          <Textarea
            className="min-h-48 bg-transparent font-mono text-xs leading-loose"
            disabled={isConnected}
            onChange={(event) =>
              dispatch({
                type: 'SET_SCENE_INSTRUCTIONS',
                payload: event.target.value,
              })
            }
            value={pgState.sceneInstructions}
          />
        </div>
      )}
    </div>
  );
}
