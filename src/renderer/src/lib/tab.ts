import { createContext, useContext, useMemo } from 'react'
import type { Block } from '@shared/types'
import { useStore, type TabState } from '@renderer/store'

/** Carries the tab id down to the components inside one mounted Reader, so the
 * existing components read/write the store scoped to their own tab. */
export const TabIdContext = createContext<string>('')

export function useTabId(): string {
  return useContext(TabIdContext)
}

/** Select from the current tab's slice (tolerates a missing/closing tab). */
export function useTab<R>(selector: (t: TabState | undefined) => R): R {
  const id = useTabId()
  return useStore((s) => selector(s.tabs[id]))
}

export interface TabActions {
  setBlocks: (blocks: Block[]) => void
  updateBlock: (id: string, patch: Partial<Block>, record?: boolean) => void
  setActiveBlock: (id: string | null) => void
  setHoverBlock: (id: string | null) => void
  selectBlock: (id: string, additive: boolean, range?: boolean) => void
  clearSelection: () => void
  toggleNotes: () => void
  toggleRefs: () => void
  toggleAutoTranslate: () => void
  setNote: (doc: unknown, images: string[]) => void
  undo: () => void
  redo: () => void
  save: () => Promise<void>
  saveAs: () => Promise<void>
  renameProject: (title: string) => Promise<void>
}

/** Tab-bound actions with the original (tab-less) signatures. */
export function useTabActions(): TabActions {
  const id = useTabId()
  return useMemo<TabActions>(() => {
    const s = (): ReturnType<typeof useStore.getState> => useStore.getState()
    return {
      setBlocks: (blocks) => s().setBlocks(id, blocks),
      updateBlock: (bid, patch, record) => s().updateBlock(id, bid, patch, record),
      setActiveBlock: (bid) => s().setActiveBlock(id, bid),
      setHoverBlock: (bid) => s().setHoverBlock(id, bid),
      selectBlock: (bid, additive, range) => s().selectBlock(id, bid, additive, range),
      clearSelection: () => s().clearSelection(id),
      toggleNotes: () => s().toggleNotes(id),
      toggleRefs: () => s().toggleRefs(id),
      toggleAutoTranslate: () => s().toggleAutoTranslate(id),
      setNote: (doc, images) => s().setNote(id, doc, images),
      undo: () => s().undo(id),
      redo: () => s().redo(id),
      save: () => s().save(id),
      saveAs: () => s().saveAs(id),
      renameProject: (title) => s().renameProject(id, title)
    }
  }, [id])
}
