import type { Vector3 } from 'three'

export type EditorState = 'view' | 'landmarks' | 'transforms'

export interface SelectedPoint {
  position: Vector3
  normal: Vector3
  id: number
}

export type MeshViewType = 'solid' | 'wireframe' | 'normals'
export const MeshViewLabels: Record<MeshViewType, string> = {
  solid: 'Solid',
  wireframe: 'Wireframe',
  normals: 'Normals',
}
