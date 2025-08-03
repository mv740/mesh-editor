import { MeshHistoryProvider } from './components/editor/history/mesh-history-provider'

import {
  MeshEditorInner,
  type MeshEditorProps,
} from './components/editor/mesh-editor-inner'

export function MeshEditor(props: MeshEditorProps) {
  return (
    <MeshHistoryProvider>
      <MeshEditorInner {...props} />
    </MeshHistoryProvider>
  )
}
