import { useEffect } from 'react';
import type { EditorTool } from '../types/editor';

interface UseKeyboardShortcutsOptions {
  selectedId: string | null;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onDeselect: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSelectTool: (tool: EditorTool) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable
  );
}

export function useKeyboardShortcuts({
  selectedId,
  onDeleteSelected,
  onDuplicateSelected,
  onDeselect,
  onUndo,
  onRedo,
  onSelectTool,
}: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (ctrlOrMeta && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
        return;
      }

      if (ctrlOrMeta && key === 'y') {
        e.preventDefault();
        onRedo();
        return;
      }

      if (ctrlOrMeta && key === 'd') {
        if (selectedId) {
          e.preventDefault();
          onDuplicateSelected();
        }
        return;
      }

      if (e.key === 'Escape') {
        onDeselect();
        onSelectTool('select');
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          e.preventDefault();
          onDeleteSelected();
        }
        return;
      }

      if (!ctrlOrMeta && !e.altKey) {
        if (key === 'q') onSelectTool('select');
        else if (key === 'w') onSelectTool('move');
        else if (key === 'e') onSelectTool('rotate');
        else if (key === 'r') onSelectTool('scale');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedId,
    onDeleteSelected,
    onDuplicateSelected,
    onDeselect,
    onUndo,
    onRedo,
    onSelectTool,
  ]);
}