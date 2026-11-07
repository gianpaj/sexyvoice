'use client';

import {
  type ChangeEvent,
  type DragEvent,
  type InputHTMLAttributes,
  type RefObject,
  useRef,
  useState,
} from 'react';

type FileUploadError = 'fileTooLarge' | 'invalidFileType';

interface FileUploadOptions {
  /** MIME types, `type/*` wildcards and `.ext` suffixes, comma-separated. */
  accept: string;
  /** In bytes. */
  maxSize: number;
  /** Called on every pick, after the file is checked. */
  onFileChosen?: (accepted: boolean) => void;
}

function isAccepted(file: File, accept: string): boolean {
  const extension = `.${file.name.split('.').pop()}`.toLowerCase();
  return accept.split(',').some((entry) => {
    const type = entry.trim();
    if (type.startsWith('.')) {
      return extension === type.toLowerCase();
    }
    if (type.endsWith('/*')) {
      return file.type.startsWith(type.slice(0, -1));
    }
    return file.type === type;
  });
}

/** One file picked or dropped, checked against `accept` and `maxSize`. */
export function useFileUpload({
  accept,
  maxSize,
  onFileChosen,
}: FileUploadOptions) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<FileUploadError | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFile = (candidate: File | undefined) => {
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    if (!candidate) {
      return;
    }
    let problem: FileUploadError | null = null;
    if (candidate.size > maxSize) {
      problem = 'fileTooLarge';
    } else if (!isAccepted(candidate, accept)) {
      problem = 'invalidFileType';
    }
    setError(problem);
    setFile(problem ? null : candidate);
    onFileChosen?.(!problem);
  };

  const stopEvent = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const inputProps: InputHTMLAttributes<HTMLInputElement> & {
    ref: RefObject<HTMLInputElement | null>;
  } = {
    accept,
    onChange: (event: ChangeEvent<HTMLInputElement>) =>
      addFile(event.target.files?.[0]),
    ref: inputRef,
    type: 'file',
  };

  return {
    addFile,
    clearError: () => setError(null),
    error,
    file,
    handleDragEnter: (event: DragEvent<HTMLElement>) => {
      stopEvent(event);
      setIsDragging(true);
    },
    handleDragLeave: (event: DragEvent<HTMLElement>) => {
      stopEvent(event);
      if (!event.currentTarget.contains(event.relatedTarget as Node)) {
        setIsDragging(false);
      }
    },
    handleDragOver: stopEvent,
    inputProps,
    handleDrop: (event: DragEvent<HTMLElement>) => {
      stopEvent(event);
      setIsDragging(false);
      if (!inputRef.current?.disabled) {
        addFile(event.dataTransfer.files[0]);
      }
    },
    isDragging,
    openFileDialog: () => inputRef.current?.click(),
    removeFile: () => {
      setFile(null);
      setError(null);
    },
  };
}

export type FileUpload = ReturnType<typeof useFileUpload>;
