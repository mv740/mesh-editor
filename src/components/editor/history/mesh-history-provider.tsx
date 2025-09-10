import { createContext, useContext, useState } from 'react'
import { createInitialClipPlane } from '../transform/clip-transform'
import type { SelectedPoint } from '../type'
import type { BufferGeometry, Plane } from 'three'

export type MeshState = {
  selectedPoints: SelectedPoint[]
  meshGeometry: BufferGeometry
  filledHolesGeometry?: {
    boundaryEdgesMesh?: BufferGeometry
    triangulatedFilledHoleMesh?: BufferGeometry
  }

  clipPlane?: Plane
}

type ActionType =
  | 'initialize'
  | 'addPoint'
  | 'deletePoint'
  | 'movePoint'
  | 'moveClipPlane'
  | 'clipTransform'
  | 'fillHoleTransform'

export type MeshHistoryEntry = {
  state: MeshState
  actionType: ActionType
  timestamp: Date
  description?: string
}

interface MeshHistoryContextType {
  history: MeshHistoryEntry[]
  currentIndex: number
  currentState: MeshState
  addToHistory: (
    state: MeshState,
    actionType: ActionType,
    description?: string,
  ) => void
  undo: () => void
  redo: () => void
  jumpToHistory: (index: number) => void
  canUndo: boolean
  canRedo: boolean
}

const MeshHistoryContext = createContext<MeshHistoryContextType | undefined>(
  undefined,
)

export const MeshHistoryProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [history, setHistory] = useState<MeshHistoryEntry[]>([])
  const [currentIndex, setCurrentIndex] = useState<number>(-1)

  const defaultState: MeshState = {
    selectedPoints: [],
    meshGeometry: undefined as any,
    // Use a fresh plane instance for the default state
    clipPlane: createInitialClipPlane(),
  }
  const currentState =
    currentIndex >= 0 ? history[currentIndex].state : defaultState

  const addToHistory = (
    state: MeshState,
    actionType: ActionType,
    description?: string,
  ) => {
    let meshGeometry = state.meshGeometry
    if (actionType === 'clipTransform' && meshGeometry) {
      // Deep clone geometry for clipTransform actions
      meshGeometry = meshGeometry.clone()
    }
    const entry: MeshHistoryEntry = {
      state: {
        ...state,
        meshGeometry,
      },
      actionType,
      description,
      timestamp: new Date(),
    }
    // If we've undone, discard future states
    const newHistory = [...history.slice(0, currentIndex + 1), entry]
    setHistory(newHistory)
    setCurrentIndex(newHistory.length - 1)
  }

  const undo = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1)
  }

  const redo = () => {
    if (currentIndex < history.length - 1) setCurrentIndex(currentIndex + 1)
  }

  const jumpToHistory = (index: number) => {
    if (index >= 0 && index < history.length) setCurrentIndex(index)
  }

  return (
    <MeshHistoryContext.Provider
      value={{
        history,
        currentIndex,
        currentState,
        addToHistory,
        undo,
        redo,
        jumpToHistory,
        canUndo: currentIndex > 0,
        canRedo: currentIndex < history.length - 1,
      }}
    >
      {children}
    </MeshHistoryContext.Provider>
  )
}

export const useMeshHistory = (): MeshHistoryContextType => {
  const ctx = useContext(MeshHistoryContext)
  if (ctx === undefined)
    throw new Error('useMeshHistory must be used within <MeshHistoryProvider>')
  return ctx
}
