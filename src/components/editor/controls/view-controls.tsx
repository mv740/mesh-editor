import { Minimize2Icon, SettingsIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

type ViewControlsProps = {
  wireframeVisible: boolean
  setWireframeVisible: (visible: boolean) => void
  opacity: number
  setOpacity: (opacity: number) => void
  landmarksVisible: boolean
  setLandmarksVisible: (visible: boolean) => void
  landmarkLabelsVisible: boolean
  setLandmarkLabelsVisible: (visible: boolean) => void
  holesVisible: boolean
  setHolesVisible: (visible: boolean) => void
}

/**
 * Renders view controls for adjusting the view of the mesh editor.
 *
 * @component
 * @param {object} props - The component props
 * @param {boolean} props.wireframeVisible - Indicates whether wireframe is currently visible
 * @param {Function} props.setWireframeVisible - Callback to toggle wireframe visibility
 * @param {number} props.opacity - Current opacity value (0-1)
 * @param {Function} props.setOpacity - Callback to update opacity value
 * @param {boolean} props.landmarksVisible - Indicates whether landmarks are currently visible
 * @param {Function} props.setLandmarksVisible - Callback to toggle landmarks visibility
 * @param {boolean} props.landmarkLabelsVisible - Indicates whether landmark labels are currently visible
 * @param {Function} props.setLandmarkLabelsVisible - Callback to toggle landmark labels visibility
 * @returns {React.ReactElement} A card with switches and slider for view control settings
 */
export const ViewControls = ({
  wireframeVisible,
  setWireframeVisible,
  opacity,
  setOpacity,
  landmarksVisible,
  setLandmarksVisible,
  landmarkLabelsVisible,
  setLandmarkLabelsVisible,
  holesVisible,
  setHolesVisible,
}: ViewControlsProps) => {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!isExpanded) {
    return (
      <Button
        size="icon"
        className="size-10 absolute  right-5 bottom-5 z-50"
        onClick={() => setIsExpanded(true)}
      >
        <SettingsIcon className="size-5" />
      </Button>
    )
  }

  return (
    <Card className="w-full max-w-xs sm:min-w-[350px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle data-testid="view-control-title">View Controls</CardTitle>
          <Button
            size="icon"
            className="size-6"
            onClick={() => setIsExpanded(false)}
          >
            <Minimize2Icon />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="wireframe">Wireframe:</Label>
            <Switch
              id="wireframe"
              checked={wireframeVisible}
              onCheckedChange={setWireframeVisible}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="opacity">Opacity:</Label>
            <Slider
              id="opacity"
              min={0}
              max={1}
              step={0.01}
              value={[opacity]}
              onValueChange={([value]) => setOpacity(value)}
              about="opacity"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="landmarks">Landmarks:</Label>
            <Switch
              id="landmarks"
              checked={landmarksVisible}
              onCheckedChange={setLandmarksVisible}
            />
          </div>
          {landmarksVisible && (
            <div className="flex items-center gap-2">
              <Label htmlFor="landmark-labels">Landmark Labels:</Label>
              <Switch
                id="landmark-labels"
                checked={landmarkLabelsVisible}
                onCheckedChange={setLandmarkLabelsVisible}
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Label htmlFor="holes">Holes:</Label>
            <Switch
              id="holes"
              checked={holesVisible}
              onCheckedChange={setHolesVisible}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
