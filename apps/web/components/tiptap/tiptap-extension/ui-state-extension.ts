import { Extension } from '@tiptap/core';

export interface UiState {
  commentInputVisible: boolean;
  isDragging: boolean;
  lockDragHandle: boolean;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    uiState: {
      commentInputShow: () => ReturnType;
      commentInputHide: () => ReturnType;

      setLockDragHandle: (value: boolean) => ReturnType;

      resetUiState: () => ReturnType;
      setIsDragging: (value: boolean) => ReturnType;
    };
  }

  interface Storage {
    uiState: UiState;
  }
}

export const defaultUiState: UiState = {
  commentInputVisible: false,
  isDragging: false,
  lockDragHandle: false,
} as const;

export const UiState = Extension.create<UiState>({
  addCommands() {
    const createBooleanSetter =
      (key: keyof UiState) => (value: boolean) => () => {
        this.storage[key] = value;
        return true;
      };

    const createToggle = (key: keyof UiState, value: boolean) => () => () => {
      this.storage[key] = value;
      return true;
    };

    return {
      commentInputHide: createToggle('commentInputVisible', false),
      // AI Generation commands

      // Comment input commands
      commentInputShow: createToggle('commentInputVisible', true),

      // Reset command
      resetUiState: () => () => {
        Object.assign(this.storage, { ...defaultUiState });
        return true;
      },
      setIsDragging: createBooleanSetter('isDragging'),

      // Drag handle commands
      setLockDragHandle: createBooleanSetter('lockDragHandle'),
    };
  },

  addStorage() {
    return {
      ...defaultUiState,
    };
  },
  name: 'uiState',

  onCreate() {
    Object.assign(this.storage, { ...defaultUiState });
  },
});
