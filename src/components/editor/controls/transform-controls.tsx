import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'

type TransformControlsProps = {
  meshOutlineVisible: boolean
  setMeshOutlineVisible: (visible: boolean) => void
}

export const TransformControls = ({
  meshOutlineVisible,
  setMeshOutlineVisible,
}: TransformControlsProps) => {
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
      </CardContent>
    </Card>
  )
}
