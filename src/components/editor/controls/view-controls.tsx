import { Minimize2Icon, SettingsIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'

type ViewControlsProps = {
  opacity: number
  setOpacity: (opacity: number) => void
  landmarksVisible: boolean
  setLandmarksVisible: (visible: boolean) => void
  landmarkLabelsVisible: boolean
  setLandmarkLabelsVisible: (visible: boolean) => void
  holesVisible: boolean
  setHolesVisible: (visible: boolean) => void
}

export const ViewControls = ({
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
