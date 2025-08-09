import { Mesh, MeshBasicMaterial, type LineSegments } from 'three'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { useMeshHistory } from '../history/mesh-history-provider'
import {
  createBoundaryEdgesMesh,
  fillGeometryHoles,
} from '../utils/fille-holes'
import { optimizedBvhClip } from '../utils/mesh-operation-utils'
type TransformControlsProps = {
  meshOutlineVisible: boolean
  setMeshOutlineVisible: (visible: boolean) => void
}

export const TransformControls = ({
  meshOutlineVisible,
  setMeshOutlineVisible,
}: TransformControlsProps) => {
  const { addToHistory, currentState } = useMeshHistory()
  return (
    <Card className="w-full max-w-xs sm:min-w-[350px] h-[200px] md:h-[300px] lg:h-[450px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle data-testid="landmark-control-title">
            Transform Controls
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col p-4 overflow-hidden">
        <div className="flex items-center gap-2">
          <Label htmlFor="mesh-outline-labels">Mesh Outline Labels:</Label>
          <Switch
            id="mesh-outline-labels"
            checked={meshOutlineVisible}
            onCheckedChange={setMeshOutlineVisible}
          />
        </div>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => {
            if (currentState.clipPlane && currentState.meshGeometry) {
              const mesh = new Mesh(
                currentState.meshGeometry,
                new MeshBasicMaterial(),
              )
              const meshClipped = optimizedBvhClip(
                mesh,
                currentState.clipPlane,
                true,
              )
              addToHistory(
                {
                  ...currentState,
                  meshGeometry: meshClipped.geometry,
                  clipPlane: currentState.clipPlane,
                },
                'clipTransform',
                'Applied clipping transform',
              )
            }
          }}
        >
          Apply Transform
        </Button>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => {
            if (currentState.meshGeometry) {
              const geometry = currentState.meshGeometry.clone()

              // test
              const fillTest = fillGeometryHoles(geometry)
              let edgeMesh: LineSegments | undefined
              if (fillTest?.boundaryResult) {
                edgeMesh = createBoundaryEdgesMesh(
                  fillTest?.boundaryResult,
                  'red',
                )
              }
              addToHistory(
                {
                  ...currentState,
                  meshGeometry: fillTest?.output ? fillTest.output : undefined,
                  filledHolesGeometry: {
                    triangulatedFilledHoleMesh: fillTest
                      ? fillTest.triangulatedFilledHoleMesh
                      : undefined,
                    boundaryEdgesMesh: edgeMesh ? edgeMesh.geometry : undefined,
                  },

                  clipPlane: currentState.clipPlane,
                },
                'fillHoleTransform',
                fillTest?.boundaryResult
                  ? 'Applied fill hole transform'
                  : 'No boundary edges found',
              )
            }
          }}
        >
          Apply Fill hole Transform
        </Button>
      </CardContent>
    </Card>
  )
}
