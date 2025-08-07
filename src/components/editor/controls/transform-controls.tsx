import { Mesh, MeshBasicMaterial } from 'three'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { useMeshHistory } from '../history/mesh-history-provider'
import { optimizedBvhClip } from '../utils/geometry-utils'

type TransformControlsProps = {
  meshOutlineVisible: boolean
  setMeshOutlineVisible: (visible: boolean) => void
}

export const TransformControls = ({
  meshOutlineVisible,
  setMeshOutlineVisible,
}: TransformControlsProps) => {
  const { addToHistory, currentState, currentIndex } = useMeshHistory()
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
            // Placeholder for apply transform logic
            console.log('Apply transform clicked')
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
      </CardContent>
    </Card>
  )
}
